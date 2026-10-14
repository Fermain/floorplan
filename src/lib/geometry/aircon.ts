import { AIRCON_BTUS, AIRCON_SIZES, DEFAULT_AIRCON_BTU } from '../model/fixtures'
import type { AirconBtu, Document, Fixture, Floor, PlanPoint } from '../model/types'
import { WALL_HEAD } from '../plot/fixture'
import { finishedFloor } from './fixtures'
import { cellAt, floorCells, layoutSpaces } from './spaces'

// Standard residential split air conditioning installation parameters (SANS 10142-1 / HVAC standards).
export const MAX_PRECHARGED_PIPE_M = 15
export const MAX_PIPE_M = 25
export const BTU_PER_KW = 3412.142

export type PlacedAircon = {
  floor: Floor
  fixture: Fixture
  btu: AirconBtu
}

export type AirconPair = {
  indoor: PlacedAircon
  outdoor: PlacedAircon
  direct: boolean
  pipeLength: number
  horizontal: number
  vertical: number
  path: PlanPoint[]
}

export type AirconIssue = {
  id: string
  text: string
  floorId?: string
  fixtureId?: string
}

export type AirconLayout = {
  indoors: PlacedAircon[]
  outdoors: PlacedAircon[]
  pairs: AirconPair[]
  unpairedIndoors: PlacedAircon[]
  unpairedOutdoors: PlacedAircon[]
  totalPipeLength: number
  totalCoolingBtu: number
  totalCoolingKw: number
  issues: AirconIssue[]
}

export function recommendedAirconBtu(areaM2: number): AirconBtu {
  for (const btu of AIRCON_BTUS) {
    if (areaM2 <= AIRCON_SIZES[btu].indoor.m2Max) return btu
  }
  return 24000
}

function worldY(floor: Floor, fixture: Fixture): number {
  return floor.datumHeight + finishedFloor(floor) + fixture.y
}

export function airconLayout(doc: Document): AirconLayout {
  const indoors: PlacedAircon[] = []
  const outdoors: PlacedAircon[] = []

  for (const floor of doc.building.floors) {
    for (const fixture of floor.fixtures ?? []) {
      if (fixture.kind === 'aircon-indoor') {
        indoors.push({ floor, fixture, btu: fixture.btu ?? DEFAULT_AIRCON_BTU })
      } else if (fixture.kind === 'aircon-outdoor') {
        outdoors.push({ floor, fixture, btu: fixture.btu ?? DEFAULT_AIRCON_BTU })
      }
    }
  }

  const remainingOutdoors = [...outdoors]
  const pairs: AirconPair[] = []
  const unpairedIndoors: PlacedAircon[] = []

  for (const indoor of indoors) {
    if (remainingOutdoors.length === 0) {
      unpairedIndoors.push(indoor)
      continue
    }

    // Find best matching outdoor unit: direct back-to-back first, then nearest 3D distance.
    let bestIdx = -1
    let bestDirect = false
    let bestDist = Infinity

    for (let i = 0; i < remainingOutdoors.length; i++) {
      const outdoor = remainingOutdoors[i]
      const dx = indoor.fixture.x - outdoor.fixture.x
      const dz = indoor.fixture.z - outdoor.fixture.z
      const planDist = Math.hypot(dx, dz)
      const dotFacing = indoor.fixture.dx * outdoor.fixture.dx + indoor.fixture.dz * outdoor.fixture.dz
      const direct = planDist <= 0.65 && dotFacing < -0.7

      const dy = Math.abs(worldY(indoor.floor, indoor.fixture) - worldY(outdoor.floor, outdoor.fixture))
      const dist = direct ? dy + 0.4 : planDist + dy

      if (direct && !bestDirect) {
        bestDirect = true
        bestDist = dist
        bestIdx = i
      } else if (direct === bestDirect && dist < bestDist) {
        bestDist = dist
        bestIdx = i
      }
    }

    if (bestIdx >= 0) {
      const outdoor = remainingOutdoors.splice(bestIdx, 1)[0]
      const inY = worldY(indoor.floor, indoor.fixture)
      const outY = worldY(outdoor.floor, outdoor.fixture)
      const dy = Math.abs(inY - outY)

      if (bestDirect) {
        // Back-to-back: straight penetration through the exterior wall
        const pipeLength = Math.round((dy + 0.4) * 10) / 10
        pairs.push({
          indoor,
          outdoor,
          direct: true,
          pipeLength,
          horizontal: Math.round(Math.hypot(indoor.fixture.x - outdoor.fixture.x, indoor.fixture.z - outdoor.fixture.z) * 10) / 10,
          vertical: Math.round(dy * 10) / 10,
          path: [
            { x: indoor.fixture.x, z: indoor.fixture.z },
            { x: outdoor.fixture.x, z: outdoor.fixture.z },
          ],
        })
      } else {
        // Run up wall to ceiling, across, and down exterior wall to outdoor condenser
        const up = Math.max(0, WALL_HEAD - indoor.fixture.y)
        const across = Math.abs(indoor.fixture.x - outdoor.fixture.x) + Math.abs(indoor.fixture.z - outdoor.fixture.z)
        const down = Math.abs((indoor.floor.datumHeight + WALL_HEAD) - outY)
        const pipeLength = Math.round((up + across + down + 0.4) * 10) / 10
        pairs.push({
          indoor,
          outdoor,
          direct: false,
          pipeLength,
          horizontal: Math.round(across * 10) / 10,
          vertical: Math.round((up + down) * 10) / 10,
          path: [
            { x: indoor.fixture.x, z: indoor.fixture.z },
            { x: outdoor.fixture.x, z: indoor.fixture.z },
            { x: outdoor.fixture.x, z: outdoor.fixture.z },
          ],
        })
      }
    } else {
      unpairedIndoors.push(indoor)
    }
  }

  const unpairedOutdoors = remainingOutdoors
  const issues: AirconIssue[] = []

  // Check unpaired units
  for (const indoor of unpairedIndoors) {
    const cells = floorCells(indoor.floor)
    const cell = cellAt(cells, indoor.fixture.x, indoor.fixture.z)
    const layout = cell ? layoutSpaces(indoor.floor) : null
    const space = cell && layout ? layout.spaces.find((s) => s.cells.includes(cell))?.space : null
    const roomName = space?.name ? `in ${space.name}` : ''
    issues.push({
      id: `aircon-no-outdoor-${indoor.fixture.id}`,
      text: `Indoor aircon ${roomName} has no outdoor compressor unit to connect to.`.replace('  ', ' '),
      floorId: indoor.floor.id,
      fixtureId: indoor.fixture.id,
    })
  }

  for (const outdoor of unpairedOutdoors) {
    issues.push({
      id: `aircon-no-indoor-${outdoor.fixture.id}`,
      text: 'Outdoor compressor unit has no indoor aircon connected.',
      floorId: outdoor.floor.id,
      fixtureId: outdoor.fixture.id,
    })
  }

  // Check pipe run length
  for (const pair of pairs) {
    if (pair.pipeLength > MAX_PRECHARGED_PIPE_M) {
      issues.push({
        id: `aircon-pipe-long-${pair.indoor.fixture.id}`,
        text: `Refrigerant pipe run of ${pair.pipeLength} m exceeds standard ${MAX_PRECHARGED_PIPE_M} m limit; requires additional refrigerant charge and oil trap.`,
        floorId: pair.indoor.floor.id,
        fixtureId: pair.indoor.fixture.id,
      })
    }
  }

  // Check cooling capacity against room floor area
  for (const indoor of indoors) {
    const cells = floorCells(indoor.floor)
    const cell = cellAt(cells, indoor.fixture.x, indoor.fixture.z)
    if (cell) {
      const layout = layoutSpaces(indoor.floor)
      const resolved = layout.spaces.find((s) => s.cells.includes(cell))
      const roomName = resolved?.space.name ?? 'Room'
      const area = resolved ? resolved.area : cell.netArea
      const maxArea = AIRCON_SIZES[indoor.btu].indoor.m2Max
      if (area > maxArea * 1.25) {
        const recommended = recommendedAirconBtu(area)
        issues.push({
          id: `aircon-undersized-${indoor.fixture.id}`,
          text: `${roomName} is ${Math.round(area)} m²; a ${indoor.btu.toLocaleString('en-US')} BTU unit cools up to ${maxArea} m² (recommended: ${recommended.toLocaleString('en-US')} BTU).`,
          floorId: indoor.floor.id,
          fixtureId: indoor.fixture.id,
        })
      }
    }
  }

  const totalPipeLength = pairs.reduce((sum, p) => sum + p.pipeLength, 0)
  const totalCoolingBtu = indoors.reduce((sum, item) => sum + item.btu, 0)
  const totalCoolingKw = Math.round((totalCoolingBtu / BTU_PER_KW) * 10) / 10

  return {
    indoors,
    outdoors,
    pairs,
    unpairedIndoors,
    unpairedOutdoors,
    totalPipeLength,
    totalCoolingBtu,
    totalCoolingKw,
    issues,
  }
}

export function airconIssues(doc: Document): AirconIssue[] {
  return airconLayout(doc).issues
}

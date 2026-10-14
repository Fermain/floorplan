import { AIRCON_BTUS, AIRCON_SIZES, DEFAULT_AIRCON_BTU } from '../model/fixtures'
import type { AirconBtu, Document, Fixture, Floor, PlanPoint } from '../model/types'
import { WALL_HEAD } from '../plot/fixture'
import { finishedFloor } from './fixtures'
import { cellAt, floorCells, layoutSpaces } from './spaces'

// Typical manufacturer split air conditioning installation parameters.
export const PRECHARGED_PIPE_LIMIT_M = 7.5
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
  condensateLength: number
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
  totalCondensateLength: number
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

  type Candidate = {
    indoorIdx: number
    outdoorIdx: number
    direct: boolean
    dist: number
    dy: number
    score: number
  }

  const candidates: Candidate[] = []
  for (let i = 0; i < indoors.length; i++) {
    const indoor = indoors[i]
    for (let j = 0; j < outdoors.length; j++) {
      const outdoor = outdoors[j]
      const dx = indoor.fixture.x - outdoor.fixture.x
      const dz = indoor.fixture.z - outdoor.fixture.z
      const planDist = Math.hypot(dx, dz)
      const dotFacing = indoor.fixture.dx * outdoor.fixture.dx + indoor.fixture.dz * outdoor.fixture.dz
      const direct = planDist <= 0.65 && dotFacing < -0.7
      const dy = Math.abs(worldY(indoor.floor, indoor.fixture) - worldY(outdoor.floor, outdoor.fixture))
      const dist = direct ? dy + 0.4 : planDist + dy
      const btuMatch = indoor.btu === outdoor.btu
      const btuPenalty = btuMatch ? 0 : 1000 + Math.abs(indoor.btu - outdoor.btu)
      const directBonus = direct ? -50 : 0
      const score = btuPenalty + directBonus + dist
      candidates.push({ indoorIdx: i, outdoorIdx: j, direct, dist, dy, score })
    }
  }

  candidates.sort((a, b) => a.score - b.score)

  const usedIndoors = new Set<number>()
  const usedOutdoors = new Set<number>()
  const pairs: AirconPair[] = []

  for (const cand of candidates) {
    if (usedIndoors.has(cand.indoorIdx) || usedOutdoors.has(cand.outdoorIdx)) continue
    usedIndoors.add(cand.indoorIdx)
    usedOutdoors.add(cand.outdoorIdx)

    const indoor = indoors[cand.indoorIdx]
    const outdoor = outdoors[cand.outdoorIdx]
    const outY = worldY(outdoor.floor, outdoor.fixture)
    const dy = cand.dy

    if (cand.direct) {
      const pipeLength = Math.round((dy + 0.4) * 10) / 10
      const condensateLength = Math.round((indoor.fixture.y + 0.5) * 10) / 10
      pairs.push({
        indoor,
        outdoor,
        direct: true,
        pipeLength,
        horizontal: Math.round(Math.hypot(indoor.fixture.x - outdoor.fixture.x, indoor.fixture.z - outdoor.fixture.z) * 10) / 10,
        vertical: Math.round(dy * 10) / 10,
        condensateLength,
        path: [
          { x: indoor.fixture.x, z: indoor.fixture.z },
          { x: outdoor.fixture.x, z: outdoor.fixture.z },
        ],
      })
    } else {
      const up = Math.max(0, WALL_HEAD - indoor.fixture.y)
      const across = Math.abs(indoor.fixture.x - outdoor.fixture.x) + Math.abs(indoor.fixture.z - outdoor.fixture.z)
      const down = Math.abs(indoor.floor.datumHeight + WALL_HEAD - outY)
      const pipeLength = Math.round((up + across + down + 0.4) * 10) / 10
      const condensateLength = Math.round((up + across + down + 0.4) * 10) / 10
      pairs.push({
        indoor,
        outdoor,
        direct: false,
        pipeLength,
        horizontal: Math.round(across * 10) / 10,
        vertical: Math.round((up + down) * 10) / 10,
        condensateLength,
        path: [
          { x: indoor.fixture.x, z: indoor.fixture.z },
          { x: outdoor.fixture.x, z: indoor.fixture.z },
          { x: outdoor.fixture.x, z: outdoor.fixture.z },
        ],
      })
    }
  }

  const unpairedIndoors = indoors.filter((_, idx) => !usedIndoors.has(idx))
  const unpairedOutdoors = outdoors.filter((_, idx) => !usedOutdoors.has(idx))
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

  // Check size mismatch between paired units
  for (const pair of pairs) {
    if (pair.indoor.btu !== pair.outdoor.btu) {
      issues.push({
        id: `aircon-size-mismatch-${pair.indoor.fixture.id}`,
        text: `Indoor unit (${pair.indoor.btu.toLocaleString('en-US')} BTU) is paired with a mismatched outdoor compressor (${pair.outdoor.btu.toLocaleString('en-US')} BTU). Split units should have matched ratings.`,
        floorId: pair.indoor.floor.id,
        fixtureId: pair.indoor.fixture.id,
      })
    }
  }

  // Check pipe run length
  for (const pair of pairs) {
    if (pair.pipeLength > MAX_PIPE_M) {
      issues.push({
        id: `aircon-pipe-max-${pair.indoor.fixture.id}`,
        text: `Refrigerant pipe run of ${pair.pipeLength} m exceeds maximum allowable ${MAX_PIPE_M} m limit. Move the outdoor unit closer.`,
        floorId: pair.indoor.floor.id,
        fixtureId: pair.indoor.fixture.id,
      })
    } else if (pair.pipeLength > PRECHARGED_PIPE_LIMIT_M) {
      issues.push({
        id: `aircon-pipe-long-${pair.indoor.fixture.id}`,
        text: `Refrigerant pipe run of ${pair.pipeLength} m exceeds standard pre-charged ${PRECHARGED_PIPE_LIMIT_M} m limit; requires additional refrigerant charge and oil trap.`,
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
  const totalCondensateLength = pairs.reduce((sum, p) => sum + p.condensateLength, 0)
  const totalCoolingBtu = indoors.reduce((sum, item) => sum + item.btu, 0)
  const totalCoolingKw = Math.round((totalCoolingBtu / BTU_PER_KW) * 10) / 10

  return {
    indoors,
    outdoors,
    pairs,
    unpairedIndoors,
    unpairedOutdoors,
    totalPipeLength,
    totalCondensateLength,
    totalCoolingBtu,
    totalCoolingKw,
    issues,
  }
}

export function airconIssues(doc: Document): AirconIssue[] {
  return airconLayout(doc).issues
}

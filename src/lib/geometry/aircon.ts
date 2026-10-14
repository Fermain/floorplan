import { AIRCON_BTUS, AIRCON_SIZES, DEFAULT_AIRCON_BTU, fixtureSize } from '../model/fixtures'
import { cornerById } from '../model/geom'
import type { AirconBtu, Document, Fixture, Floor, PlanPoint, Wall } from '../model/types'
import { WALL_HEAD } from '../plot/fixture'
import { outsideFaces } from './finishes'
import { finishedFloor, fixtureWall } from './fixtures'
import { wallReach } from './outline'
import { cellAt, floorCells, layoutSpaces, type Cell, type SpaceLayout, type WallSide } from './spaces'

// Typical manufacturer split air conditioning installation parameters.
export const PRECHARGED_PIPE_LIMIT_M = 7.5
export const MAX_PIPE_M = 25
export const BTU_PER_KW = 3412.142

export function formatBtu(btu: number): string {
  return `${btu.toLocaleString('en-ZA')} BTU`
}

export type PlacedAircon = {
  floor: Floor
  fixture: Fixture
  btu: AirconBtu
}

export type CondensateRoute = {
  exit: PlanPoint
  horizontal: number
  vertical: number
  length: number
  path: PlanPoint[]
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
  condensatePath: PlanPoint[]
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

export function airconCondensateRoute(
  floor: Floor,
  fixture: Fixture,
  outsideFacesFn?: (wall: Wall, side: WallSide) => boolean,
): CondensateRoute {
  const isOutside = outsideFacesFn ?? outsideFaces(floor)
  const backDir = { x: -fixture.dx, z: -fixture.dz }
  const depth = fixtureSize(fixture).depth
  const onWall = fixtureWall(floor, fixture)

  // 1. Direct penetration through the wall behind the unit if that wall face is outside
  if (onWall && isOutside(onWall.wall, (-onWall.side) as WallSide)) {
    const reach = wallReach(onWall.wall)
    const dist = depth / 2 + 2 * reach
    const exit: PlanPoint = {
      x: fixture.x + backDir.x * dist,
      z: fixture.z + backDir.z * dist,
    }
    const vertical = Math.max(0.5, fixture.y + floor.datumHeight)
    const length = Math.round((dist + vertical + 0.1) * 10) / 10
    return {
      exit,
      horizontal: Math.round(dist * 10) / 10,
      vertical: Math.round(vertical * 10) / 10,
      length,
      path: [{ x: fixture.x, z: fixture.z }, exit],
    }
  }

  // 2. Search exterior wall segments on this floor
  type WallHit = {
    exit: PlanPoint
    t: number
  }
  let bestHit: WallHit | null = null
  let nearestExtPoint: { point: PlanPoint; distSq: number } | null = null

  for (const wall of floor.walls) {
    if (wall.skin === 'logical') continue
    const a = cornerById(floor.corners, wall.startCornerId)
    const b = cornerById(floor.corners, wall.endCornerId)
    if (!a || !b) continue
    const length = Math.hypot(b.x - a.x, b.z - a.z)
    if (length < 1e-6) continue
    const tDir = { x: (b.x - a.x) / length, z: (b.z - a.z) / length }
    const normal = { x: -tDir.z, z: tDir.x }
    const reach = wallReach(wall)

    for (const side of [1, -1] as const) {
      if (!isOutside(wall, side)) continue

      const p1: PlanPoint = { x: a.x + normal.x * side * reach, z: a.z + normal.z * side * reach }
      const p2: PlanPoint = { x: b.x + normal.x * side * reach, z: b.z + normal.z * side * reach }
      const vx = p2.x - p1.x
      const vz = p2.z - p1.z

      // Ray-segment intersection from fixture along backDir
      // fixture.x + t * backDir.x = p1.x + s * vx
      // fixture.z + t * backDir.z = p1.z + s * vz
      const det = -backDir.x * vz + backDir.z * vx
      if (Math.abs(det) > 1e-6) {
        const dx = p1.x - fixture.x
        const dz = p1.z - fixture.z
        const t = (dx * (-vz) - dz * (-vx)) / det
        const s = (backDir.x * dz - backDir.z * dx) / det
        if (t > 0.05 && s >= -0.01 && s <= 1.01) {
          if (!bestHit || t < bestHit.t) {
            bestHit = {
              exit: {
                x: p1.x + Math.max(0, Math.min(1, s)) * vx + normal.x * side * 0.05,
                z: p1.z + Math.max(0, Math.min(1, s)) * vz + normal.z * side * 0.05,
              },
              t,
            }
          }
        }
      }

      // Track closest point on exterior face as fallback
      const segLenSq = vx * vx + vz * vz
      const u = segLenSq > 1e-6 ? Math.max(0, Math.min(1, ((fixture.x - p1.x) * vx + (fixture.z - p1.z) * vz) / segLenSq)) : 0
      const projX = p1.x + u * vx + normal.x * side * 0.05
      const projZ = p1.z + u * vz + normal.z * side * 0.05
      const distSq = (fixture.x - projX) ** 2 + (fixture.z - projZ) ** 2
      if (!nearestExtPoint || distSq < nearestExtPoint.distSq) {
        nearestExtPoint = { point: { x: projX, z: projZ }, distSq }
      }
    }
  }

  const exit = bestHit ? bestHit.exit : (nearestExtPoint ? nearestExtPoint.point : { x: fixture.x + backDir.x * 0.5, z: fixture.z + backDir.z * 0.5 })
  const horizontal = Math.round(Math.hypot(exit.x - fixture.x, exit.z - fixture.z) * 10) / 10
  const vertical = Math.round(Math.max(0.5, fixture.y + floor.datumHeight) * 10) / 10
  const length = Math.round((horizontal + vertical + 0.1) * 10) / 10

  return {
    exit,
    horizontal,
    vertical,
    length,
    path: [{ x: fixture.x, z: fixture.z }, exit],
  }
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

  const outsideCache = new Map<string, (wall: Wall, side: WallSide) => boolean>()
  const getOutside = (floor: Floor) => {
    let fn = outsideCache.get(floor.id)
    if (!fn) {
      fn = outsideFaces(floor)
      outsideCache.set(floor.id, fn)
    }
    return fn
  }

  for (const cand of candidates) {
    if (usedIndoors.has(cand.indoorIdx) || usedOutdoors.has(cand.outdoorIdx)) continue
    usedIndoors.add(cand.indoorIdx)
    usedOutdoors.add(cand.outdoorIdx)

    const indoor = indoors[cand.indoorIdx]
    const outdoor = outdoors[cand.outdoorIdx]
    const outY = worldY(outdoor.floor, outdoor.fixture)
    const dy = cand.dy
    const condensate = airconCondensateRoute(indoor.floor, indoor.fixture, getOutside(indoor.floor))

    if (cand.direct) {
      const pipeLength = Math.round((dy + 0.4) * 10) / 10
      pairs.push({
        indoor,
        outdoor,
        direct: true,
        pipeLength,
        horizontal: Math.round(Math.hypot(indoor.fixture.x - outdoor.fixture.x, indoor.fixture.z - outdoor.fixture.z) * 10) / 10,
        vertical: Math.round(dy * 10) / 10,
        condensateLength: condensate.length,
        path: [
          { x: indoor.fixture.x, z: indoor.fixture.z },
          { x: outdoor.fixture.x, z: outdoor.fixture.z },
        ],
        condensatePath: condensate.path,
      })
    } else {
      const up = Math.max(0, WALL_HEAD - indoor.fixture.y)
      const across = Math.abs(indoor.fixture.x - outdoor.fixture.x) + Math.abs(indoor.fixture.z - outdoor.fixture.z)
      const down = Math.abs(indoor.floor.datumHeight + WALL_HEAD - outY)
      const pipeLength = Math.round((up + across + down + 0.4) * 10) / 10
      pairs.push({
        indoor,
        outdoor,
        direct: false,
        pipeLength,
        horizontal: Math.round(across * 10) / 10,
        vertical: Math.round((up + down) * 10) / 10,
        condensateLength: condensate.length,
        path: [
          { x: indoor.fixture.x, z: indoor.fixture.z },
          { x: outdoor.fixture.x, z: indoor.fixture.z },
          { x: outdoor.fixture.x, z: outdoor.fixture.z },
        ],
        condensatePath: condensate.path,
      })
    }
  }

  const unpairedIndoors = indoors.filter((_, idx) => !usedIndoors.has(idx))
  const unpairedOutdoors = outdoors.filter((_, idx) => !usedOutdoors.has(idx))
  const issues: AirconIssue[] = []

  const floorLayoutCache = new Map<string, { cells: Cell[]; layout: SpaceLayout }>()
  const getFloorLayout = (floor: Floor) => {
    let entry = floorLayoutCache.get(floor.id)
    if (!entry) {
      entry = { cells: floorCells(floor), layout: layoutSpaces(floor) }
      floorLayoutCache.set(floor.id, entry)
    }
    return entry
  }

  // Check unpaired units
  for (const indoor of unpairedIndoors) {
    const { cells, layout } = getFloorLayout(indoor.floor)
    const cell = cellAt(cells, indoor.fixture.x, indoor.fixture.z)
    const space = cell ? layout.spaces.find((s) => s.cells.includes(cell))?.space : null
    const roomSuffix = space?.name ? ` in ${space.name}` : ''
    issues.push({
      id: `aircon-no-outdoor-${indoor.fixture.id}`,
      text: `Indoor aircon${roomSuffix} has no outdoor compressor unit to connect to.`,
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
        text: `Indoor unit (${formatBtu(pair.indoor.btu)}) is paired with a mismatched outdoor compressor (${formatBtu(pair.outdoor.btu)}). Split units should have matched ratings.`,
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
    const { cells, layout } = getFloorLayout(indoor.floor)
    const cell = cellAt(cells, indoor.fixture.x, indoor.fixture.z)
    if (cell) {
      const resolved = layout.spaces.find((s) => s.cells.includes(cell))
      const roomName = resolved?.space.name ?? 'Room'
      const area = resolved ? resolved.area : cell.netArea
      const maxArea = AIRCON_SIZES[indoor.btu].indoor.m2Max
      if (area > maxArea * 1.25) {
        const recommended = recommendedAirconBtu(area)
        issues.push({
          id: `aircon-undersized-${indoor.fixture.id}`,
          text: `${roomName} is ${Math.round(area)} m²; a ${formatBtu(indoor.btu)} unit cools up to ${maxArea} m² (recommended: ${formatBtu(recommended)}).`,
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

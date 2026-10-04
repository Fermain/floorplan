import type { Document, Floor, Opening, Wall } from '../model/types'
import { outsideFaces } from './finishes'
import { openingFrameLayout } from './frames'
import { wallBetween } from './outline'
import type { Ring } from './pad'
import { isHabitable, layoutSpaces, type Cell, type ResolvedSpace } from './spaces'
import { systemOf } from '../model/systems'

export const LIGHT_MIN_RATIO = 0.1
export const VENTILATION_MIN_RATIO = 0.05
export const OPENABLE_FRACTION = 0.5
export const HABITABLE_MIN_AREA_M2 = 6
export const HABITABLE_MIN_WIDTH_M = 2
export const FENESTRATION_MAX_RATIO = 0.15

export type CheckId = 'light' | 'ventilation' | 'area' | 'width'

export type RoomCheck = {
  id: CheckId
  part: 'O' | 'C'
  label: string
  measured: number
  required: number
  unit: '%' | 'm²' | 'm'
  ok: boolean
}

export type RoomChecks = {
  floorId: string
  spaceId: string
  glazed: number
  openable: number
  checks: RoomCheck[]
  ok: boolean
}

export type BuildingChecks = {
  rooms: RoomChecks[]
  fenestration: { glazed: number; floor: number; ratio: number; ok: boolean } | null
}

function glazedArea(opening: Opening, courseHeight: number): number {
  if (opening.kind === 'portal') return opening.width * opening.height
  if (opening.kind !== 'window' && opening.kind !== 'door') return 0
  const layout = openingFrameLayout(opening, courseHeight)
  if (!layout) return 0
  return layout.glass.reduce((sum, pane) => sum + (pane.u1 - pane.u0) * (pane.y1 - pane.y0), 0)
}

function openableArea(opening: Opening, glazed: number): number {
  if (opening.kind === 'portal') return glazed
  return glazed * OPENABLE_FRACTION
}

function cellWalls(floor: Floor, cell: Cell): Wall[] {
  const ids = cell.room.cornerIds
  const walls: Wall[] = []
  for (let i = 0; i < ids.length; i++) {
    const wall = wallBetween(floor, ids[i], ids[(i + 1) % ids.length])
    if (wall) walls.push(wall)
  }
  return walls
}

function exteriorWallIds(floor: Floor, cells: Cell[]): Set<string> {
  const seen = new Map<string, number>()
  for (const cell of cells) {
    for (const wall of cellWalls(floor, cell)) seen.set(wall.id, (seen.get(wall.id) ?? 0) + 1)
  }
  const exterior = new Set<string>()
  for (const [id, count] of seen) if (count === 1) exterior.add(id)
  // A wall onto a patio, a deck or a carport looks outside too: those are open to the air, and a window under a
  // patio roof still lights and airs the room behind it.
  const outside = outsideFaces(floor)
  for (const wall of floor.walls) {
    if (wall.skin !== 'logical' && (outside(wall, 1) || outside(wall, -1))) exterior.add(wall.id)
  }
  return exterior
}

function hull(points: Ring): Ring {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.z - b.z)
  const cross = (o: Ring[number], a: Ring[number], b: Ring[number]) =>
    (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x)
  const lower: Ring = []
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper: Ring = []
  for (const p of [...sorted].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop()
    upper.push(p)
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)]
}

export function minimumWidth(ring: Ring): number {
  const shape = hull(ring)
  if (shape.length < 3) return 0
  let best = Infinity
  for (let i = 0; i < shape.length; i++) {
    const a = shape[i]
    const b = shape[(i + 1) % shape.length]
    const length = Math.hypot(b.x - a.x, b.z - a.z)
    if (length < 1e-9) continue
    let far = 0
    for (const p of shape) {
      far = Math.max(far, Math.abs((b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x)) / length)
    }
    best = Math.min(best, far)
  }
  return Number.isFinite(best) ? best : 0
}

function check(
  id: CheckId,
  part: RoomCheck['part'],
  label: string,
  measured: number,
  required: number,
  unit: RoomCheck['unit'],
): RoomCheck {
  return { id, part, label, measured, required, unit, ok: measured >= required - 1e-9 }
}

function roomChecks(floor: Floor, resolved: ResolvedSpace, exterior: Set<string>): RoomChecks {
  const walls = new Map<string, Wall>()
  for (const cell of resolved.cells) {
    for (const wall of cellWalls(floor, cell)) {
      if (exterior.has(wall.id) && wall.skin !== 'logical') walls.set(wall.id, wall)
    }
  }
  let glazed = 0
  let openable = 0
  for (const wall of walls.values()) {
    const courseHeight = systemOf(wall).courseHeight
    for (const opening of wall.openings) {
      const area = glazedArea(opening, courseHeight)
      glazed += area
      openable += openableArea(opening, area)
    }
  }
  const area = resolved.area
  const width = Math.max(0, ...resolved.cells.map((cell) => minimumWidth(cell.net)))
  const checks = [
    check('light', 'O', 'Glazing for daylight', area > 0 ? (glazed / area) * 100 : 0, LIGHT_MIN_RATIO * 100, '%'),
    check(
      'ventilation',
      'O',
      'Opening for ventilation',
      area > 0 ? (openable / area) * 100 : 0,
      VENTILATION_MIN_RATIO * 100,
      '%',
    ),
    check('area', 'C', 'Floor area', area, HABITABLE_MIN_AREA_M2, 'm²'),
    check('width', 'C', 'Narrowest width', width, HABITABLE_MIN_WIDTH_M, 'm'),
  ]
  return {
    floorId: floor.id,
    spaceId: resolved.space.id,
    glazed,
    openable,
    checks,
    ok: checks.every((item) => item.ok),
  }
}

export function buildingChecks(doc: Document): BuildingChecks {
  const rooms: RoomChecks[] = []
  let glazedTotal = 0
  let floorTotal = 0
  for (const floor of doc.building.floors) {
    const layout = layoutSpaces(floor)
    const cells = [...layout.spaces.flatMap((resolved) => resolved.cells), ...layout.loose]
    const exterior = exteriorWallIds(floor, cells)
    floorTotal += cells.reduce((sum, cell) => sum + cell.netArea, 0)
    for (const wall of floor.walls) {
      if (!exterior.has(wall.id) || wall.skin === 'logical') continue
      const courseHeight = systemOf(wall).courseHeight
      for (const opening of wall.openings) glazedTotal += glazedArea(opening, courseHeight)
    }
    for (const resolved of layout.spaces) {
      if (!isHabitable(resolved.space.type)) continue
      rooms.push(roomChecks(floor, resolved, exterior))
    }
  }
  const fenestration =
    floorTotal > 0
      ? {
          glazed: glazedTotal,
          floor: floorTotal,
          ratio: glazedTotal / floorTotal,
          ok: glazedTotal / floorTotal <= FENESTRATION_MAX_RATIO + 1e-9,
        }
      : null
  return { rooms, fenestration }
}

export function checksForSpace(checks: BuildingChecks, spaceId: string): RoomChecks | undefined {
  return checks.rooms.find((room) => room.spaceId === spaceId)
}

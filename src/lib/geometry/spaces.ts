import { cornerById, signedPolygonArea } from '../model/geom'
import { deriveRooms } from '../model/rooms'
import type { DerivedRoom, Floor, RoomType, Space } from '../model/types'
import { offsetEdges, wallBetween, wallReach } from './outline'
import { pointInRing, type Ring } from './pad'

export type Cell = {
  room: DerivedRoom
  ring: Ring
  net: Ring
  netArea: number
}

export type ResolvedSpace = {
  space: Space
  cells: Cell[]
  area: number
}

export type SpaceLayout = {
  spaces: ResolvedSpace[]
  loose: Cell[]
}

export const ROOM_TYPES: { type: RoomType; label: string; habitable: boolean }[] = [
  { type: 'living', label: 'Living room', habitable: true },
  { type: 'bedroom', label: 'Bedroom', habitable: true },
  { type: 'kitchen', label: 'Kitchen', habitable: true },
  { type: 'dining', label: 'Dining room', habitable: true },
  { type: 'study', label: 'Study', habitable: true },
  { type: 'bathroom', label: 'Bathroom', habitable: false },
  { type: 'toilet', label: 'Toilet', habitable: false },
  { type: 'laundry', label: 'Laundry', habitable: false },
  { type: 'passage', label: 'Passage', habitable: false },
  { type: 'garage', label: 'Garage', habitable: false },
  { type: 'store', label: 'Store', habitable: false },
  // Outside, joined to the house: boarded, and open to the sky unless it is roofed over.
  { type: 'deck', label: 'Deck', habitable: false },
  { type: 'other', label: 'Other', habitable: false },
]

// The way a floor finish is laid in a room: along its longest wall, as an angle in plan from the x axis, so that
// boards and tiles run square to the room and not to the north point.
export function layAngle(ring: { x: number; z: number }[]): number {
  let best = 0
  let longest = 0
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    const length = Math.hypot(b.x - a.x, b.z - a.z)
    if (length > longest + 1e-6) {
      longest = length
      best = Math.atan2(b.z - a.z, b.x - a.x)
    }
  }
  // A lay is the same turned end for end, and one within a hair of square to the axes is square to them.
  const turned = ((best % Math.PI) + Math.PI) % Math.PI
  return Math.abs(turned - Math.PI) < 1e-4 ? 0 : turned
}

export function roomTypeLabel(type: RoomType): string {
  return ROOM_TYPES.find((item) => item.type === type)?.label ?? 'Room'
}

export function isHabitable(type: RoomType): boolean {
  return ROOM_TYPES.find((item) => item.type === type)?.habitable ?? false
}

function roomRing(floor: Floor, room: DerivedRoom): Ring {
  const ring: Ring = []
  for (const id of room.cornerIds) {
    const corner = cornerById(floor.corners, id)
    if (!corner) return []
    ring.push({ x: corner.x, z: corner.z })
  }
  return ring
}

function netRing(floor: Floor, room: DerivedRoom, ring: Ring): Ring {
  const ids = room.cornerIds
  const distances = ids.map((id, i) => -wallReach(wallBetween(floor, id, ids[(i + 1) % ids.length])))
  if (distances.every((distance) => distance === 0)) return ring
  return offsetEdges(ring, distances)
}

export function floorCells(floor: Floor): Cell[] {
  const cells: Cell[] = []
  for (const room of deriveRooms(floor)) {
    const ring = roomRing(floor, room)
    if (ring.length < 3) continue
    const net = netRing(floor, room, ring)
    const netArea = net.length >= 3 ? Math.abs(signedPolygonArea(net)) : 0
    cells.push({ room, ring, net, netArea })
  }
  return cells
}

export function cellAt(cells: Cell[], x: number, z: number): Cell | undefined {
  let best: Cell | undefined
  for (const cell of cells) {
    if (!pointInRing(cell.ring, x, z)) continue
    if (!best || Math.abs(cell.room.signedArea) < Math.abs(best.room.signedArea)) best = cell
  }
  return best
}

export function layoutSpaces(floor: Floor): SpaceLayout {
  const cells = floorCells(floor)
  const owner = new Map<Cell, Space>()
  for (const space of floor.spaces ?? []) {
    for (const seed of space.seeds) {
      const cell = cellAt(cells, seed.x, seed.z)
      if (cell && !owner.has(cell)) owner.set(cell, space)
    }
  }
  const spaces: ResolvedSpace[] = []
  for (const space of floor.spaces ?? []) {
    const mine = cells.filter((cell) => owner.get(cell) === space)
    if (mine.length === 0) continue
    spaces.push({ space, cells: mine, area: mine.reduce((sum, cell) => sum + cell.netArea, 0) })
  }
  return { spaces, loose: cells.filter((cell) => !owner.has(cell)) }
}

export function ringLabelPoint(ring: Ring): { x: number; z: number } {
  let area = 0
  let cx = 0
  let cz = 0
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    const cross = a.x * b.z - b.x * a.z
    area += cross
    cx += (a.x + b.x) * cross
    cz += (a.z + b.z) * cross
  }
  if (Math.abs(area) < 1e-9) return ring[0] ?? { x: 0, z: 0 }
  const centroid = { x: cx / (3 * area), z: cz / (3 * area) }
  return pointInRing(ring, centroid.x, centroid.z) ? centroid : (ring[0] ?? centroid)
}

export type WallSide = 1 | -1

export type WallFace = { side: WallSide; label: string; outside: boolean }

// Side 1 faces (-dz, dx) from the wall's start to its end; side -1 faces the other way.
export function wallFaces(floor: Floor, wallId: string): [WallFace, WallFace] | null {
  const wall = floor.walls.find((item) => item.id === wallId)
  if (!wall) return null
  const a = cornerById(floor.corners, wall.startCornerId)
  const b = cornerById(floor.corners, wall.endCornerId)
  if (!a || !b) return null
  const length = Math.hypot(b.x - a.x, b.z - a.z)
  if (length < 1e-9) return null
  const normal = { x: -(b.z - a.z) / length, z: (b.x - a.x) / length }
  const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 }
  const layout = layoutSpaces(floor)
  const cells = [...layout.loose, ...layout.spaces.flatMap((resolved) => resolved.cells)]
  const face = (side: WallSide): WallFace => {
    const cell = cellAt(cells, mid.x + normal.x * side * 0.05, mid.z + normal.z * side * 0.05)
    if (!cell) return { side, label: 'Outside', outside: true }
    const named = layout.spaces.find((resolved) => resolved.cells.includes(cell))
    return { side, label: named?.space.name ?? 'Inside', outside: false }
  }
  return [face(1), face(-1)]
}

// Focus opens an outside wall from outside, and any other wall from side 1.
export function defaultWallSide(faces: [WallFace, WallFace] | null): WallSide {
  if (!faces) return 1
  return faces[1].outside && !faces[0].outside ? -1 : 1
}

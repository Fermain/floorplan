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
  { type: 'other', label: 'Other', habitable: false },
]

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

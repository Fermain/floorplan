import { cornerById } from '../model/geom'
import { swingsOpen } from '../model/openings'
import type { Floor, Opening, RoomType, Wall } from '../model/types'
import { outsideFaces } from './finishes'
import { doorLeafCount, FRAME_SECTION } from './frames'
import { wallReach } from './outline'
import { cellAt, layoutSpaces, type WallSide } from './spaces'

type Point = { x: number; z: number }

// A door's leaf drawn open at a right angle to the wall, and the quarter circle its edge sweeps closing.
export type DoorSwing = { wallId: string; openingId: string; leaf: [Point, Point]; arc: Point[] }

export type FaceInfo = { outside: boolean; roomType?: RoomType }

// How much a room wants a door to open into it, so a door between a passage and a bedroom opens into the
// bedroom, not out into the passage.
export function roomDoorPriority(type: RoomType | undefined): number {
  if (!type) return 1
  switch (type) {
    case 'bathroom': return 9
    case 'store': return 8
    case 'laundry': return 7
    case 'bedroom': return 6
    case 'study': return 5
    case 'kitchen': return 4
    case 'dining': return 3
    case 'living': return 2
    case 'other': return 1
    case 'passage': return 0
    case 'toilet': return -0.5 // A small toilet door opens outward so a fallen person does not block it.
    case 'deck': return -1
    case 'garage': return 0
  }
}

// Pick the side a door opens to by default: inward from outside, or into the more private room between two rooms.
export function defaultDoorSwing(
  face1: FaceInfo,
  faceMinus1: FaceInfo,
): WallSide {
  if (face1.outside && !faceMinus1.outside) return -1
  if (faceMinus1.outside && !face1.outside) return 1
  if (face1.outside && faceMinus1.outside) return 1
  const p1 = roomDoorPriority(face1.roomType)
  const pMinus1 = roomDoorPriority(faceMinus1.roomType)
  if (p1 !== pMinus1) return p1 > pMinus1 ? 1 : -1
  return 1
}

// The way a door opens: as set, or else hung from the wall's start and opening inward, or into the more private room.
export function resolvedSwing(
  opening: Opening,
  outsideOrFace: ((side: WallSide) => boolean) | ((side: WallSide) => FaceInfo),
): { hinge: 'start' | 'end'; swing: WallSide } {
  const r1 = outsideOrFace(1)
  const rMinus1 = outsideOrFace(-1)
  const face1: FaceInfo = typeof r1 === 'boolean' ? { outside: r1 } : r1
  const faceMinus1: FaceInfo = typeof rMinus1 === 'boolean' ? { outside: rMinus1 } : rMinus1
  const fallback = defaultDoorSwing(face1, faceMinus1)
  return { hinge: opening.hinge ?? 'start', swing: opening.swing ?? fallback }
}

// Every hinged door on a storey, as it is drawn on the plan. A pair of leaves is hung one from each side.
export function doorSwings(floor: Floor): DoorSwing[] {
  const isOutside = outsideFaces(floor)
  const layout = layoutSpaces(floor)
  const cells = [...layout.loose, ...layout.spaces.flatMap((resolved) => resolved.cells)]
  const swings: DoorSwing[] = []
  for (const wall of floor.walls) {
    if (wall.skin === 'logical') continue
    const doors = wall.openings.filter((opening) => swingsOpen(opening.kind))
    if (doors.length === 0) continue
    const a = cornerById(floor.corners, wall.startCornerId)
    const b = cornerById(floor.corners, wall.endCornerId)
    if (!a || !b) continue
    const length = Math.hypot(b.x - a.x, b.z - a.z)
    if (length < 1e-9) continue
    const t = { x: (b.x - a.x) / length, z: (b.z - a.z) / length }
    const n = { x: -t.z, z: t.x }
    const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 }
    const faceInfo = (side: WallSide): FaceInfo => {
      const outside = isOutside(wall, side)
      if (outside) return { outside: true }
      const cell = cellAt(cells, mid.x + n.x * side * 0.05, mid.z + n.z * side * 0.05)
      const named = cell ? layout.spaces.find((resolved) => resolved.cells.includes(cell)) : undefined
      return { outside: false, roomType: named?.space.type }
    }
    for (const opening of doors) swings.push(...openingSwings(wall, opening, a, t, n, faceInfo))
  }
  return swings
}

function openingSwings(wall: Wall, opening: Opening, a: Point, t: Point, n: Point, outsideOrFace: ((side: WallSide) => boolean) | ((side: WallSide) => FaceInfo)): DoorSwing[] {
  const { hinge, swing } = resolvedSwing(opening, outsideOrFace)
  const reach = wallReach(wall)
  // Points on the face the door opens to, by distance along the wall.
  const on = (u: number, out = 0) => ({ x: a.x + t.x * u + n.x * swing * (reach + out), z: a.z + t.z * u + n.z * swing * (reach + out) })
  const [u0, u1] = [opening.u + FRAME_SECTION, opening.u + opening.width - FRAME_SECTION]
  const leaves = doorLeafCount(opening.kind, opening.width)
  // A pair of leaves meets in the middle; three or more are drawn as a pair.
  const hung: [number, number][] = leaves > 1 ? [[u0, (u0 + u1) / 2], [u1, (u0 + u1) / 2]] : hinge === 'start' ? [[u0, u1]] : [[u1, u0]]
  return hung.map(([from, to]) => {
    const width = Math.abs(to - from)
    const pivot = on(from)
    const open = on(from, width)
    const arc: Point[] = []
    for (let i = 0; i <= 16; i++) {
      const angle = (i / 16) * (Math.PI / 2)
      // From open, square to the wall, round to closed, lying along it.
      const along = Math.sin(angle) * width * Math.sign(to - from)
      const out = Math.cos(angle) * width
      arc.push(on(from + along, out))
    }
    return { wallId: wall.id, openingId: opening.id, leaf: [pivot, open], arc }
  })
}

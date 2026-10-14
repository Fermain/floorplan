import { cornerById } from '../model/geom'
import { swingsOpen } from '../model/openings'
import type { Floor, Opening, Wall } from '../model/types'
import { outsideFaces } from './finishes'
import { doorLeafCount, FRAME_SECTION } from './frames'
import { wallReach } from './outline'
import type { WallSide } from './spaces'

type Point = { x: number; z: number }

// A door's leaf drawn open at a right angle to the wall, and the quarter circle its edge sweeps closing.
export type DoorSwing = { wallId: string; openingId: string; leaf: [Point, Point]; arc: Point[] }

// The way a door opens: as set, or else hung from the wall's start and opening inward, or to side 1 between rooms.
export function resolvedSwing(opening: Opening, outside: (side: WallSide) => boolean): { hinge: 'start' | 'end'; swing: WallSide } {
  const fallback: WallSide = outside(1) && !outside(-1) ? -1 : 1
  return { hinge: opening.hinge ?? 'start', swing: opening.swing ?? fallback }
}

// Every hinged door on a storey, as it is drawn on the plan. A pair of leaves is hung one from each side.
export function doorSwings(floor: Floor): DoorSwing[] {
  const isOutside = outsideFaces(floor)
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
    for (const opening of doors) swings.push(...openingSwings(wall, opening, a, t, n, (side) => isOutside(wall, side)))
  }
  return swings
}

function openingSwings(wall: Wall, opening: Opening, a: Point, t: Point, n: Point, outside: (side: WallSide) => boolean): DoorSwing[] {
  const { hinge, swing } = resolvedSwing(opening, outside)
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

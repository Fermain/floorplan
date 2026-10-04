import { BoxGeometry, BufferGeometry, Matrix4, Vector3 } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import {
  counterKindSpec,
  counterRing,
  counterTopSpec,
  WALL_UNIT_BOTTOM_M,
  WALL_UNIT_DEPTH_M,
  WALL_UNIT_TOP_M,
  WORKTOP_M,
  WORKTOP_OVERHANG_M,
} from '../model/counters'
import { cornerById } from '../model/geom'
import { systemOf, wallThickness } from '../model/systems'
import type { Counter, CounterKind, Document, Floor } from '../model/types'

type Point = { x: number; z: number }

function pointInRing(ring: Point[], p: Point): boolean {
  let hit = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]
    const b = ring[j]
    if (a.z > p.z !== b.z > p.z && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) hit = !hit
  }
  return hit
}

// The counter under a point: the last drawn first.
export function counterAt(floor: Floor, p: Point): Counter | null {
  for (const counter of [...(floor.counters ?? [])].reverse()) {
    if (pointInRing(counterRing(counter), p)) return counter
  }
  return null
}

// A wall face a counter can stand against: a point on it, the way a counter runs along it with the room on its
// left, and how far the face goes each way from that point.
export type CounterFace = { wallId: string; point: Point; dir: Point; before: number; after: number }

// The face of a built wall nearest a point, within reach. The face is the side of the wall the point is on.
export function counterFace(floor: Floor, p: Point, reach: number): CounterFace | null {
  let best: (CounterFace & { d: number }) | null = null
  for (const wall of floor.walls) {
    if (wall.skin === 'logical') continue
    const a = cornerById(floor.corners, wall.startCornerId)
    const b = cornerById(floor.corners, wall.endCornerId)
    if (!a || !b) continue
    const length = Math.hypot(b.x - a.x, b.z - a.z)
    if (length < 1e-6) continue
    const t = { x: (b.x - a.x) / length, z: (b.z - a.z) / length }
    const n = { x: -t.z, z: t.x }
    const along = (p.x - a.x) * t.x + (p.z - a.z) * t.z
    const off = (p.x - a.x) * n.x + (p.z - a.z) * n.z
    if (along < -reach || along > length + reach) continue
    const half = wallThickness(systemOf(wall)) / 2
    const side = off >= 0 ? 1 : -1
    const d = Math.abs(Math.abs(off) - half)
    if (d > reach || (best && d >= best.d)) continue
    const u = Math.min(length, Math.max(0, along))
    // With the room on its left: along the wall on its +normal side, back along it on the other.
    const dir = side === 1 ? t : { x: -t.x, z: -t.z }
    best = {
      wallId: wall.id,
      point: { x: a.x + t.x * u + n.x * half * side, z: a.z + t.z * u + n.z * half * side },
      dir,
      before: side === 1 ? u : length - u,
      after: side === 1 ? length - u : u,
      d,
    }
  }
  if (!best) return null
  const { d: _d, ...face } = best
  return face
}

const step = (value: number) => Math.round(value * 20) / 20

// A counter run from where it was started on a face to the pointer: along the face, to the nearest 50 mm, and no
// further than the wall goes.
export function counterAlongFace(face: CounterFace, p: Point, depth: number): Pick<Counter, 'x' | 'z' | 'dx' | 'dz' | 'length' | 'depth'> {
  const raw = (p.x - face.point.x) * face.dir.x + (p.z - face.point.z) * face.dir.z
  const t = Math.max(-face.before, Math.min(face.after, step(raw)))
  const from = Math.min(0, t)
  return {
    x: face.point.x + face.dir.x * from,
    z: face.point.z + face.dir.z * from,
    dx: face.dir.x,
    dz: face.dir.z,
    length: Math.abs(t),
    depth,
  }
}

// A free-standing counter from one corner to the opposite one, square to the given direction.
export function counterBetween(a: Point, b: Point, axis: Point): Pick<Counter, 'x' | 'z' | 'dx' | 'dz' | 'length' | 'depth'> {
  const size = Math.hypot(axis.x, axis.z) || 1
  const u = { x: axis.x / size, z: axis.z / size }
  const v = { x: -u.z, z: u.x }
  const du = step((b.x - a.x) * u.x + (b.z - a.z) * u.z)
  const dv = step((b.x - a.x) * v.x + (b.z - a.z) * v.z)
  // Run along the longer side, with the depth out to the left of the run.
  const [long, short, dir] = Math.abs(du) >= Math.abs(dv) ? [du, dv, u] : [dv, -du, v]
  const out = { x: -dir.z, z: dir.x }
  const start = { x: a.x + (long < 0 ? dir.x * long : 0) + (short < 0 ? out.x * short : 0), z: a.z + (long < 0 ? dir.z * long : 0) + (short < 0 ? out.z * short : 0) }
  return { x: start.x, z: start.z, dx: dir.x, dz: dir.z, length: Math.abs(long), depth: Math.abs(short) }
}

export type CounterPart = { geometry: BufferGeometry; colour: string }

const CARCASS_COLOUR = '#ece8df'
const PLINTH_COLOUR = '#3f4448'
const PLINTH_M = 0.1

function slab(counter: Counter, back: number, front: number, y0: number, y1: number, endOver = 0): BufferGeometry {
  const dir = new Vector3(counter.dx, 0, counter.dz)
  const out = new Vector3(-counter.dz, 0, counter.dx)
  const geometry = new BoxGeometry(1, 1, 1)
  const matrix = new Matrix4().makeBasis(dir, new Vector3(0, 1, 0), out)
  matrix.scale(new Vector3(counter.length + endOver * 2, y1 - y0, front - back))
  matrix.setPosition(
    new Vector3(counter.x, 0, counter.z)
      .addScaledVector(dir, counter.length / 2)
      .addScaledVector(out, (back + front) / 2)
      .setY((y0 + y1) / 2),
  )
  geometry.applyMatrix4(matrix)
  return geometry
}

// The counters of a storey for Review, standing on its floor: a plinth, the cupboards, the worktop over them, and
// any cupboards on the wall above.
export function buildCounterParts(counters: Counter[], floorY: number): CounterPart[] {
  const groups = new Map<string, BufferGeometry[]>()
  const push = (colour: string, geometry: BufferGeometry) => groups.set(colour, [...(groups.get(colour) ?? []), geometry])
  for (const counter of counters) {
    const { height } = counterKindSpec(counter.kind)
    const top = floorY + height
    const free = counter.kind !== 'base'
    // A counter against a wall has its plinth set back at the front only; one standing free, on both sides.
    push(PLINTH_COLOUR, slab(counter, free ? 0.05 : 0, counter.depth - 0.05, floorY, floorY + PLINTH_M))
    push(CARCASS_COLOUR, slab(counter, 0, counter.depth, floorY + PLINTH_M, top - WORKTOP_M))
    push(counterTopSpec(counter.top).colour, slab(counter, free ? -WORKTOP_OVERHANG_M : 0, counter.depth + WORKTOP_OVERHANG_M, top - WORKTOP_M, top, free ? WORKTOP_OVERHANG_M : 0))
    if (counter.wallUnits) push(CARCASS_COLOUR, slab(counter, 0, WALL_UNIT_DEPTH_M, floorY + WALL_UNIT_BOTTOM_M, floorY + WALL_UNIT_TOP_M))
  }
  const parts: CounterPart[] = []
  for (const [colour, geometries] of groups) {
    const merged = mergeGeometries(geometries, false)
    for (const geometry of geometries) geometry.dispose()
    if (merged) parts.push({ geometry: merged, colour })
  }
  return parts
}

// What the counters of a house come to, for Quantities: cupboards by the metre of each kind, worktop by area of
// each material, and wall cupboards by the metre.
export function counterTotals(doc: Document): { units: Record<CounterKind, number>; tops: Record<Counter['top'], number>; wallUnits: number } {
  const totals = { units: { base: 0, island: 0, bar: 0 }, tops: { laminate: 0, granite: 0, timber: 0 }, wallUnits: 0 }
  for (const floor of doc.building.floors) {
    for (const counter of floor.counters ?? []) {
      totals.units[counter.kind] += counter.length
      totals.tops[counter.top] += counter.length * (counter.depth + WORKTOP_OVERHANG_M * (counter.kind === 'base' ? 1 : 2))
      if (counter.wallUnits) totals.wallUnits += counter.length
    }
  }
  return totals
}

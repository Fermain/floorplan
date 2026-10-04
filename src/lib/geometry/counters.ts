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
import { fixtureFootprint, fixtureSpec } from '../model/fixtures'
import type { Counter, CounterKind, Document, Fixture, FixtureKind, Floor } from '../model/types'

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

// Fittings that stand in a gap between counters: a counter stops at their sides rather than running through them.
export const COUNTER_STOPS: readonly FixtureKind[] = ['stove', 'gas-stove', 'washing-machine']
// Fittings that come with their own cupboard, which a counter butts up to or runs on from.
export const COUNTER_JOINS: readonly FixtureKind[] = ['sink']

// A stretch of a wall face taken up by a fitting standing against it, measured along the face from its point.
export type FaceSpan = { from: number; to: number; stop: boolean; kind: FixtureKind }

// A wall face a counter can stand against: a point on it, the way a counter runs along it with the room on its
// left, how far the face goes each way from that point, and the kitchen fittings standing against it.
export type CounterFace = { wallId: string; point: Point; dir: Point; before: number; after: number; spans: FaceSpan[] }

// Where a kitchen fitting sliding along a wall settles against the counters on that wall. It is given by how far
// its middle is along the wall from a point on the wall's face, the way along the wall and the way into the room.
// A stove or a washing machine stands beside a counter, never in it; a sink unit sits flush with a counter's end,
// inside it or butted up to it.
export function settleAgainstCounters(floor: Floor, kind: FixtureKind, origin: Point, along: Point, into: Point, at: number, half: number, snap = 0.2): number {
  const stop = COUNTER_STOPS.includes(kind)
  if (!stop && !COUNTER_JOINS.includes(kind)) return at
  let best: { s: number; d: number } | null = null
  const consider = (s: number) => {
    const d = Math.abs(s - at)
    if (d <= snap && (!best || d < best.d)) best = { s, d }
  }
  const runs: [number, number][] = []
  for (const counter of floor.counters ?? []) {
    if (counter.kind !== 'base') continue
    // On this wall: running along it, with its back on the face.
    if (Math.abs(counter.dx * along.z - counter.dz * along.x) > 0.02) continue
    const back = (counter.x - origin.x) * into.x + (counter.z - origin.z) * into.z
    if (Math.abs(back) > 0.15) continue
    const start = (counter.x - origin.x) * along.x + (counter.z - origin.z) * along.z
    const end = start + (counter.dx * along.x + counter.dz * along.z) * counter.length
    const [from, to] = [Math.min(start, end), Math.max(start, end)]
    runs.push([from, to])
    consider(from - half)
    consider(to + half)
    if (!stop) {
      consider(from + half)
      consider(to - half)
    }
  }
  let settled = (best as { s: number; d: number } | null)?.s ?? at
  if (stop) {
    // Dropped on a counter, it goes to the nearer end of it.
    for (const [from, to] of runs) {
      if (settled > from - half + 1e-6 && settled < to + half - 1e-6) settled = settled - (from - half) < to + half - settled ? from - half : to + half
    }
  }
  return settled
}

// The kitchen fittings standing against a face, as stretches along it.
function faceSpans(floor: Floor, point: Point, dir: Point): FaceSpan[] {
  const out = { x: -dir.z, z: dir.x }
  const spans: FaceSpan[] = []
  for (const fixture of floor.fixtures ?? []) {
    const stop = COUNTER_STOPS.includes(fixture.kind)
    if (!stop && !COUNTER_JOINS.includes(fixture.kind)) continue
    const ring = fixtureFootprint(fixture)
    const depths = ring.map((p) => (p.x - point.x) * out.x + (p.z - point.z) * out.z)
    // Against this face: its back within a hand's width of the face, and none of it behind the wall.
    if (Math.min(...depths) < -0.1 || Math.min(...depths) > 0.25) continue
    const along = ring.map((p) => (p.x - point.x) * dir.x + (p.z - point.z) * dir.z)
    spans.push({ from: Math.min(...along), to: Math.max(...along), stop, kind: fixture.kind })
  }
  return spans
}

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
      spans: [],
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
  return { ...face, spans: faceSpans(floor, face.point, face.dir) }
}

const step = (value: number) => Math.round(value * 20) / 20

// A counter run from where it was started on a face to the pointer: along the face, to the nearest 50 mm, and no
// further than the wall goes.
// It closes up to the side of a stove, a washing machine or a sink unit when it ends near one, and stops at a
// stove or a washing machine rather than running through it.
export function counterAlongFace(face: CounterFace, p: Point, depth: number, snap = 0.12): Pick<Counter, 'x' | 'z' | 'dx' | 'dz' | 'length' | 'depth'> {
  const raw = (p.x - face.point.x) * face.dir.x + (p.z - face.point.z) * face.dir.z
  let t = Math.max(-face.before, Math.min(face.after, step(raw)))
  const edges = face.spans.flatMap((span) => [span.from, span.to])
  const near = edges.filter((edge) => Math.abs(edge - raw) <= snap).sort((a, b) => Math.abs(a - raw) - Math.abs(b - raw))[0]
  if (near !== undefined) t = Math.max(-face.before, Math.min(face.after, near))
  // Stop at the near side of the first standing fitting in the way.
  for (const span of face.spans) {
    if (!span.stop) continue
    if (t > 0 && span.from >= -1e-6 && span.from < t) t = Math.min(t, span.from)
    if (t < 0 && span.to <= 1e-6 && span.to > t) t = Math.max(t, span.to)
  }
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

// A counter against a wall, picked up and carried: it goes to the wall face nearest the pointer and slides along
// it, keeping the point it was picked up by under the pointer, to the nearest 50 mm and no further than the wall.
export function counterCarried(floor: Floor, counter: Counter, pointer: Point, grabAlong: number, reach: number): Pick<Counter, 'x' | 'z' | 'dx' | 'dz'> | null {
  const face = counterFace(floor, pointer, reach)
  if (!face || face.before + face.after < counter.length - 1e-6) return null
  // In 50 mm steps from the end of the wall, so that it lands a round distance from the corner.
  const start = Math.max(-face.before, Math.min(face.after - counter.length, step(face.before - grabAlong) - face.before))
  return { x: face.point.x + face.dir.x * start, z: face.point.z + face.dir.z * start, dx: face.dir.x, dz: face.dir.z }
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

function ringsOverlap(a: Point[], b: Point[]): boolean {
  // Both are rectangles: they overlap unless one lies wholly to one side of an edge of the other.
  for (const [ring, other] of [[a, b], [b, a]] as const) {
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i]
      const q = ring[(i + 1) % ring.length]
      const n = { x: q.z - p.z, z: -(q.x - p.x) }
      const inside = (ring[(i + 2) % ring.length].x - p.x) * n.x + (ring[(i + 2) % ring.length].z - p.z) * n.z
      const sign = inside >= 0 ? 1 : -1
      if (other.every((o) => ((o.x - p.x) * n.x + (o.z - p.z) * n.z) * sign < 0.02)) return false
    }
  }
  return true
}

export type CounterIssue = { id: string; text: string; floorId: string }

// Counters that run through a fitting that should stand in a gap between them.
export function counterIssues(doc: Document): CounterIssue[] {
  const issues: CounterIssue[] = []
  for (const floor of doc.building.floors) {
    const standing = (floor.fixtures ?? []).filter((fixture: Fixture) => COUNTER_STOPS.includes(fixture.kind))
    for (const counter of floor.counters ?? []) {
      const ring = counterRing(counter)
      for (const fixture of standing) {
        if (!ringsOverlap(ring, fixtureFootprint(fixture))) continue
        issues.push({
          id: `counter:${counter.id}:${fixture.id}`,
          text: `A counter runs through the ${fixtureSpec(fixture.kind).name.toLowerCase()}. Stop the counter at its side, or move one of them.`,
          floorId: floor.id,
        })
      }
    }
  }
  return issues
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

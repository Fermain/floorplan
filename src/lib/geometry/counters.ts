import { BoxGeometry, BufferGeometry, Matrix4, Vector3 } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import {
  counterKindSpec,
  counterRing,
  counterUnder,
  counterTopSpec,
  cupboardBays,
  COUNTER_MIN_LENGTH_M,
  WALL_UNIT_BOTTOM_M,
  WALL_UNIT_DEPTH_M,
  WALL_UNIT_TOP_M,
  WORKTOP_M,
  WORKTOP_OVERHANG_M,
} from '../model/counters'
import { cornerById } from '../model/geom'
import { systemOf, wallThickness } from '../model/systems'
import { fixtureFootprint, fixtureSpec } from '../model/fixtures'
import { isFloorOpening } from '../model/openings'
import type { Counter, CounterKind, Document, Fixture, FixtureKind, Floor, Wall } from '../model/types'

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
export function settleAgainstCounters(floor: Floor, kind: FixtureKind, origin: Point, along: Point, into: Point, at: number, half: number, snap = 0.2, builtIn = false): number {
  // A built-in hob sits in the counter the way a sink does.
  const stop = COUNTER_STOPS.includes(kind) && !builtIn
  if (!stop && !COUNTER_JOINS.includes(kind) && !builtIn) return at
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
    const stop = COUNTER_STOPS.includes(fixture.kind) && !fixture.builtIn
    if (!stop && !COUNTER_JOINS.includes(fixture.kind) && !fixture.builtIn) continue
    const ring = fixtureFootprint(fixture)
    const depths = ring.map((p) => (p.x - point.x) * out.x + (p.z - point.z) * out.z)
    // Against this face: its back within a hand's width of the face, and none of it behind the wall.
    if (Math.min(...depths) < -0.1 || Math.min(...depths) > 0.25) continue
    const along = ring.map((p) => (p.x - point.x) * dir.x + (p.z - point.z) * dir.z)
    spans.push({ from: Math.min(...along), to: Math.max(...along), stop, kind: fixture.kind })
  }
  return spans
}

// How close to the corner of a face, or to the side of a kitchen fitting, a counter's start is pulled up to it.
export const COUNTER_START_SNAP_M = 0.15

// The stretches of a wall's face, as distances along the wall from its start corner, that other built walls stand
// across: at a corner, the wall the face runs into; along it, a wall meeting it from the room side.
function faceBlocks(floor: Floor, wallId: string, origin: Point, t: Point): [number, number][] {
  const blocks: [number, number][] = []
  for (const other of floor.walls) {
    if (other.id === wallId || other.skin === 'logical') continue
    const a = cornerById(floor.corners, other.startCornerId)
    const b = cornerById(floor.corners, other.endCornerId)
    if (!a || !b) continue
    const length = Math.hypot(b.x - a.x, b.z - a.z)
    if (length < 1e-6) continue
    const ot = { x: (b.x - a.x) / length, z: (b.z - a.z) / length }
    const on = { x: -ot.z, z: ot.x }
    const half = wallThickness(systemOf(other)) / 2
    // Where the face line is inside the other wall: along it between its ends, and across it within its faces.
    let [lo, hi] = [-Infinity, Infinity]
    for (const [axis, from, to] of [[ot, 0, length], [on, -half, half]] as const) {
      const v0 = (origin.x - a.x) * axis.x + (origin.z - a.z) * axis.z
      const k = t.x * axis.x + t.z * axis.z
      // A wall lying along the face line, such as the next length of the same wall, only touches it.
      if (Math.abs(k) < 1e-9) {
        if (v0 <= from + 1e-6 || v0 >= to - 1e-6) [lo, hi] = [1, 0]
        continue
      }
      const [u0, u1] = [(from - v0) / k, (to - v0) / k].sort((p, q) => p - q)
      lo = Math.max(lo, u0)
      hi = Math.min(hi, u1)
    }
    if (hi - lo > 1e-6) blocks.push([lo, hi])
  }
  return blocks
}

// The stretches of a face, as distances along the wall from its start corner, that counters already stand on: those
// along the face itself, and one along the next wall that fills the corner of an L.
function counterBlocks(floor: Floor, origin: Point, t: Point, into: Point, depth: number, ignore?: string): [number, number][] {
  const blocks: [number, number][] = []
  for (const counter of floor.counters ?? []) {
    if (counter.id === ignore) continue
    const ring = counterRing(counter)
    const across = ring.map((q) => (q.x - origin.x) * into.x + (q.z - origin.z) * into.z)
    if (Math.max(...across) < 1e-3 || Math.min(...across) > depth - 1e-3) continue
    const along = ring.map((q) => (q.x - origin.x) * t.x + (q.z - origin.z) * t.z)
    blocks.push([Math.min(...along), Math.max(...along)])
  }
  return blocks
}

// Room left beside a doorway for its frame and architrave, so that a counter stops clear of the door.
export const COUNTER_DOOR_CLEAR_M = 0.1

// The stretches of a wall, as distances along it from its start corner, that its own openings take from a counter:
// a door or other opening to the floor, with room for its architrave, and a window whose sill is below the counter or cupboard top.
function openingBlocks(wall: Wall, kind: CounterKind = 'base'): [number, number][] {
  const top = counterKindSpec(kind).height
  return wall.openings.flatMap((opening): [number, number][] => {
    if (isFloorOpening(opening.kind)) return [[opening.u - COUNTER_DOOR_CLEAR_M, opening.u + opening.width + COUNTER_DOOR_CLEAR_M]]
    return opening.v < top - 1e-3 ? [[opening.u, opening.u + opening.width]] : []
  })
}

// The face of a built wall nearest a point, within reach. The face is the side of the wall the point is on, and it
// runs between the walls, counters and doorways standing across it, so a counter ends flush with the face of the wall at a
// corner, or with the end of another counter, rather than running into it. A point within a hand's width of either
// end, or of the side of a kitchen fitting, is pulled up to it, so that a counter can start flush there. A counter
// being moved is left out, so it does not stand in its own way.
export function counterFace(floor: Floor, p: Point, reach: number, options: { snap?: number; ignore?: string; kind?: CounterKind; depth?: number } = {}): CounterFace | null {
  const snap = options.snap ?? COUNTER_START_SNAP_M
  let best: { wall: Wall; a: Point; t: Point; n: Point; length: number; half: number; side: 1 | -1; along: number; d: number } | null = null
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
    best = { wall, a, t, n, length, half, side, along, d }
  }
  if (!best) return null
  const { wall, a, t, n, length, half, side } = best
  const origin = { x: a.x + n.x * half * side, z: a.z + n.z * half * side }
  const deep = options.depth ?? (options.kind ? counterKindSpec(options.kind).depth : counterKindSpec('base').depth)
  const blocks = [
    ...faceBlocks(floor, wall.id, origin, t),
    ...openingBlocks(wall, options.kind ?? 'base'),
    ...counterBlocks(floor, origin, t, { x: n.x * side, z: n.z * side }, deep, options.ignore),
  ]
  // The free stretch of face a point is in, between the nearest things standing across the face either side of it.
  const stretch = (u: number) => {
    if (u < -1e-6 || u > length + 1e-6 || blocks.some(([from, to]) => u > from + 1e-6 && u < to - 1e-6)) return null
    const lo = Math.max(0, ...blocks.filter(([, end]) => end <= u + 1e-6).map(([, end]) => end))
    const hi = Math.min(length, ...blocks.filter(([from]) => from >= u - 1e-6).map(([from]) => from))
    return hi - lo > 1e-6 ? { lo, hi } : null
  }
  // A point inside a wall or a counter standing across the face is moved out to whichever end of it has free face
  // beyond, the nearer if both do.
  let u = Math.min(length, Math.max(0, best.along))
  if (!stretch(u)) {
    const ends = blocks.filter(([from, to]) => u >= from - 1e-6 && u <= to + 1e-6).flatMap(([from, to]) => [from, to])
    const free = ends.sort((q, r) => Math.abs(q - u) - Math.abs(r - u)).find((end) => stretch(end))
    if (free === undefined) return null
    u = free
  }
  const { lo, hi } = stretch(u)!
  if (u - lo <= snap) u = lo
  else if (hi - u <= snap) u = hi
  // With the room on its left: along the wall on its +normal side, back along it on the other.
  const dir = side === 1 ? t : { x: -t.x, z: -t.z }
  const at = (value: number) => ({ x: origin.x + t.x * value, z: origin.z + t.z * value })
  const extent = (value: number) => (side === 1 ? { before: value - lo, after: hi - value } : { before: hi - value, after: value - lo })
  let face: CounterFace = { wallId: wall.id, point: at(u), dir, ...extent(u), spans: [] }
  face = { ...face, spans: faceSpans(floor, face.point, face.dir) }
  // Away from the corners, a start close to the side of a fitting standing against the face is pulled up to it.
  if (u !== lo && u !== hi) {
    const edge = face.spans
      .flatMap((span) => [span.from, span.to])
      .filter((value) => Math.abs(value) <= snap && value >= -face.before && value <= face.after)
      .sort((q, r) => Math.abs(q) - Math.abs(r))[0]
    if (edge !== undefined && Math.abs(edge) > 1e-9) {
      const moved = u + edge * side
      face = { ...face, point: at(moved), ...extent(moved), spans: face.spans.map((span) => ({ ...span, from: span.from - edge, to: span.to - edge })) }
    }
  }
  return face
}

// The counters standing against one side of a wall, for showing on that wall in Focus.
export function countersOnWall(floor: Floor, wallId: string, side: 1 | -1): Counter[] {
  const wall = floor.walls.find((item) => item.id === wallId)
  const a = wall && cornerById(floor.corners, wall.startCornerId)
  const b = wall && cornerById(floor.corners, wall.endCornerId)
  if (!wall || !a || !b) return []
  const length = Math.hypot(b.x - a.x, b.z - a.z)
  if (length < 1e-6) return []
  const t = { x: (b.x - a.x) / length, z: (b.z - a.z) / length }
  const n = { x: -t.z * side, z: t.x * side }
  const half = wallThickness(systemOf(wall)) / 2
  return (floor.counters ?? []).filter((counter) => {
    if (counter.kind !== 'base' && counter.kind !== 'cupboard') return false
    // Its front faces away from this side of the wall, and its back is on the face.
    if (-counter.dz * n.x + counter.dx * n.z < 0.9) return false
    const mx = counter.x + (counter.dx * counter.length) / 2
    const mz = counter.z + (counter.dz * counter.length) / 2
    const along = (mx - a.x) * t.x + (mz - a.z) * t.z
    const off = (mx - a.x) * n.x + (mz - a.z) * n.z
    return along > -0.05 && along < length + 0.05 && Math.abs(off - half) < 0.12
  })
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
  const face = counterFace(floor, pointer, reach, { ignore: counter.id, kind: counter.kind, depth: counter.depth })
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
    const standing = (floor.fixtures ?? []).filter((fixture: Fixture) => COUNTER_STOPS.includes(fixture.kind) && !fixture.builtIn)
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

// A box in a counter's own frame: from one distance along it to another, from one depth out from its back to another.
function block(counter: Counter, from: number, to: number, back: number, front: number, y0: number, y1: number): BufferGeometry {
  const dir = new Vector3(counter.dx, 0, counter.dz)
  const out = new Vector3(-counter.dz, 0, counter.dx)
  const geometry = new BoxGeometry(1, 1, 1)
  const matrix = new Matrix4().makeBasis(dir, new Vector3(0, 1, 0), out)
  matrix.scale(new Vector3(to - from, y1 - y0, front - back))
  matrix.setPosition(
    new Vector3(counter.x, 0, counter.z)
      .addScaledVector(dir, (from + to) / 2)
      .addScaledVector(out, (back + front) / 2)
      .setY((y0 + y1) / 2),
  )
  geometry.applyMatrix4(matrix)
  return geometry
}

// A cut-out in a counter, in its own frame, for a sink set into it.
type Hole = { from: number; to: number; back: number; front: number }

// A slab of a counter with the holes left out of it.
function slab(counter: Counter, back: number, front: number, y0: number, y1: number, endOver = 0, holes: Hole[] = []): BufferGeometry[] {
  const pieces: BufferGeometry[] = []
  let at = -endOver
  for (const hole of [...holes].sort((a, b) => a.from - b.from)) {
    const from = Math.max(at, hole.from)
    const to = Math.min(counter.length + endOver, hole.to)
    if (to - from < 0.01) continue
    if (from - at > 0.001) pieces.push(block(counter, at, from, back, front, y0, y1))
    if (hole.back - back > 0.001) pieces.push(block(counter, from, to, back, hole.back, y0, y1))
    if (front - hole.front > 0.001) pieces.push(block(counter, from, to, hole.front, front, y0, y1))
    at = to
  }
  if (counter.length + endOver - at > 0.001) pieces.push(block(counter, at, counter.length + endOver, back, front, y0, y1))
  return pieces
}

// Where a sink's bowls go through a worktop, in the sink's own frame: along it from its middle, and out from its back.
export const SINK_BOWLS = { along: 0.38, back: 0.1, front: 0.48, deep: 0.18 }

// The holes the sinks standing in a counter cut through it.
function sinkHoles(counter: Counter, fixtures: Fixture[]): Hole[] {
  const holes: Hole[] = []
  for (const fixture of fixtures) {
    if (fixture.kind !== 'sink' || counterUnder([counter], fixture.x, fixture.z) === null) continue
    const depth = fixtureSpec(fixture.kind).depth
    const side = { x: fixture.dz, z: -fixture.dx }
    const corners = [-SINK_BOWLS.along, SINK_BOWLS.along].flatMap((along) =>
      [SINK_BOWLS.back, SINK_BOWLS.front].map((out) => ({
        x: fixture.x + side.x * along + fixture.dx * (out - depth / 2),
        z: fixture.z + side.z * along + fixture.dz * (out - depth / 2),
      })),
    )
    const along = corners.map((p) => (p.x - counter.x) * counter.dx + (p.z - counter.z) * counter.dz)
    const out = corners.map((p) => (p.x - counter.x) * -counter.dz + (p.z - counter.z) * counter.dx)
    holes.push({ from: Math.min(...along), to: Math.max(...along), back: Math.min(...out), front: Math.max(...out) })
  }
  return holes
}

const DOOR_GAP_COLOUR = '#c4beaf'
const HANDLE_COLOUR = '#4a4a4f'

// The counters of a storey for Review, standing on its floor: a plinth, the cupboards, the worktop over them, and
// any cupboards on the wall above.
export function buildCounterParts(counters: Counter[], floorY: number, fixtures: Fixture[] = [], ceilingY?: number): CounterPart[] {
  const groups = new Map<string, BufferGeometry[]>()
  const push = (colour: string, geometries: BufferGeometry[]) => groups.set(colour, [...(groups.get(colour) ?? []), ...geometries])
  for (const counter of counters) {
    const { height } = counterKindSpec(counter.kind)
    const top = counter.kind === 'cupboard' && ceilingY !== undefined ? Math.min(floorY + height, ceilingY) : floorY + height
    if (counter.kind === 'cupboard') {
      push(PLINTH_COLOUR, slab(counter, 0, counter.depth - 0.03, floorY, floorY + PLINTH_M))
      push(CARCASS_COLOUR, slab(counter, 0, counter.depth, floorY + PLINTH_M, top))
      const bays = cupboardBays(counter)
      const numDoors = bays.length
      const doorWidth = counter.length / numDoors
      for (let i = 1; i < numDoors; i++) {
        const u = i * doorWidth
        push(DOOR_GAP_COLOUR, [block(counter, u - 0.0015, u + 0.0015, counter.depth - 0.002, counter.depth + 0.001, floorY + PLINTH_M, top)])
      }
      const handleH = 0.18
      const handleW = 0.015
      const handleThick = 0.02
      const handleY = floorY + 1.05
      for (let i = 0; i < numDoors; i++) {
        const atEnd = i % 2 === 0 && i < numDoors - 1
        const atStart = i % 2 === 1
        const u = atEnd ? (i + 1) * doorWidth - 0.045 : atStart ? i * doorWidth + 0.045 : (i + 1) * doorWidth - 0.045
        push(HANDLE_COLOUR, [block(counter, u - handleW / 2, u + handleW / 2, counter.depth, counter.depth + handleThick, handleY - handleH / 2, handleY + handleH / 2)])
      }
      continue
    }
    const free = counter.kind !== 'base'
    // A counter against a wall has its plinth set back at the front only; one standing free, on both sides.
    push(PLINTH_COLOUR, slab(counter, free ? 0.05 : 0, counter.depth - 0.05, floorY, floorY + PLINTH_M))
    // A sink set into the counter goes through the worktop and into the cupboard under it.
    const holes = sinkHoles(counter, fixtures)
    const under = top - WORKTOP_M - SINK_BOWLS.deep
    push(CARCASS_COLOUR, slab(counter, 0, counter.depth, floorY + PLINTH_M, holes.length > 0 ? under : top - WORKTOP_M))
    if (holes.length > 0) push(CARCASS_COLOUR, slab(counter, 0, counter.depth, under, top - WORKTOP_M, 0, holes))
    push(counterTopSpec(counter.top).colour, slab(counter, free ? -WORKTOP_OVERHANG_M : 0, counter.depth + WORKTOP_OVERHANG_M, top - WORKTOP_M, top, free ? WORKTOP_OVERHANG_M : 0, holes))
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
  const totals = { units: { base: 0, island: 0, bar: 0, cupboard: 0 }, tops: { laminate: 0, granite: 0, timber: 0 }, wallUnits: 0 }
  for (const floor of doc.building.floors) {
    for (const counter of floor.counters ?? []) {
      totals.units[counter.kind] += counter.length
      if (counter.kind !== 'cupboard') {
        totals.tops[counter.top] += counter.length * (counter.depth + WORKTOP_OVERHANG_M * (counter.kind === 'base' ? 1 : 2))
      }
      if (counter.wallUnits) totals.wallUnits += counter.length
    }
  }
  return totals
}

// Dragging one end of a counter to resize its length along its axis, snapping to 600 mm cabinet modules,
// wall face stops, and door clearance.
export function counterEndDrag(
  floor: Floor,
  counter: Counter,
  end: 'start' | 'end',
  pointer: Point,
  options: { snapModule?: boolean } = {},
): Pick<Counter, 'x' | 'z' | 'length'> {
  const dir = { x: counter.dx, z: counter.dz }
  const snapModule = options.snapModule ?? true

  if (end === 'end') {
    // Start (x, z) is fixed; end moves.
    const rawDist = (pointer.x - counter.x) * dir.x + (pointer.z - counter.z) * dir.z
    let length = step(rawDist)

    // Magnetic snap to 600mm / 300mm cabinet modules
    if (snapModule) {
      const nearestModule = Math.round(rawDist / 0.6) * 0.6
      if (Math.abs(rawDist - nearestModule) <= 0.08) length = nearestModule
      else {
        const nearestHalf = Math.round(rawDist / 0.3) * 0.3
        if (Math.abs(rawDist - nearestHalf) <= 0.06) length = nearestHalf
      }
    }

    // If counter is against a wall face, constrain to wall extent and stops
    if (counter.kind === 'base' || counter.kind === 'cupboard') {
      const face = counterFace(floor, { x: counter.x + dir.x * 0.05, z: counter.z + dir.z * 0.05 }, 0.45, {
        kind: counter.kind,
        depth: counter.depth,
        ignore: counter.id,
      })
      if (face) {
        const originDist = (counter.x - face.point.x) * face.dir.x + (counter.z - face.point.z) * face.dir.z
        const maxAlong = face.after - originDist
        if (length > maxAlong) length = Math.max(0.3, step(maxAlong))
        for (const span of face.spans) {
          if (!span.stop) continue
          const relFrom = span.from - originDist
          if (relFrom > 0 && length > relFrom) length = Math.max(0.3, relFrom)
        }
      }
    }

    length = Math.max(COUNTER_MIN_LENGTH_M, Math.round(length * 100) / 100)
    return { x: counter.x, z: counter.z, length }
  } else {
    // End is fixed; start (x, z) moves.
    const fixedEnd = {
      x: counter.x + dir.x * counter.length,
      z: counter.z + dir.z * counter.length,
    }
    const rawDist = (fixedEnd.x - pointer.x) * dir.x + (fixedEnd.z - pointer.z) * dir.z
    let length = step(rawDist)

    if (snapModule) {
      const nearestModule = Math.round(rawDist / 0.6) * 0.6
      if (Math.abs(rawDist - nearestModule) <= 0.08) length = nearestModule
      else {
        const nearestHalf = Math.round(rawDist / 0.3) * 0.3
        if (Math.abs(rawDist - nearestHalf) <= 0.06) length = nearestHalf
      }
    }

    length = Math.max(COUNTER_MIN_LENGTH_M, Math.round(length * 100) / 100)
    const newX = fixedEnd.x - dir.x * length
    const newZ = fixedEnd.z - dir.z * length
    return { x: newX, z: newZ, length }
  }
}

export type BarSnap = {
  anchorCounter: Counter
  point: Point
  dir: Point
  edge: 'start' | 'end' | 'front' | 'back'
}

// Snaps a bar's start position to an existing counter's edge or cap, providing an aligned outward direction.
export function snapBarOrigin(floor: Floor, pointer: Point, reach = 0.4): BarSnap | null {
  let best: { snap: BarSnap; dist: number } | null = null

  for (const counter of floor.counters ?? []) {
    const dir = { x: counter.dx === 0 ? 0 : counter.dx, z: counter.dz === 0 ? 0 : counter.dz }
    const out = { x: -counter.dz === 0 ? 0 : -counter.dz, z: counter.dx === 0 ? 0 : counter.dx }
    const p0 = { x: counter.x, z: counter.z }
    const p1 = { x: counter.x + dir.x * counter.length, z: counter.z + dir.z * counter.length }
    const p2 = { x: p1.x + out.x * counter.depth, z: p1.z + out.z * counter.depth }
    const p3 = { x: p0.x + out.x * counter.depth, z: p0.z + out.z * counter.depth }

    // 1. End cap (p1 to p2)
    const midEnd = { x: (p1.x + p2.x) / 2, z: (p1.z + p2.z) / 2 }
    const distToEnd = Math.hypot(pointer.x - midEnd.x, pointer.z - midEnd.z)
    if (distToEnd < reach && (!best || distToEnd < best.dist)) {
      best = {
        snap: {
          anchorCounter: counter,
          point: midEnd,
          dir,
          edge: 'end',
        },
        dist: distToEnd,
      }
    }

    // 2. Start cap (p0 to p3)
    const midStart = { x: (p0.x + p3.x) / 2, z: (p0.z + p3.z) / 2 }
    const distToStart = Math.hypot(pointer.x - midStart.x, pointer.z - midStart.z)
    if (distToStart < reach && (!best || distToStart < best.dist)) {
      best = {
        snap: {
          anchorCounter: counter,
          point: midStart,
          dir: { x: -dir.x, z: -dir.z },
          edge: 'start',
        },
        dist: distToStart,
      }
    }

    // 3. Front edge (p3 to p2)
    const uFront = (pointer.x - p3.x) * dir.x + (pointer.z - p3.z) * dir.z
    if (uFront >= -0.1 && uFront <= counter.length + 0.1) {
      const clampedU = Math.max(0, Math.min(counter.length, uFront))
      const pt = { x: p3.x + dir.x * clampedU, z: p3.z + dir.z * clampedU }
      const d = Math.hypot(pointer.x - pt.x, pointer.z - pt.z)
      if (d < reach && (!best || d < best.dist)) {
        best = {
          snap: {
            anchorCounter: counter,
            point: pt,
            dir: out,
            edge: 'front',
          },
          dist: d,
        }
      }
    }

    // 4. Back edge (p0 to p1) for free-standing island/bar
    if (counter.kind === 'island' || counter.kind === 'bar') {
      const uBack = (pointer.x - p0.x) * dir.x + (pointer.z - p0.z) * dir.z
      if (uBack >= -0.1 && uBack <= counter.length + 0.1) {
        const clampedU = Math.max(0, Math.min(counter.length, uBack))
        const pt = { x: p0.x + dir.x * clampedU, z: p0.z + dir.z * clampedU }
        const d = Math.hypot(pointer.x - pt.x, pointer.z - pt.z)
        if (d < reach && (!best || d < best.dist)) {
          best = {
            snap: {
              anchorCounter: counter,
              point: pt,
              dir: { x: -out.x, z: -out.z },
              edge: 'back',
            },
            dist: d,
          }
        }
      }
    }
  }

  return best?.snap ?? null
}

export type CounterZone = {
  wallId: string
  counter: Omit<Counter, 'id'>
  polygon: Point[]
  length: number
  midPoint: Point
}

// Identifies candidate counter placement zones along uninterrupted perimeter walls in a room.
export function counterZonesForRoom(
  floor: Floor,
  rings: Point[][],
  cornerIds: Set<string>,
  kind: CounterKind = 'base',
): CounterZone[] {
  const zones: CounterZone[] = []
  const spec = counterKindSpec(kind)

  for (const wall of floor.walls) {
    if (wall.skin === 'logical') continue
    if (!cornerIds.has(wall.startCornerId) || !cornerIds.has(wall.endCornerId)) continue
    const a = cornerById(floor.corners, wall.startCornerId)
    const b = cornerById(floor.corners, wall.endCornerId)
    if (!a || !b) continue
    const length = Math.hypot(b.x - a.x, b.z - a.z)
    if (length < 0.6) continue
    const t = { x: (b.x - a.x) / length, z: (b.z - a.z) / length }
    const n = { x: -t.z, z: t.x }
    const half = wallThickness(systemOf(wall)) / 2

    // Determine which side of the wall faces inside the room rings
    const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 }
    const testPos = { x: mid.x + n.x * (half + 0.1), z: mid.z + n.z * (half + 0.1) }
    const testNeg = { x: mid.x - n.x * (half + 0.1), z: mid.z - n.z * (half + 0.1) }
    const inPos = rings.some((r) => pointInRing(r, testPos))
    const inNeg = rings.some((r) => pointInRing(r, testNeg))
    if (!inPos && !inNeg) continue
    const side = inPos ? 1 : -1

    const origin = { x: a.x + n.x * half * side, z: a.z + n.z * half * side }
    const dir = side === 1 ? t : { x: -t.x, z: -t.z }
    const out = { x: -dir.z, z: dir.x }

    // Blocks along the wall
    const blocks = [
      ...faceBlocks(floor, wall.id, origin, t),
      ...openingBlocks(wall, kind),
      ...counterBlocks(floor, origin, t, { x: n.x * side, z: n.z * side }, spec.depth),
    ]

    // Find free spans between 0 and length
    const sortedBlocks = blocks
      .map(([from, to]) => [Math.max(0, from), Math.min(length, to)] as [number, number])
      .filter(([from, to]) => to > from + 1e-4)
      .sort((p, q) => p[0] - q[0])

    const merged: [number, number][] = []
    for (const b of sortedBlocks) {
      if (merged.length === 0 || b[0] > merged[merged.length - 1][1] + 1e-4) merged.push([...b])
      else merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], b[1])
    }

    const freeSpans: [number, number][] = []
    let cursor = 0
    for (const [from, to] of merged) {
      if (from > cursor + 1e-4) freeSpans.push([cursor, from])
      cursor = Math.max(cursor, to)
    }
    if (length > cursor + 1e-4) freeSpans.push([cursor, length])

    for (const [fLo, fHi] of freeSpans) {
      const spanLen = fHi - fLo
      if (spanLen < 0.6) continue

      let startPoint: Point
      if (side === 1) {
        startPoint = { x: origin.x + t.x * fLo, z: origin.z + t.z * fLo }
      } else {
        startPoint = { x: origin.x + t.x * fHi, z: origin.z + t.z * fHi }
      }

      const zoneLen = step(spanLen)
      if (zoneLen < 0.6) continue

      const counterCandidate: Omit<Counter, 'id'> = {
        x: startPoint.x,
        z: startPoint.z,
        dx: dir.x,
        dz: dir.z,
        length: zoneLen,
        depth: spec.depth,
        kind,
        top: 'laminate',
      }

      const polygon = counterRing(counterCandidate)
      const midPoint = {
        x: startPoint.x + dir.x * (zoneLen / 2) + out.x * (spec.depth / 2),
        z: startPoint.z + dir.z * (zoneLen / 2) + out.z * (spec.depth / 2),
      }

      zones.push({
        wallId: wall.id,
        counter: counterCandidate,
        polygon,
        length: zoneLen,
        midPoint,
      })
    }
  }

  return zones
}

import { bottleSetup, fixtureFootprint, fixtureSize, fixtureSpec } from '../model/fixtures'
import { cornerById } from '../model/geom'
import { deriveRooms } from '../model/rooms'
import { PORTS } from '../model/ports'
import { isFloorOpening } from '../model/openings'
import type { Document, Fixture, FixtureKind, Floor, PlanPoint } from '../model/types'
import { wallReach } from './outline'
import { pointInRing, structureRings } from './pad'
import { plumbingLayout } from './plumbing'

// SANS 10087-1, as installers summarise it for bottles outside a house: clear of doors and openable windows,
// open drains, electrical switches and motors, and the boundary.
export const CYLINDER_OPENING_M = 1
export const CYLINDER_DRAIN_M = 2
export const CYLINDER_ELECTRICAL_M = 5
export const CYLINDER_BOUNDARY_M = 1
// A gas hob no closer than 200 mm to a socket or the stove isolator, and no switch in the space below it.
export const HOB_ELECTRICAL_M = 0.2
// Nor where curtains could reach the cooking top.
export const HOB_WINDOW_M = 0.3
// The copper pipe is clipped to the outside wall at about this height, and leaves the regulator at the top of the bottles.
export function regulatorY(bottles: Fixture): number {
  return bottles.y + fixtureSize(bottles).height
}
export const GAS_RUN_Y = 0.45
export const INDOOR_BOTTLE_KG = 9
const STAND_OFF_M = 0.03

export const GAS_APPLIANCES: FixtureKind[] = ['gas-stove', 'gas-geyser']
// Electrical points that can spark: not lights, which installers treat separately.
const SPARKS: FixtureKind[] = ['socket', 'switch', 'stove-isolator', 'db-board']

export type Placed = { floor: Floor; fixture: Fixture }

export type GasRun = {
  item: Placed
  cylinder: Placed
  // Along the outside of the house, from the bottles to where the pipe goes in, in plan.
  path: PlanPoint[]
  outside: number
  inside: number
  // Whether the pipe goes straight through the wall behind the appliance, or along the floor from further off.
  direct: boolean
  vertical: number
  length: number
}

export type GasIssue = { id: string; text: string; floorId?: string; fixtureId?: string }

export type GasLayout = { cylinders: Placed[]; appliances: Placed[]; runs: GasRun[]; length: number; issues: GasIssue[] }

type Edge = { a: string; b: string; p: PlanPoint; q: PlanPoint; n: PlanPoint; off: number; length: number }

type Foot = { edge: Edge; t: number; at: PlanPoint; d: number }

function distanceToSegment(p: PlanPoint, a: PlanPoint, b: PlanPoint): { d: number; t: number; at: PlanPoint } {
  const dx = b.x - a.x
  const dz = b.z - a.z
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1)))
  const at = { x: a.x + dx * t, z: a.z + dz * t }
  return { d: Math.hypot(p.x - at.x, p.z - at.z), t, at }
}

// The shortest way between two outlines: from the corners of one to the edges of the other, both ways.
export function ringGap(a: PlanPoint[], b: PlanPoint[]): number {
  if (a.some((p) => pointInRing(b, p.x, p.z)) || b.some((p) => pointInRing(a, p.x, p.z))) return 0
  let best = Infinity
  for (const [from, to] of [
    [a, b],
    [b, a],
  ]) {
    for (const p of from) {
      for (let i = 0; i < to.length; i++) best = Math.min(best, distanceToSegment(p, to[i], to[(i + 1) % to.length]).d)
    }
  }
  return best
}

// The outside faces of the ground floor: room edges with no room on one side, which a pipe can follow.
function outsideEdges(floor: Floor): Edge[] {
  const rings = structureRings(floor)
  const edges: Edge[] = []
  const seen = new Set<string>()
  for (const room of deriveRooms(floor)) {
    const ids = room.cornerIds
    for (let i = 0; i < ids.length; i++) {
      const a = ids[i]
      const b = ids[(i + 1) % ids.length]
      const key = a < b ? `${a}|${b}` : `${b}|${a}`
      if (seen.has(key)) continue
      seen.add(key)
      const p = cornerById(floor.corners, a)
      const q = cornerById(floor.corners, b)
      if (!p || !q) continue
      const length = Math.hypot(q.x - p.x, q.z - p.z)
      if (length < 1e-6) continue
      const wall = floor.walls.find((item) => (item.startCornerId === a && item.endCornerId === b) || (item.startCornerId === b && item.endCornerId === a))
      const off = (wall && wall.skin !== 'logical' ? wallReach(wall) : 0) + STAND_OFF_M
      const normal = { x: -(q.z - p.z) / length, z: (q.x - p.x) / length }
      const mid = { x: (p.x + q.x) / 2, z: (p.z + q.z) / 2 }
      for (const side of [1, -1]) {
        const out = { x: mid.x + normal.x * (off + 0.05) * side, z: mid.z + normal.z * (off + 0.05) * side }
        if (rings.some((ring) => pointInRing(ring, out.x, out.z))) continue
        edges.push({ a, b, p: { x: p.x, z: p.z }, q: { x: q.x, z: q.z }, n: { x: normal.x * side, z: normal.z * side }, off, length })
        break
      }
    }
  }
  return edges
}

function nearestFoot(edges: Edge[], point: PlanPoint): Foot | null {
  let best: Foot | null = null
  for (const edge of edges) {
    const hit = distanceToSegment(point, edge.p, edge.q)
    if (!best || hit.d < best.d - 1e-9) best = { edge, t: hit.t, at: hit.at, d: hit.d }
  }
  return best
}

// The way round the outside of the house between two feet, as corner ids, by Dijkstra over the outside edges.
function walk(edges: Edge[], from: Foot, to: Foot): { corners: string[]; length: number } {
  if (from.edge === to.edge) return { corners: [], length: Math.abs(from.t - to.t) * from.edge.length }
  const dist = new Map<string, number>()
  const prev = new Map<string, string | null>()
  dist.set(from.edge.a, from.t * from.edge.length)
  dist.set(from.edge.b, (1 - from.t) * from.edge.length)
  prev.set(from.edge.a, null)
  prev.set(from.edge.b, null)
  const done = new Set<string>()
  for (;;) {
    let here: string | null = null
    for (const [id, d] of dist) if (!done.has(id) && (here === null || d < dist.get(here)!)) here = id
    if (here === null) break
    done.add(here)
    for (const edge of edges) {
      if (edge === from.edge) continue
      const next = edge.a === here ? edge.b : edge.b === here ? edge.a : null
      if (!next) continue
      const d = dist.get(here)! + edge.length
      if (d < (dist.get(next) ?? Infinity)) {
        dist.set(next, d)
        prev.set(next, here)
      }
    }
  }
  const viaA = (dist.get(to.edge.a) ?? Infinity) + to.t * to.edge.length
  const viaB = (dist.get(to.edge.b) ?? Infinity) + (1 - to.t) * to.edge.length
  const end = viaA <= viaB ? to.edge.a : to.edge.b
  const length = Math.min(viaA, viaB)
  if (!Number.isFinite(length)) return { corners: [], length: Math.hypot(to.at.x - from.at.x, to.at.z - from.at.z) }
  const corners: string[] = []
  for (let id: string | null | undefined = end; id; id = prev.get(id)) corners.unshift(id)
  return { corners, length }
}

// Lift a walk off the wall centre lines onto the outside faces, mitring each corner.
function offsetPath(edges: Edge[], from: Foot, to: Foot, corners: string[], floor: Floor): PlanPoint[] {
  const lift = (p: PlanPoint, edge: Edge) => ({ x: p.x + edge.n.x * edge.off, z: p.z + edge.n.z * edge.off })
  const points: PlanPoint[] = [lift(from.at, from.edge)]
  let current = from.edge
  for (let i = 0; i < corners.length; i++) {
    const id = corners[i]
    const nextId = corners[i + 1]
    const next = nextId ? edges.find((edge) => (edge.a === id && edge.b === nextId) || (edge.b === id && edge.a === nextId)) : to.edge
    const corner = cornerById(floor.corners, id)
    if (!corner || !next) continue
    const dot = current.n.x * next.n.x + current.n.z * next.n.z
    const off = (current.off + next.off) / 2
    const miter = { x: (current.n.x + next.n.x) / (1 + dot || 1), z: (current.n.z + next.n.z) / (1 + dot || 1) }
    points.push({ x: corner.x + miter.x * off, z: corner.z + miter.z * off })
    current = next
  }
  points.push(lift(to.at, to.edge))
  return points
}

// Whether a pipe along the outside walls passes a door, garage door or opening in one of them.
export function doorCrossed(floor: Floor | undefined, path: PlanPoint[]): boolean {
  for (const wall of floor?.walls ?? []) {
    const doors = wall.openings.filter((item) => isFloorOpening(item.kind))
    if (doors.length === 0) continue
    const p = cornerById(floor!.corners, wall.startCornerId)
    const q = cornerById(floor!.corners, wall.endCornerId)
    if (!p || !q) continue
    const length = Math.hypot(q.x - p.x, q.z - p.z)
    if (length < 1e-6) continue
    const t = { x: (q.x - p.x) / length, z: (q.z - p.z) / length }
    const n = { x: -t.z, z: t.x }
    const face = wallReach(wall) + STAND_OFF_M
    const along = (at: PlanPoint) => (at.x - p.x) * t.x + (at.z - p.z) * t.z
    const off = (at: PlanPoint) => Math.abs(Math.abs((at.x - p.x) * n.x + (at.z - p.z) * n.z) - face)
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1]
      const b = path[i]
      if (off(a) > 0.12 || off(b) > 0.12) continue
      const lo = Math.min(along(a), along(b))
      const hi = Math.max(along(a), along(b))
      if (doors.some((door) => Math.min(hi, door.u + door.width) - Math.max(lo, door.u) > 0.05)) return true
    }
  }
  return false
}

function pathLength(path: PlanPoint[]): number {
  let length = 0
  for (let i = 1; i < path.length; i++) length += Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z)
  return length
}

// Where a fitting meets its wall: the middle of the back of its footprint.
function backOf(fixture: Fixture): PlanPoint {
  const depth = fixtureSize(fixture).depth
  return { x: fixture.x - fixture.dx * (depth / 2), z: fixture.z - fixture.dz * (depth / 2) }
}

function inletY(fixture: Fixture): number {
  const port = (PORTS[fixture.kind] ?? []).find((item) => item.kind === 'gas')
  return port ? port.y : fixture.y
}

export function gasLayout(doc: Document): GasLayout {
  const placed: Placed[] = doc.building.floors.flatMap((floor) => (floor.fixtures ?? []).map((fixture) => ({ floor, fixture })))
  const cylinders = placed.filter((item) => item.fixture.kind === 'gas-cylinder')
  const appliances = placed.filter((item) => GAS_APPLIANCES.includes(item.fixture.kind))
  const issues: GasIssue[] = []
  const ground = doc.building.floors.find((floor) => floor.index === 0)
  const edges = ground ? outsideEdges(ground) : []
  const rings = ground ? structureRings(ground) : []

  const runs: GasRun[] = []
  for (const item of appliances) {
    const back = backOf(item.fixture)
    const entry = nearestFoot(edges, back)
    let best: GasRun | null = null
    for (const cylinder of cylinders) {
      const start = nearestFoot(edges, backOf(cylinder.fixture))
      if (!entry || !start) {
        const outside = Math.hypot(back.x - cylinder.fixture.x, back.z - cylinder.fixture.z)
        const run = { item, cylinder, path: [backOf(cylinder.fixture), back], outside, inside: 0, direct: true, vertical: 0, length: outside }
        if (!best || run.length < best.length) best = run
        continue
      }
      const route = walk(edges, start, entry)
      const path = offsetPath(edges, start, entry, route.corners, ground!)
      // Bottles standing away from the wall reach it across the ground first.
      const cylinderBack = backOf(cylinder.fixture)
      if (start.d > start.edge.off + 0.1) path.unshift(cylinderBack)
      const outside = pathLength(path)
      // An appliance on an outside wall takes the pipe straight through; one further in, along the floor to it.
      const onOutsideWall = entry.d <= entry.edge.off + 0.1
      const through = fixtureSpec(item.fixture.kind).outside ? 0 : entry.edge.off * 2
      const inside = onOutsideWall ? through : through + Math.abs(back.x - entry.at.x) + Math.abs(back.z - entry.at.z)
      const rise = Math.max(0, item.floor.datumHeight - cylinder.floor.datumHeight)
      const vertical = Math.abs(regulatorY(cylinder.fixture) - GAS_RUN_Y) + Math.abs(inletY(item.fixture) - GAS_RUN_Y) + rise
      const run = { item, cylinder, path, outside, inside, direct: onOutsideWall, vertical, length: outside + inside + vertical }
      if (!best || run.length < best.length) best = run
    }
    if (best) runs.push(best)
  }

  if (appliances.length > 0 && cylinders.length === 0) {
    issues.push({ id: 'gas-no-cylinder', text: 'There is a gas appliance but no gas bottles. Add them against an outside wall.' })
  }

  const plot = doc.plot.ring.map(([x, z]) => ({ x, z }))
  const pipes = cylinders.length > 0 ? plumbingLayout(doc) : null
  const drainOpenings: { name: string; at: PlanPoint }[] = []
  if (pipes?.exit && pipes.drains.length > 0) drainOpenings.push({ name: 'gully', at: pipes.exit })
  if (pipes?.septic) drainOpenings.push({ name: 'septic tank', at: pipes.septic.tank })
  for (const cylinder of cylinders) {
    const at = { floorId: cylinder.floor.id, fixtureId: cylinder.fixture.id }
    const footprint = fixtureFootprint(cylinder.fixture)
    const { x, z } = cylinder.fixture
    const setup = bottleSetup(cylinder.fixture)
    if (cylinder.floor.index > 0 || rings.some((ring) => pointInRing(ring, x, z))) {
      // Indoors, a single 9 kg bottle beside its appliance; anything bigger goes outside.
      if (setup.kg > INDOOR_BOTTLE_KG || setup.count > 1) {
        issues.push({ id: `gas-inside:${cylinder.fixture.id}`, text: `The gas bottles are inside. Only a single ${INDOOR_BOTTLE_KG} kg bottle may stand indoors; bigger bottles go outside, on the ground, where a leak can blow away.`, ...at })
      }
      continue
    }
    if (!setup.cage) {
      issues.push({ id: `gas-cage:${cylinder.fixture.id}`, text: 'The gas bottles outside have no cage. A locked steel cage keeps them from being stolen or knocked over.', ...at })
    }
    // Doors and windows of the ground floor, along their wall's centre line.
    let opening: { kind: string; d: number } | null = null
    for (const wall of ground?.walls ?? []) {
      const p = cornerById(ground!.corners, wall.startCornerId)
      const q = cornerById(ground!.corners, wall.endCornerId)
      if (!p || !q) continue
      const length = Math.hypot(q.x - p.x, q.z - p.z)
      if (length < 1e-6) continue
      const t = { x: (q.x - p.x) / length, z: (q.z - p.z) / length }
      for (const item of wall.openings) {
        const a = { x: p.x + t.x * item.u, z: p.z + t.z * item.u }
        const b = { x: p.x + t.x * (item.u + item.width), z: p.z + t.z * (item.u + item.width) }
        const d = ringGap(footprint, [a, b])
        if (d < CYLINDER_OPENING_M && (!opening || d < opening.d)) opening = { kind: item.kind === 'window' ? 'window' : 'door', d }
      }
    }
    if (opening) {
      issues.push({ id: `gas-opening:${cylinder.fixture.id}`, text: `The gas bottles are ${Math.round(opening.d * 100) / 100} m from a ${opening.kind}; SANS 10087-1 wants ${CYLINDER_OPENING_M} m from doors and openable windows, so gas cannot drift inside.`, ...at })
    }
    const drain = drainOpenings.find((item) => ringGap(footprint, [item.at]) < CYLINDER_DRAIN_M)
    if (drain) {
      issues.push({ id: `gas-drain:${cylinder.fixture.id}`, text: `The gas bottles are within ${CYLINDER_DRAIN_M} m of the ${drain.name}. LP gas is heavier than air and gathers in drains and hollows.`, ...at })
    }
    const spark = placed.find(
      (item) =>
        SPARKS.includes(item.fixture.kind) &&
        item.floor.index === 0 &&
        !rings.some((ring) => pointInRing(ring, item.fixture.x, item.fixture.z)) &&
        ringGap(footprint, [item.fixture]) < CYLINDER_ELECTRICAL_M,
    )
    if (spark) {
      issues.push({ id: `gas-electrical:${cylinder.fixture.id}`, text: `The gas bottles are within ${CYLINDER_ELECTRICAL_M} m of an outside ${fixtureSpec(spark.fixture.kind).name.toLowerCase()}; keep switches, sockets and motors that far away.`, ...at })
    }
    if (plot.length >= 3) {
      let boundary = Infinity
      for (let i = 0; i < plot.length; i++) {
        for (const p of footprint) boundary = Math.min(boundary, distanceToSegment(p, plot[i], plot[(i + 1) % plot.length]).d)
      }
      if (boundary < CYLINDER_BOUNDARY_M) {
        issues.push({ id: `gas-boundary:${cylinder.fixture.id}`, text: `The gas bottles are ${Math.round(boundary * 100) / 100} m from the boundary; keep them ${CYLINDER_BOUNDARY_M} m in, unless the boundary is a solid brick firewall at least 1.8 m high.`, ...at })
      }
    }
  }

  for (const floor of doc.building.floors) {
    for (const hob of (floor.fixtures ?? []).filter((fixture) => fixture.kind === 'gas-stove')) {
      const at = { floorId: floor.id, fixtureId: hob.id }
      const footprint = fixtureFootprint(hob)
      const near = (floor.fixtures ?? []).find((fixture) => SPARKS.includes(fixture.kind) && ringGap(footprint, fixtureFootprint(fixture)) < HOB_ELECTRICAL_M)
      if (near) {
        issues.push({ id: `hob-electrical:${hob.id}`, text: `The gas stove is within ${HOB_ELECTRICAL_M * 1000} mm of a ${fixtureSpec(near.kind).name.toLowerCase()}; SANS 10087-1 keeps sockets and switches that far from a gas hob, and none in the space below it.`, ...at })
      }
      for (const wall of floor.walls) {
        const p = cornerById(floor.corners, wall.startCornerId)
        const q = cornerById(floor.corners, wall.endCornerId)
        if (!p || !q) continue
        const length = Math.hypot(q.x - p.x, q.z - p.z)
        if (length < 1e-6) continue
        const t = { x: (q.x - p.x) / length, z: (q.z - p.z) / length }
        const window = wall.openings.find((item) => {
          if (item.kind !== 'window') return false
          const a = { x: p.x + t.x * item.u, z: p.z + t.z * item.u }
          const b = { x: p.x + t.x * (item.u + item.width), z: p.z + t.z * (item.u + item.width) }
          return ringGap(footprint, [a, b]) < wallReach(wall) + HOB_WINDOW_M
        })
        if (window) {
          issues.push({ id: `hob-window:${hob.id}`, text: 'The gas stove is at a window, where curtains could reach the flames and wind can blow them out. Move it along the wall, or hang a blind.', ...at })
          break
        }
      }
    }
  }

  // The pipe is clipped low along the outside walls: it may not run across a doorway.
  for (const run of runs) {
    const door = doorCrossed(ground, run.path)
    if (door) {
      issues.push({
        id: `gas-door:${run.item.fixture.id}`,
        text: `The gas pipe to the ${fixtureSpec(run.item.fixture.kind).name.toLowerCase()} runs across a doorway. Take it up and over the door, or move the bottles so it goes round the other way.`,
        floorId: run.item.floor.id,
        fixtureId: run.item.fixture.id,
      })
    }
  }

  const length = runs.reduce((sum, run) => sum + run.length, 0)
  return { cylinders, appliances, runs, length, issues }
}

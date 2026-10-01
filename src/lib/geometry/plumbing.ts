import { fixtureSpec } from '../model/fixtures'
import type { Document, Fixture, FixtureKind, Floor, PlanPoint, ServiceKind } from '../model/types'
import { finishedFloor } from './fixtures'
import { groundPad, levelField, pointInRing, structureRings, type GroundPad } from './pad'
import { bilinearHeight } from './terrain'
import { wallReach } from './outline'

// Rules of thumb for an indicative layout, to be confirmed against SANS 10400-P and SANS 10252.
export const DRAIN_FALL: Record<number, number> = { 110: 60, 50: 40 }
export const MIN_COVER_M = 0.3
export const DEFAULT_SEWER_DEPTH_M = 1
export const LONG_HOT_RUN_M = 12
const OUTLET_BELOW_FLOOR_M = 0.2
const TRENCH_WIDTH_M = 0.45
const WATER_TRENCH_DEPTH_M = 0.45
const SAMPLE_M = 0.5

const DRAINS: Partial<Record<FixtureKind, number>> = { wc: 110, basin: 50, shower: 50, bath: 50, sink: 50, 'washing-machine': 50 }
const COLD: FixtureKind[] = ['wc', 'basin', 'shower', 'bath', 'sink', 'washing-machine', 'outside-tap']
const HOT: FixtureKind[] = ['basin', 'shower', 'bath', 'sink']
const GEYSERS: FixtureKind[] = ['geyser', 'solar-geyser']

export type Placed = { floor: Floor; fixture: Fixture }

export type ProfilePoint = { x: number; z: number; ground: number; invert: number }

export type DrainProfile = {
  points: ProfilePoint[]
  length: number
  connectionInvert: number
  // How far the drain arrives below the sewer, if it cannot fall that far.
  shortBy: number
  deepest: number
  trench: number
}

export type PlumbingLayout = {
  exit: PlanPoint | null
  sewer: PlanPoint
  water: PlanPoint
  drains: { item: Placed; dia: number; length: number }[]
  stack: number
  profile: DrainProfile | null
  waterMain: number
  cold: number
  hot: { item: Placed; length: number }[]
  issues: { id: string; text: string }[]
}

function manhattan(a: PlanPoint, b: PlanPoint): number {
  return Math.abs(a.x - b.x) + Math.abs(a.z - b.z)
}

function groundAt(doc: Document, pad: GroundPad | null): (x: number, z: number) => number {
  const field = pad ? levelField(doc.heightfield, pad.structures) : doc.heightfield
  return (x, z) => bilinearHeight(field, x, z)
}

// The finished floor of the storey a fixture stands on, in world height.
function floorLevel(pad: GroundPad | null, floor: Floor, at: PlanPoint): number {
  const structures = pad?.structures ?? []
  const datum =
    structures.find((structure) => structure.rings.some((ring) => pointInRing(ring, at.x, at.z)))?.datum ??
    structures[0]?.datum ??
    0
  return floor.datumHeight + datum + finishedFloor(floor)
}

function plotPoints(doc: Document): PlanPoint[] {
  return doc.plot.ring.map(([x, z]) => ({ x, z }))
}

function nearestOnRing(ring: PlanPoint[], at: PlanPoint): PlanPoint {
  let best = ring[0]
  let bestD = Infinity
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    const dx = b.x - a.x
    const dz = b.z - a.z
    const t = Math.max(0, Math.min(1, ((at.x - a.x) * dx + (at.z - a.z) * dz) / (dx * dx + dz * dz || 1)))
    const p = { x: a.x + dx * t, z: a.z + dz * t }
    const d = Math.hypot(p.x - at.x, p.z - at.z)
    if (d < bestD) {
      bestD = d
      best = p
    }
  }
  return best
}

function placedFixtures(doc: Document): Placed[] {
  return doc.building.floors.flatMap((floor) => (floor.fixtures ?? []).map((fixture) => ({ floor, fixture })))
}

// Where the services leave the building: the outside face nearest the middle of the wet fittings.
export function serviceExit(doc: Document): PlanPoint | null {
  const ground = doc.building.floors.find((floor) => floor.index === 0)
  if (!ground) return null
  const wet = placedFixtures(doc).filter((item) => COLD.includes(item.fixture.kind) || DRAINS[item.fixture.kind])
  if (wet.length === 0) return null
  const middle = {
    x: wet.reduce((sum, item) => sum + item.fixture.x, 0) / wet.length,
    z: wet.reduce((sum, item) => sum + item.fixture.z, 0) / wet.length,
  }
  const rings = structureRings(ground)
  const reach = Math.max(0.15, ...ground.walls.filter((wall) => wall.skin !== 'logical').map(wallReach)) + 0.15
  let best: { point: PlanPoint; d: number } | null = null
  // Walk every room edge; only points where a step across the wall lands outside every room are on the outside.
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]
      const b = ring[(i + 1) % ring.length]
      const length = Math.hypot(b.x - a.x, b.z - a.z)
      if (length < 1e-6) continue
      const n = { x: -(b.z - a.z) / length, z: (b.x - a.x) / length }
      const steps = Math.max(1, Math.ceil(length / 0.25))
      for (let k = 0; k <= steps; k++) {
        const on = { x: a.x + ((b.x - a.x) * k) / steps, z: a.z + ((b.z - a.z) * k) / steps }
        for (const side of [1, -1]) {
          const out = { x: on.x + n.x * reach * side, z: on.z + n.z * reach * side }
          if (rings.some((other) => pointInRing(other, out.x, out.z))) continue
          const d = Math.hypot(out.x - middle.x, out.z - middle.z)
          if (!best || d < best.d) best = { point: out, d }
        }
      }
    }
  }
  return best?.point ?? null
}

// The sewer connects at the lowest point of the boundary unless placed; water at the boundary nearest the house.
export function connectionPoint(doc: Document, kind: ServiceKind, exit: PlanPoint | null): PlanPoint {
  const placed = doc.services?.[kind]
  if (placed) return placed
  const ring = plotPoints(doc)
  if (kind === 'sewer') {
    const height = (p: PlanPoint) => bilinearHeight(doc.heightfield, p.x, p.z)
    const samples = ring.flatMap((a, i) => {
      const b = ring[(i + 1) % ring.length]
      const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 1))
      return Array.from({ length: steps }, (_, k) => ({ x: a.x + ((b.x - a.x) * k) / steps, z: a.z + ((b.z - a.z) * k) / steps }))
    })
    return inset(ring, samples.reduce((low, p) => (height(p) < height(low) - 1e-6 ? p : low), samples[0]))
  }
  return inset(ring, nearestOnRing(ring, exit ?? ring[0]))
}

// Half a metre in from the boundary, so the connection sits on the plot.
function inset(ring: PlanPoint[], point: PlanPoint): PlanPoint {
  const cx = ring.reduce((sum, p) => sum + p.x, 0) / ring.length
  const cz = ring.reduce((sum, p) => sum + p.z, 0) / ring.length
  const d = Math.hypot(cx - point.x, cz - point.z) || 1
  return { x: point.x + ((cx - point.x) / d) * 0.5, z: point.z + ((cz - point.z) / d) * 0.5 }
}

export function servicePath(doc: Document, kind: ServiceKind, exit: PlanPoint, end: PlanPoint): PlanPoint[] {
  return [exit, ...(doc.services?.bends?.[kind] ?? []), end]
}

function pathLength(path: PlanPoint[]): number {
  let length = 0
  for (let i = 1; i < path.length; i++) length += Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z)
  return length
}

// Follow the drain from the house to the sewer as high as it can go: never steeper than it must, never shallower than cover.
export function drainProfile(path: PlanPoint[], startInvert: number, ground: (x: number, z: number) => number, sewerDepth: number): DrainProfile {
  const fall = 1 / DRAIN_FALL[110]
  const points: ProfilePoint[] = []
  let invert = Math.min(startInvert, ground(path[0].x, path[0].z) - MIN_COVER_M)
  let length = 0
  let trench = 0
  let deepest = 0
  points.push({ ...path[0], ground: ground(path[0].x, path[0].z), invert })
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]
    const b = path[i]
    const run = Math.hypot(b.x - a.x, b.z - a.z)
    const steps = Math.max(1, Math.ceil(run / SAMPLE_M))
    for (let k = 1; k <= steps; k++) {
      const t = k / steps
      const p = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t }
      const level = ground(p.x, p.z)
      invert = Math.min(invert - (run / steps) * fall, level - MIN_COVER_M)
      const depth = level - invert
      deepest = Math.max(deepest, depth)
      trench += (run / steps) * TRENCH_WIDTH_M * (depth + 0.1)
    }
    length += run
    points.push({ ...b, ground: ground(b.x, b.z), invert })
  }
  const last = path[path.length - 1]
  const connectionInvert = ground(last.x, last.z) - sewerDepth
  return { points, length, connectionInvert, shortBy: Math.max(0, connectionInvert - invert), deepest, trench }
}

export function plumbingLayout(doc: Document): PlumbingLayout {
  const pad = groundPad(doc)
  const ground = groundAt(doc, pad)
  const placed = placedFixtures(doc)
  const exit = serviceExit(doc)
  const sewer = connectionPoint(doc, 'sewer', exit)
  const water = connectionPoint(doc, 'water', exit)
  const issues: PlumbingLayout['issues'] = []
  if (!exit) return { exit, sewer, water, drains: [], stack: 0, profile: null, waterMain: 0, cold: 0, hot: [], issues }

  const drains = placed
    .filter((item) => DRAINS[item.fixture.kind])
    .map((item) => ({ item, dia: DRAINS[item.fixture.kind]!, length: manhattan(item.fixture, exit) }))

  // Ground-floor wastes set how high the drain can leave the house; upper floors come down a stack.
  let startInvert = Infinity
  let stack = 0
  for (const drain of drains) {
    const level = floorLevel(pad, drain.item.floor, drain.item.fixture)
    if (drain.item.floor.index === 0) {
      startInvert = Math.min(startInvert, level - OUTLET_BELOW_FLOOR_M - drain.length / DRAIN_FALL[drain.dia])
    } else {
      stack = Math.max(stack, level - ground(exit.x, exit.z) + MIN_COVER_M)
    }
  }
  const profile = drains.length > 0
    ? drainProfile(servicePath(doc, 'sewer', exit, sewer), startInvert, ground, doc.services?.sewerDepth ?? DEFAULT_SEWER_DEPTH_M)
    : null
  if (profile && profile.shortBy > 0.005) {
    issues.push({
      id: 'sewer-high',
      text: `The drain reaches the sewer connection ${Math.round(profile.shortBy * 1000)} mm too low to fall into it. Move the connection lower, route the drain over lower ground, or plan for a pump.`,
    })
  }

  // Pipes outside should stay out from under buildings, where they cannot be reached.
  const groundFloor = doc.building.floors.find((floor) => floor.index === 0)
  const rings = groundFloor ? structureRings(groundFloor) : []
  const underBuilding = (path: PlanPoint[]) => {
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1]
      const b = path[i]
      const run = Math.hypot(b.x - a.x, b.z - a.z)
      const steps = Math.max(1, Math.ceil(run / 0.25))
      for (let k = 1; k < steps; k++) {
        const p = { x: a.x + ((b.x - a.x) * k) / steps, z: a.z + ((b.z - a.z) * k) / steps }
        if (rings.some((ring) => pointInRing(ring, p.x, p.z))) return true
      }
    }
    return false
  }
  if (drains.length > 0 && underBuilding(servicePath(doc, 'sewer', exit, sewer))) {
    issues.push({ id: 'drain-under', text: 'The drain to the sewer runs under a building. Add a bend to take it round, where it can be reached.' })
  }

  const supplyPath = servicePath(doc, 'water', exit, water)
  const waterMain = placed.some((item) => COLD.includes(item.fixture.kind)) ? pathLength(supplyPath) : 0
  const geysers = placed.filter((item) => GEYSERS.includes(item.fixture.kind))
  let cold = 0
  for (const item of placed.filter((entry) => COLD.includes(entry.fixture.kind) || GEYSERS.includes(entry.fixture.kind))) {
    const rise = Math.max(0, floorLevel(pad, item.floor, item.fixture) + item.fixture.y - floorLevel(pad, doc.building.floors.find((f) => f.index === 0) ?? item.floor, exit))
    cold += manhattan(item.fixture, exit) + rise
  }
  const hot: PlumbingLayout['hot'] = []
  const hotItems = placed.filter((item) => HOT.includes(item.fixture.kind))
  for (const item of hotItems) {
    const source = geysers.reduce<{ geyser: Placed; run: number } | null>((best, geyser) => {
      const drop = Math.abs(floorLevel(pad, geyser.floor, geyser.fixture) + geyser.fixture.y - (floorLevel(pad, item.floor, item.fixture) + item.fixture.y))
      const run = manhattan(geyser.fixture, item.fixture) + drop
      return !best || run < best.run ? { geyser, run } : best
    }, null)
    if (source) hot.push({ item, length: source.run })
  }

  if (hotItems.length > 0 && geysers.length === 0) {
    issues.push({ id: 'no-geyser', text: 'Hot water is needed but there is no geyser. Add one in the roof space near the bathroom and kitchen.' })
  }
  if (geysers.length > 0 && !geysers.some((item) => item.fixture.kind === 'solar-geyser')) {
    issues.push({
      id: 'xa-hot-water',
      text: 'SANS 10400-XA wants at least half the hot water heated by something other than an element. Use a solar geyser or a heat pump.',
    })
  }
  const longest = hot.reduce<{ item: Placed; length: number } | null>((best, run) => (!best || run.length > best.length ? run : best), null)
  if (longest && longest.length > LONG_HOT_RUN_M) {
    issues.push({
      id: 'long-hot-run',
      text: `The ${fixtureSpec(longest.item.fixture.kind).name.toLowerCase()} is about ${Math.round(longest.length)} m of pipe from the geyser; you would run off a lot of cold water before it gets hot. Move the geyser or the fitting closer.`,
    })
  }
  return { exit, sewer, water, drains, stack, profile, waterMain, cold, hot, issues }
}

export function waterTrench(length: number): number {
  return length * 0.3 * WATER_TRENCH_DEPTH_M
}

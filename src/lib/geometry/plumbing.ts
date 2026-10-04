import { fixtureSpec, tankLitres } from '../model/fixtures'
import { gutterLayout } from './gutters'
import type { Document, Fixture, FixtureKind, Floor, PlanPoint, ServiceKind, Wall } from '../model/types'
import { finishedFloor, fixturesOnWall, siteField } from './fixtures'
import { PORTS, type PortKind } from '../model/ports'
import { WALL_HEAD } from '../plot/fixture'
import type { WallSide } from './spaces'
import { groundPad, pointInRing, structureRings, type GroundPad } from './pad'
import { bilinearHeight } from './terrain'
import { wallReach } from './outline'
import { masonryReach, roofPlan } from './roof'
import { cornerById, signedPolygonArea } from '../model/geom'
import { supportingFloor } from '../model/stories'

// Rules of thumb for an indicative layout, to be confirmed against SANS 10400-P and SANS 10252.
export const DRAIN_FALL: Record<number, number> = { 110: 60, 50: 40 }
export const MIN_COVER_M = 0.3
export const DEFAULT_SEWER_DEPTH_M = 1
export const LONG_HOT_RUN_M = 12
export const SEPTIC_INLET_DEPTH_M = 0.5
export const SEPTIC_CLEAR_BUILDING_M = 3
export const SOAKAWAY_CLEAR_BUILDING_M = 5
export const SOAKAWAY_CLEAR_BOUNDARY_M = 3
export const SOAKAWAY_DEFAULT_M = 6
export const DEFAULT_RAINFALL_MM = 650
export const RUNOFF = 0.8
const STORM_MM = 25
const OUTLET_BELOW_FLOOR_M = 0.2
const TRENCH_WIDTH_M = 0.45
const WATER_TRENCH_DEPTH_M = 0.45
const SAMPLE_M = 0.5

const DRAINS: Partial<Record<FixtureKind, number>> = { wc: 110, basin: 50, shower: 50, bath: 50, sink: 50, 'washing-machine': 50 }
export const COLD: FixtureKind[] = ['wc', 'basin', 'shower', 'bath', 'sink', 'washing-machine', 'outside-tap']
export const HOT: FixtureKind[] = ['basin', 'shower', 'bath', 'sink']
export const GEYSERS: FixtureKind[] = ['geyser', 'solar-geyser', 'gas-geyser']

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

export type Septic = { tank: PlanPoint; soakaway: PlanPoint; litres: number; bedrooms: number }

// Tanks and their litres; how much rain fills them; and the storage that would hold a heavy storm.
export type Rainwater = { catchment: number; rainfall: number; yearly: number; tanks: number; litres: number; fillMm: number; stormLitres: number }

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
  septic: Septic | null
  rain: Rainwater | null
  issues: { id: string; text: string }[]
}

// Rule of thumb: 2,500 litres serves two bedrooms, and each further bedroom adds 500.
export function septicLitres(bedrooms: number): number {
  return 2500 + Math.max(0, bedrooms - 2) * 500
}

// How far a point is from a building: nothing if it is inside it.
function distanceToRing(ring: PlanPoint[], at: PlanPoint): number {
  if (pointInRing(ring, at.x, at.z)) return 0
  return distanceToEdge(ring, at)
}

// How far a point is from the line of a ring, such as the plot boundary, from either side.
function distanceToEdge(ring: PlanPoint[], at: PlanPoint): number {
  const near = nearestOnRing(ring, at)
  return Math.hypot(near.x - at.x, near.z - at.z)
}

// The soakaway goes to the lowest spot within a few metres of the tank that clears the boundary and the buildings.
export function soakawayPoint(doc: Document, tank: PlanPoint, exit: PlanPoint | null): PlanPoint {
  const placed = doc.services?.soakaway
  if (placed) return placed
  const ring = plotPoints(doc)
  const ground = doc.building.floors.find((floor) => floor.index === 0)
  const buildings = ground ? structureRings(ground) : []
  const height = (p: PlanPoint) => bilinearHeight(doc.heightfield, p.x, p.z)
  let best: { point: PlanPoint; score: number } | null = null
  for (let reach = SOAKAWAY_DEFAULT_M; reach >= 3; reach -= 1) {
    for (let k = 0; k < 16; k++) {
      const angle = (k / 16) * Math.PI * 2
      const p = { x: tank.x + Math.cos(angle) * reach, z: tank.z + Math.sin(angle) * reach }
      if (!pointInRing(ring, p.x, p.z) || distanceToEdge(ring, p) < SOAKAWAY_CLEAR_BOUNDARY_M) continue
      if (buildings.some((building) => distanceToRing(building, p) < SOAKAWAY_CLEAR_BUILDING_M)) continue
      const away = exit ? Math.hypot(p.x - exit.x, p.z - exit.z) * 0.001 : 0
      const score = height(p) - away
      if (!best || score < best.score) best = { point: p, score }
    }
    if (best) return best.point
  }
  // Nowhere clears everything: take the lowest spot on the plot, and let the checks say what it is too close to.
  let fallback: { point: PlanPoint; score: number } | null = null
  for (let reach = SOAKAWAY_DEFAULT_M; reach >= 2; reach -= 1) {
    for (let k = 0; k < 16; k++) {
      const angle = (k / 16) * Math.PI * 2
      const p = { x: tank.x + Math.cos(angle) * reach, z: tank.z + Math.sin(angle) * reach }
      if (!pointInRing(ring, p.x, p.z) || distanceToEdge(ring, p) < 0.5) continue
      if (buildings.some((building) => pointInRing(building, p.x, p.z))) continue
      const score = height(p)
      if (!fallback || score < fallback.score) fallback = { point: p, score }
    }
  }
  return fallback?.point ?? tank
}

function rainwater(doc: Document, tanks: Placed[]): Rainwater | null {
  let catchment = 0
  for (const floor of doc.building.floors) {
    if (!floor.roof || floor.index === 0) continue
    const below = supportingFloor(doc, floor)
    for (const footprint of roofPlan(floor, floor.roof, masonryReach(below?.walls ?? [])).footprints) {
      catchment += Math.abs(signedPolygonArea(footprint.outer)) - footprint.holes.reduce((sum, hole) => sum + Math.abs(signedPolygonArea(hole)), 0)
    }
  }
  if (catchment <= 0) return null
  const rainfall = doc.services?.rainfallMm ?? DEFAULT_RAINFALL_MM
  const litres = tanks.reduce((sum, item) => sum + tankLitres(item.fixture), 0)
  return {
    catchment,
    rainfall,
    yearly: catchment * rainfall * RUNOFF,
    tanks: tanks.length,
    litres,
    fillMm: litres / (catchment * RUNOFF),
    stormLitres: catchment * STORM_MM * RUNOFF,
  }
}

// A tank no downpipe reaches collects nothing.
function unfedTanks(doc: Document, tanks: Placed[]): PlumbingLayout['issues'] {
  if (tanks.length === 0) return []
  const fed = new Set(gutterLayout(doc).downpipes.flatMap((pipe) => (pipe.tank ? [pipe.tank.id] : [])))
  return tanks
    .filter((tank) => !fed.has(tank.fixture.id))
    .map((tank) => ({ id: `tank-unfed:${tank.fixture.id}`, text: 'A rainwater tank is not under a downpipe, so nothing fills it. Move it along the wall to stand under one.' }))
}

function manhattan(a: PlanPoint, b: PlanPoint): number {
  return Math.abs(a.x - b.x) + Math.abs(a.z - b.z)
}

function groundAt(doc: Document, _pad: GroundPad | null): (x: number, z: number) => number {
  const field = siteField(doc)
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
    const low = samples.reduce((best, p) => (height(p) < height(best) - 1e-6 ? p : best), samples[0])
    if (doc.services?.sewerType !== 'septic' || !exit) return inset(ring, low, 0.5)
    // A septic tank sits partway down towards the low corner, leaving the lowest ground for its soakaway.
    const bottom = inset(ring, low, 3)
    const run = Math.hypot(bottom.x - exit.x, bottom.z - exit.z)
    if (run < 8) return bottom
    const ground = doc.building.floors.find((floor) => floor.index === 0)
    const buildings = ground ? structureRings(ground) : []
    for (let along = SEPTIC_CLEAR_BUILDING_M; along <= run - 3; along += 0.25) {
      const p = { x: exit.x + ((bottom.x - exit.x) * along) / run, z: exit.z + ((bottom.z - exit.z) * along) / run }
      if (buildings.every((building) => distanceToRing(building, p) >= SEPTIC_CLEAR_BUILDING_M)) return p
    }
    return bottom
  }
  return inset(ring, nearestOnRing(ring, exit ?? ring[0]))
}

// A little way in from the boundary, towards the middle of the plot.
function inset(ring: PlanPoint[], point: PlanPoint, by = 0.5): PlanPoint {
  const cx = ring.reduce((sum, p) => sum + p.x, 0) / ring.length
  const cz = ring.reduce((sum, p) => sum + p.z, 0) / ring.length
  const d = Math.hypot(cx - point.x, cz - point.z) || 1
  const reach = Math.min(by, d * 0.5)
  return { x: point.x + ((cx - point.x) / d) * reach, z: point.z + ((cz - point.z) / d) * reach }
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
  if (!exit) {
    const tanks = placed.filter((item) => item.fixture.kind === 'water-tank')
    issues.push(...unfedTanks(doc, tanks))
    return { exit, sewer, water, drains: [], stack: 0, profile: null, waterMain: 0, cold: 0, hot: [], septic: null, rain: rainwater(doc, tanks), issues }
  }

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
  const septicTank = doc.services?.sewerType === 'septic'
  const depth = septicTank ? SEPTIC_INLET_DEPTH_M : (doc.services?.sewerDepth ?? DEFAULT_SEWER_DEPTH_M)
  const profile = drains.length > 0 ? drainProfile(servicePath(doc, 'sewer', exit, sewer), startInvert, ground, depth) : null
  if (profile && profile.shortBy > 0.005) {
    issues.push({
      id: 'sewer-high',
      text: septicTank
        ? `The drain reaches the septic tank ${Math.round(profile.shortBy * 1000)} mm below its inlet. Set the tank lower down the slope, or route the drain over lower ground.`
        : `The drain reaches the sewer connection ${Math.round(profile.shortBy * 1000)} mm too low to fall into it. Move the connection lower, route the drain over lower ground, or plan for a pump.`,
    })
  }
  const groundFloor = doc.building.floors.find((floor) => floor.index === 0)
  const rings = groundFloor ? structureRings(groundFloor) : []
  let septic: Septic | null = null
  if (septicTank) {
    const bedrooms = doc.building.floors.reduce((sum, floor) => sum + (floor.spaces ?? []).filter((space) => space.type === 'bedroom').length, 0)
    const soakaway = soakawayPoint(doc, sewer, exit)
    septic = { tank: sewer, soakaway, litres: septicLitres(bedrooms), bedrooms }
    const clear = (at: PlanPoint) => Math.min(Infinity, ...rings.map((ring) => distanceToRing(ring, at)))
    if (clear(sewer) < SEPTIC_CLEAR_BUILDING_M) {
      issues.push({ id: 'septic-close', text: `The septic tank is closer than ${SEPTIC_CLEAR_BUILDING_M} m to a building. Move it further out.` })
    }
    if (clear(soakaway) < SOAKAWAY_CLEAR_BUILDING_M) {
      issues.push({ id: 'soakaway-close', text: `The soakaway is closer than ${SOAKAWAY_CLEAR_BUILDING_M} m to a building; the water it lets out can undermine foundations.` })
    }
    if (distanceToEdge(plotPoints(doc), soakaway) < SOAKAWAY_CLEAR_BOUNDARY_M) {
      issues.push({ id: 'soakaway-boundary', text: `The soakaway is closer than ${SOAKAWAY_CLEAR_BOUNDARY_M} m to the boundary.` })
    }
    if (ground(soakaway.x, soakaway.z) > ground(sewer.x, sewer.z) - 0.05) {
      issues.push({ id: 'soakaway-uphill', text: 'The soakaway is not below the septic tank; the overflow needs to run downhill to it.' })
    }
  }

  // Pipes outside should stay out from under buildings, where they cannot be reached.
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
    // Between storeys only: the climb up the wall to each tap is counted with the chases.
    const rise = Math.max(0, floorLevel(pad, item.floor, item.fixture) - floorLevel(pad, doc.building.floors.find((f) => f.index === 0) ?? item.floor, exit))
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
    issues.push({ id: 'no-geyser', text: 'Hot water is needed but there is no geyser. Add one in the roof space near the bathroom and kitchen, or a gas geyser on an outside wall.' })
  }
  if (geysers.length > 0 && !geysers.some((item) => item.fixture.kind === 'solar-geyser' || item.fixture.kind === 'gas-geyser')) {
    issues.push({
      id: 'xa-hot-water',
      text: 'SANS 10400-XA wants at least half the hot water heated by something other than an element. Use a solar or gas geyser, or a heat pump.',
    })
  }
  const longest = hot.reduce<{ item: Placed; length: number } | null>((best, run) => (!best || run.length > best.length ? run : best), null)
  if (longest && longest.length > LONG_HOT_RUN_M) {
    issues.push({
      id: 'long-hot-run',
      text: `The ${fixtureSpec(longest.item.fixture.kind).name.toLowerCase()} is about ${Math.round(longest.length)} m of pipe from the geyser; you would run off a lot of cold water before it gets hot. Move the geyser or the fitting closer.`,
    })
  }
  const tanks = placed.filter((item) => item.fixture.kind === 'water-tank')
  const rain = rainwater(doc, tanks)
  issues.push(...unfedTanks(doc, tanks))
  return { exit, sewer, water, drains, stack, profile, waterMain, cold, hot, septic, rain, issues }
}

// A pipe's way through a wall face, seen square on: across the face (u) and up from the floor datum (v).
export type FacePort = { u: number; v: number; kind: PortKind; dia: number }
export type ChaseRun = { kind: PortKind; dia: number; points: [number, number][] }

// Supplies come down from the roof space: on each face the cold inlets share one chase and riser, and so do the hot.
// Wastes drop to the floor.
export function chaseRuns(ports: FacePort[], floorLevel: number, ceiling: number): ChaseRun[] {
  const runs: ChaseRun[] = []
  for (const kind of ['cold', 'hot'] as const) {
    const inlets = ports.filter((port) => port.kind === kind).sort((a, b) => a.u - b.u)
    if (inlets.length === 0) continue
    const dia = inlets[0].dia
    const level = Math.max(...inlets.map((port) => port.v))
    const riser = inlets[0].u
    for (const port of inlets) if (port.v < level - 1e-6) runs.push({ kind, dia, points: [[port.u, port.v], [port.u, level]] })
    if (inlets.length > 1) runs.push({ kind, dia, points: [[inlets[0].u, level], [inlets[inlets.length - 1].u, level]] })
    runs.push({ kind, dia, points: [[riser, level], [riser, ceiling]] })
  }
  for (const port of ports.filter((entry) => entry.kind === 'waste')) {
    runs.push({ kind: 'waste', dia: port.dia, points: [[port.u, port.v], [port.u, floorLevel]] })
  }
  return runs
}

export function runLength(run: Pick<ChaseRun, 'points'>): number {
  let length = 0
  for (let i = 1; i < run.points.length; i++) length += Math.hypot(run.points[i][0] - run.points[i - 1][0], run.points[i][1] - run.points[i - 1][1])
  return length
}

// The plumbing ports on one face of a wall, measured across the face as seen from that side.
export function facePorts(floor: Floor, wall: Wall, side: WallSide): FacePort[] {
  const a = cornerById(floor.corners, wall.startCornerId)
  const b = cornerById(floor.corners, wall.endCornerId)
  if (!a || !b) return []
  const length = Math.hypot(b.x - a.x, b.z - a.z)
  const ffl = finishedFloor(floor)
  const out: FacePort[] = []
  for (const item of fixturesOnWall(floor, wall.id)) {
    // Outside, a gas geyser's water goes straight through the wall behind it: nothing is chased.
    if (item.side !== side || fixtureSpec(item.fixture.kind).outside) continue
    const u = side === 1 ? item.u : length - item.u
    for (const port of PORTS[item.fixture.kind] ?? []) {
      if (port.kind === 'gas') continue
      out.push({ u: u + port.along, v: ffl + port.y, kind: port.kind, dia: port.dia })
    }
  }
  return out
}

// Everything chased into the walls inside the house: risers and drops by kind, and the length of chase cut.
export function wallChases(doc: Document): { cold: number; hot: number; waste: Record<number, number>; chase: number } {
  const totals = { cold: 0, hot: 0, waste: {} as Record<number, number>, chase: 0 }
  for (const floor of doc.building.floors) {
    for (const wall of floor.walls) {
      if (wall.skin === 'logical') continue
      for (const side of [1, -1] as const) {
        for (const run of chaseRuns(facePorts(floor, wall, side), finishedFloor(floor), WALL_HEAD)) {
          const length = runLength(run)
          totals.chase += length
          if (run.kind === 'cold') totals.cold += length
          else if (run.kind === 'hot') totals.hot += length
          else if (run.kind === 'waste') {
            const dia = run.dia >= 0.1 ? 110 : 50
            totals.waste[dia] = (totals.waste[dia] ?? 0) + length
          }
        }
      }
    }
  }
  return totals
}

export function waterTrench(length: number): number {
  return length * 0.3 * WATER_TRENCH_DEPTH_M
}

import { BoxGeometry, BufferGeometry, CylinderGeometry, LatheGeometry, Matrix4, SphereGeometry, TorusGeometry, Vector2, Vector3 } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { cornerById } from '../model/geom'
import { BOTTLE_GAP_M, BOTTLES, bottleSetup, CAGE_M, EITHER_SIDE, fixtureFootprint, fixtureSize, fixtureSpec } from '../model/fixtures'
import type { Document, Fixture, FixtureKind, Floor, Wall } from '../model/types'
import { settleAgainstCounters } from './counters'
import { wallReach } from './outline'
import { floorWorldDatum, groundPad, levelField, padBleed, pointInRing, ringDistance, wallDatum, type LevelPad, type Ring } from './pad'
import { floorCells, ringLabelPoint, type WallSide } from './spaces'
import { stairBase } from './stairs'
import { bilinearHeight } from './terrain'

type Point = { x: number; z: number }

export const FIXTURE_SNAP_M = 0.8
const FACE_GAP_M = 0.002
const CENTRE_SNAP_M = 0.5

export type FixturePlacement = { fixture: Omit<Fixture, 'id'>; snapped: boolean; problem: string | null }

function dot(a: Point, b: Point): number {
  return a.x * b.x + a.z * b.z
}

// The finished floor of a storey sits above its datum by the surface bed on the ground floor.
export function finishedFloor(floor: Floor): number {
  return stairBase(floor.index)
}

// Floor-standing fittings outside stand on the ground, not on the indoor slab.
export function standsOnGrade(floor: Floor, fixture: Pick<Fixture, 'kind' | 'x' | 'z'>): boolean {
  if (floor.index !== 0) return false
  const spec = fixtureSpec(fixture.kind)
  if (spec.mount !== 'floor') return false
  if (spec.outside) return true
  if (!EITHER_SIDE.includes(fixture.kind)) return false
  return !floorCells(floor).some((cell) => pointInRing(cell.ring, fixture.x, fixture.z))
}

function floorSupportDatum(doc: Document, floor: Floor): number {
  const pad = groundPad(doc)
  if (!pad) return 0
  for (const wall of floor.walls) {
    const datum = wallDatum(floor, wall, pad)
    if (datum !== null) return datum
  }
  return pad.structures[0]?.datum ?? 0
}

// The level patch of ground a floor-standing outdoor fitting needs, in plan.
export function fixturePadRing(fixture: Pick<Fixture, 'kind' | 'x' | 'z' | 'dx' | 'dz' | 'bottles' | 'bottleKg' | 'cage' | 'litres'>): Ring {
  if (fixture.kind === 'water-tank') {
    const depth = fixtureSize(fixture).depth
    const { side } = tankSlab(fixtureSize(fixture).width)
    const along = { x: fixture.dz, z: -fixture.dx }
    const out = { x: fixture.dx, z: fixture.dz }
    const back = { x: fixture.x - out.x * (depth / 2), z: fixture.z - out.z * (depth / 2) }
    const mid = { x: back.x + out.x * (side / 2), z: back.z + out.z * (side / 2) }
    const half = side / 2
    return [
      { x: mid.x - along.x * half - out.x * half, z: mid.z - along.z * half - out.z * half },
      { x: mid.x + along.x * half - out.x * half, z: mid.z + along.z * half - out.z * half },
      { x: mid.x + along.x * half + out.x * half, z: mid.z + along.z * half + out.z * half },
      { x: mid.x - along.x * half + out.x * half, z: mid.z - along.z * half + out.z * half },
    ]
  }
  return fixtureFootprint(fixture)
}

function maxGradeInRing(field: Document['heightfield'], ring: Ring): number {
  let max = -Infinity
  const sample = (x: number, z: number) => {
    max = Math.max(max, bilinearHeight(field, x, z))
  }
  for (const point of ring) sample(point.x, point.z)
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    sample((a.x + b.x) / 2, (a.z + b.z) / 2)
  }
  const cx = ring.reduce((sum, point) => sum + point.x, 0) / ring.length
  const cz = ring.reduce((sum, point) => sum + point.z, 0) / ring.length
  sample(cx, cz)
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (const point of ring) {
    minX = Math.min(minX, point.x)
    maxX = Math.max(maxX, point.x)
    minZ = Math.min(minZ, point.z)
    maxZ = Math.max(maxZ, point.z)
  }
  const step = Math.max(field.cellSize / 2, 0.2)
  for (let x = minX; x <= maxX + 1e-9; x += step) {
    for (let z = minZ; z <= maxZ + 1e-9; z += step) {
      if (pointInRing(ring, x, z)) sample(x, z)
    }
  }
  return max
}

// World height of the leveled pad under an outdoor floor fitting: the high point of the natural ground
// under its footprint, and at least the building pad when it stands beside a leveled wall.
export function fixturePadWorldDatum(doc: Document, floor: Floor, fixture: Pick<Fixture, 'kind' | 'x' | 'z' | 'dx' | 'dz' | 'bottles' | 'bottleKg' | 'cage' | 'litres'>): number {
  const ring = fixturePadRing(fixture)
  const natural = maxGradeInRing(doc.heightfield, ring)
  const pad = groundPad(doc)
  if (!pad) return natural
  const reach = padBleed(doc.heightfield) + (fixture.kind === 'water-tank' ? tankSlab(fixtureSize(fixture).width).side : fixtureSize(fixture).depth)
  let beside: number | null = null
  for (const structure of pad.structures) {
    for (const room of structure.rings) {
      if (ringDistance(room, fixture.x, fixture.z) <= reach) {
        beside = beside === null ? structure.datum : Math.max(beside, structure.datum)
      }
    }
  }
  // Beside the house, keep the pad on the building platform (cut or fill). Away from it, take the high point of the ground.
  return beside !== null ? beside : natural
}

// Pads to flatten into the site heightfield so outdoor fittings sit on level ground.
export function fixturePads(doc: Document): LevelPad[] {
  const ground = doc.building.floors.find((floor) => floor.index === 0)
  if (!ground) return []
  return (ground.fixtures ?? [])
    .filter((fixture) => standsOnGrade(ground, fixture))
    .map((fixture) => ({
      datum: fixturePadWorldDatum(doc, ground, fixture),
      rings: [fixturePadRing(fixture)],
    }))
}

// How far above the ground floor's structural datum the underside of a fitting stands.
export function fixtureStandAboveDatum(doc: Document, floor: Floor, fixture: Pick<Fixture, 'kind' | 'x' | 'z' | 'dx' | 'dz' | 'bottles' | 'bottleKg' | 'cage' | 'litres'>): number {
  if (!standsOnGrade(floor, fixture)) return finishedFloor(floor)
  return fixturePadWorldDatum(doc, floor, fixture) - floorWorldDatum(floor.datumHeight, floorSupportDatum(doc, floor))
}

// Site ground with building pads and outdoor fitting pads leveled.
export function siteField(doc: Document): Document['heightfield'] {
  const pad = groundPad(doc)
  return levelField(doc.heightfield, pad?.structures ?? [], fixturePads(doc))
}

// A fitting's own setup, such as how many gas bottles it holds, which can change its size.
export type FixtureSetup = Partial<Pick<Fixture, 'bottles' | 'bottleKg' | 'cage' | 'litres'>>

function against(face: Point, n: Point, kind: FixtureKind, y: number, setup: FixtureSetup = {}): Omit<Fixture, 'id'> {
  const reach = fixtureSize({ kind, ...setup }).depth / 2 + FACE_GAP_M
  return { kind, ...setup, x: face.x + n.x * reach, z: face.z + n.z * reach, dx: n.x, dz: n.z, y }
}

// Indoors, gas bottles start as a single 9 kg bottle with no cage.
const INDOOR_SETUP: Partial<Record<FixtureKind, FixtureSetup>> = { 'gas-cylinder': { bottles: 1, bottleKg: 9, cage: false } }

// Where a fixture goes for a pointer: snapped against the nearest wall face it can use, or over the middle of a room.
// How close to a downpipe a rainwater tank has to come to be pulled under it.
export const TANK_SNAP_M = 2

export function placeFixture(
  floor: Floor,
  pointer: Point,
  kind: FixtureKind,
  preferred: Point,
  options: { setup?: FixtureSetup; downpipes?: Point[]; plot?: [number, number][] } = {},
): FixturePlacement {
  const spec = fixtureSpec(kind)
  const cells = floorCells(floor)
  const cell = cells.find((item) => pointInRing(item.net, pointer.x, pointer.z))
  const free: Omit<Fixture, 'id'> = { kind, x: pointer.x, z: pointer.z, dx: preferred.x, dz: preferred.z, y: spec.y }

  if (spec.mount === 'ceiling') {
    if (!cell) return { fixture: free, snapped: false, problem: 'Point inside a room.' }
    const middle = ringLabelPoint(cell.net)
    const near = Math.hypot(middle.x - pointer.x, middle.z - pointer.z) < CENTRE_SNAP_M
    return { fixture: near ? { ...free, x: middle.x, z: middle.z } : free, snapped: near, problem: null }
  }

  let best: { fixture: Omit<Fixture, 'id'>; score: number } | null = null
  // A fixture is judged by how far it is from the pointer, or from where it was before it snapped to something.
  const consider = (fixture: Omit<Fixture, 'id'>, fits: boolean, from: Point = fixture) => {
    if (!fits) return
    const score = Math.hypot(from.x - pointer.x, from.z - pointer.z)
    if (score > FIXTURE_SNAP_M || (best && score >= best.score)) return
    best = { fixture, score }
  }

  const plotRing = options.plot?.map(([x, z]) => ({ x, z }))
  const onPlot = (point: Point) => !plotRing || pointInRing(plotRing, point.x, point.z)
  const either = EITHER_SIDE.includes(kind)
  if (!spec.outside && !cell) return { fixture: free, snapped: false, problem: 'Point inside a room, near a wall.' }
  if (cell && (!spec.outside || either)) {
    // A new fitting indoors starts with the indoor setup, under any size chosen for it; one being moved keeps its own.
    const setup = { ...INDOOR_SETUP[kind], ...options.setup }
    const size = fixtureSize({ kind, ...setup })
    const ring = cell.net
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]
      const b = ring[(i + 1) % ring.length]
      const edge = Math.hypot(b.x - a.x, b.z - a.z)
      if (edge < size.width) continue
      const t = { x: (b.x - a.x) / edge, z: (b.z - a.z) / edge }
      let n = { x: -t.z, z: t.x }
      const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 }
      if (!pointInRing(ring, mid.x + n.x * 0.01, mid.z + n.z * 0.01)) n = { x: -n.x, z: -n.z }
      const half = size.width / 2
      const raw = dot({ x: pointer.x - a.x, z: pointer.z - a.z }, t)
      // A kitchen fitting settles against the counters on this wall: a sink flush with one, a stove beside one.
      const s = Math.min(edge - half, Math.max(half, settleAgainstCounters(floor, kind, a, t, n, raw, half)))
      const fixture = against({ x: a.x + t.x * s, z: a.z + t.z * s }, n, kind, spec.y, setup)
      // Judged from where it stood before a counter drew it along the wall.
      const drawn = s - Math.min(edge - half, Math.max(half, raw))
      consider(fixture, fixtureFootprint(fixture).every((point) => pointInRing(ring, point.x, point.z)), { x: fixture.x - t.x * drawn, z: fixture.z - t.z * drawn })
    }
  }
  if (spec.outside || either) {
    const inAnyRoom = (point: Point) => cells.some((item) => pointInRing(item.ring, point.x, point.z))
    for (const wall of floor.walls) {
      if (wall.skin === 'logical') continue
      const a = cornerById(floor.corners, wall.startCornerId)
      const b = cornerById(floor.corners, wall.endCornerId)
      if (!a || !b) continue
      const length = Math.hypot(b.x - a.x, b.z - a.z)
      if (length < fixtureSize({ kind, ...options.setup }).width) continue
      const t = { x: (b.x - a.x) / length, z: (b.z - a.z) / length }
      const reach = wallReach(wall)
      const setup = options.setup ?? {}
      const half = fixtureSize({ kind, ...setup }).width / 2
      const clamp = (along: number) => Math.min(length - half - reach, Math.max(half + reach, along))
      for (const side of [1, -1] as const) {
        const n = { x: -t.z * side, z: t.x * side }
        let s = clamp(dot({ x: pointer.x - a.x, z: pointer.z - a.z }, t))
        const unsnapped = against({ x: a.x + t.x * s + n.x * reach, z: a.z + t.z * s + n.z * reach }, n, kind, spec.y, setup)
        // A rainwater tank near a downpipe on this side of the wall slides along the wall to stand under it.
        if (kind === 'water-tank') {
          const pipe = (options.downpipes ?? [])
            .filter((item) => Math.hypot(item.x - pointer.x, item.z - pointer.z) < TANK_SNAP_M && dot({ x: item.x - a.x, z: item.z - a.z }, n) > 0)
            .sort((p, q) => Math.hypot(p.x - pointer.x, p.z - pointer.z) - Math.hypot(q.x - pointer.x, q.z - pointer.z))[0]
          if (pipe) {
            // Downpipes often stand at a corner, past the end of the wall: the tank may stand out past it too,
            // as far as the wall's end, so long as it stays clear of the rooms.
            const under = Math.min(length, Math.max(0, dot({ x: pipe.x - a.x, z: pipe.z - a.z }, t)))
            const there = against({ x: a.x + t.x * under + n.x * reach, z: a.z + t.z * under + n.z * reach }, n, kind, spec.y, setup)
            s = fixtureFootprint(there).some((point) => inAnyRoom(point) || !onPlot(point)) ? clamp(under) : under
          }
        }
        const face = { x: a.x + t.x * s + n.x * reach, z: a.z + t.z * s + n.z * reach }
        const fixture = against(face, n, kind, spec.y, setup)
        // Outside, a fitting stands on the plot, not over the boundary.
        const fits = !inAnyRoom({ x: face.x + n.x * 0.05, z: face.z + n.z * 0.05 }) && fixtureFootprint(fixture).every(onPlot)
        consider(fixture, fits, unsnapped)
      }
    }
  }

  const found = best as { fixture: Omit<Fixture, 'id'> } | null
  if (!found) {
    return {
      fixture: free,
      snapped: false,
      problem: spec.outside ? 'Point outside, near an outside wall.' : 'Point near a wall of the room.',
    }
  }
  return { fixture: found.fixture, snapped: true, problem: null }
}

export type FixtureOnWall = { fixture: Fixture; wall: Wall; side: WallSide; u: number }

// The wall face a fixture has its back to, and how far along that wall it sits.
export function fixtureWall(floor: Floor, fixture: Fixture): FixtureOnWall | null {
  const spec = fixtureSpec(fixture.kind)
  if (spec.mount === 'ceiling') return null
  const depth = fixtureSize(fixture).depth
  const back = {
    x: fixture.x - fixture.dx * (depth / 2 + FACE_GAP_M),
    z: fixture.z - fixture.dz * (depth / 2 + FACE_GAP_M),
  }
  let best: (FixtureOnWall & { miss: number }) | null = null
  for (const wall of floor.walls) {
    if (wall.skin === 'logical') continue
    const a = cornerById(floor.corners, wall.startCornerId)
    const b = cornerById(floor.corners, wall.endCornerId)
    if (!a || !b) continue
    const length = Math.hypot(b.x - a.x, b.z - a.z)
    if (length < 1e-9) continue
    const t = { x: (b.x - a.x) / length, z: (b.z - a.z) / length }
    const normal = { x: -t.z, z: t.x }
    const offset = { x: back.x - a.x, z: back.z - a.z }
    const u = dot(offset, t)
    if (u < -0.01 || u > length + 0.01) continue
    const across = dot(offset, normal)
    const side: WallSide = across >= 0 ? 1 : -1
    const miss = Math.abs(Math.abs(across) - wallReach(wall))
    if (miss > 0.03) continue
    if (dot({ x: fixture.dx, z: fixture.dz }, { x: normal.x * side, z: normal.z * side }) < 0.9) continue
    if (!best || miss < best.miss) best = { fixture, wall, side, u, miss }
  }
  if (!best) return null
  const { miss: _miss, ...found } = best
  return found
}

export function fixturesOnWall(floor: Floor, wallId: string): FixtureOnWall[] {
  return (floor.fixtures ?? []).flatMap((fixture) => {
    const found = fixtureWall(floor, fixture)
    return found && found.wall.id === wallId ? [found] : []
  })
}

// A fixture placed on a wall face at a distance u along the wall, with its underside y above the finished floor.
export function fixtureOnFace(
  floor: Floor,
  wall: Wall,
  side: WallSide,
  kind: FixtureKind,
  u: number,
  y: number,
  setup: FixtureSetup = {},
): Omit<Fixture, 'id'> | null {
  const a = cornerById(floor.corners, wall.startCornerId)
  const b = cornerById(floor.corners, wall.endCornerId)
  if (!a || !b) return null
  const length = Math.hypot(b.x - a.x, b.z - a.z)
  if (length < 1e-9) return null
  const t = { x: (b.x - a.x) / length, z: (b.z - a.z) / length }
  const n = { x: -t.z * side, z: t.x * side }
  const reach = wallReach(wall)
  const half = fixtureSize({ kind, ...setup }).width / 2
  const at = Math.min(length - half, Math.max(half, u))
  return against({ x: a.x + t.x * at + n.x * reach, z: a.z + t.z * at + n.z * reach }, n, kind, y, setup)
}

export type FixturePart = {
  geometry: BufferGeometry
  colour: string
  roughness: number
  metalness: number
  emissive?: string
  emissiveIntensity?: number
}

type Finish = {
  colour: string
  roughness: number
  metalness: number
  emissive?: string
  emissiveIntensity?: number
}

const CERAMIC: Finish = { colour: '#f2f1ee', roughness: 0.22, metalness: 0.04 }
const CERAMIC_LID: Finish = { colour: '#eae9e4', roughness: 0.28, metalness: 0.04 }
const PLATE: Finish = { colour: '#ecece8', roughness: 0.55, metalness: 0.05 }
const CHROME: Finish = { colour: '#9aa3ab', roughness: 0.28, metalness: 0.85 }
const BRUSHED: Finish = { colour: '#8a9198', roughness: 0.45, metalness: 0.65 }
const COUNTER: Finish = { colour: '#d2cbbd', roughness: 0.55, metalness: 0.02 }
const CABINET: Finish = { colour: '#e8e4dc', roughness: 0.65, metalness: 0.02 }
const GLOW: Finish = { colour: '#fff4cc', roughness: 0.4, metalness: 0, emissive: '#ffe9a8', emissiveIntensity: 0.55 }
const TANK: Finish = { colour: '#2f6b3c', roughness: 0.55, metalness: 0.08 }
const TANK_RIM: Finish = { colour: '#274f32', roughness: 0.5, metalness: 0.1 }
const CONCRETE: Finish = { colour: '#a8a29e', roughness: 0.92, metalness: 0.02 }
const HOB: Finish = { colour: '#1f1f22', roughness: 0.35, metalness: 0.4 }
const RING: Finish = { colour: '#3f3f46', roughness: 0.4, metalness: 0.5 }
const BOTTLE: Finish = { colour: '#c0c5cb', roughness: 0.35, metalness: 0.55 }
const CAGE: Finish = { colour: '#9aa3a8', roughness: 0.4, metalness: 0.7 }
const APPLIANCE: Finish = { colour: '#f4f4f2', roughness: 0.35, metalness: 0.25 }
const APPLIANCE_DARK: Finish = { colour: '#2a2a2e', roughness: 0.45, metalness: 0.35 }
const GLASS: Finish = { colour: '#9eb0bc', roughness: 0.15, metalness: 0.1 }
const WATER: Finish = { colour: '#b7c9d4', roughness: 0.2, metalness: 0.05 }
const PLASTIC: Finish = { colour: '#d8dde2', roughness: 0.5, metalness: 0.05 }
const DB: Finish = { colour: '#6b7280', roughness: 0.45, metalness: 0.55 }
const DB_FACE: Finish = { colour: '#4b5563', roughness: 0.5, metalness: 0.45 }

// A hair above the floor, so a shower tray or washing machine does not flicker against the slab.
const FLOOR_CLEAR_M = 0.003

// Square concrete pad under a rainwater tank: side and thickness grow with the tank.
export function tankSlab(diameter: number): { side: number; thick: number } {
  const over = Math.max(0.1, Math.round(diameter * 0.1 * 20) / 20)
  const thick = Math.max(0.1, Math.round(diameter * 0.075 * 20) / 20)
  return { side: diameter + 2 * over, thick }
}

export function tankSlabSide(diameter: number): number {
  return tankSlab(diameter).side
}

type Piece = { geometry: BufferGeometry; along: number; out: number; y: number; finish: Finish }

function centreAtOrigin(geometry: BufferGeometry): BufferGeometry {
  geometry.computeBoundingBox()
  const mid = geometry.boundingBox!.getCenter(new Vector3())
  geometry.translate(-mid.x, -mid.y, -mid.z)
  return geometry
}

function box(w: number, d: number, h: number, along: number, out: number, y: number, finish: Finish): Piece {
  return { geometry: new BoxGeometry(w, h, d), along, out, y: y + h / 2, finish }
}

function puck(r: number, h: number, along: number, out: number, y: number, finish: Finish, segments = 20): Piece {
  return { geometry: new CylinderGeometry(r, r, h, segments), along, out, y: y + h / 2, finish }
}

function drum(r0: number, r1: number, h: number, along: number, out: number, y: number, finish: Finish, segments = 20): Piece {
  return { geometry: new CylinderGeometry(r1, r0, h, segments), along, out, y: y + h / 2, finish }
}

function finishKey(finish: Finish): string {
  return `${finish.colour}|${finish.roughness}|${finish.metalness}|${finish.emissive ?? ''}|${finish.emissiveIntensity ?? 0}`
}

// A basin or sink bowl: lathed cup, rim at the top, sitting on y.
function bowl(rim: number, depth: number, along: number, out: number, y: number, finish: Finish): Piece {
  const profile = [
    new Vector2(0.008, 0),
    new Vector2(rim * 0.35, depth * 0.08),
    new Vector2(rim * 0.72, depth * 0.45),
    new Vector2(rim * 0.95, depth * 0.88),
    new Vector2(rim, depth),
    new Vector2(rim * 0.88, depth),
    new Vector2(rim * 0.55, depth * 0.55),
    new Vector2(rim * 0.2, depth * 0.2),
    new Vector2(0.008, depth * 0.12),
  ]
  return { geometry: centreAtOrigin(new LatheGeometry(profile, 28)), along, out, y: y + depth / 2, finish }
}

function mixer(along: number, out: number, y: number): Piece[] {
  return [
    puck(0.018, 0.06, along, out, y, CHROME, 12),
    box(0.09, 0.018, 0.018, along, out + 0.04, y + 0.05, CHROME),
    puck(0.012, 0.04, along, out + 0.08, y + 0.03, CHROME, 10),
  ]
}

// Pieces in the fixture's own frame: along the wall, out from its back, and up from its underside.
function pieces(fixture: Fixture): Piece[] {
  const kind = fixture.kind
  const { width: w, depth: d, height: h } = fixtureSize(fixture)
  switch (kind) {
    case 'wc': {
      const cistern = [
        box(0.36, 0.17, 0.38, 0, 0.085, 0.4, CERAMIC),
        box(0.38, 0.19, 0.03, 0, 0.085, 0.78, CERAMIC_LID),
        puck(0.02, 0.015, 0, 0.085, 0.81, CHROME, 10),
      ]
      const bowlBody = centreAtOrigin(new SphereGeometry(0.2, 20, 14)).scale(0.9, 0.55, 1.15)
      const bowl: Piece = { geometry: bowlBody, along: 0, out: 0.42, y: 0.28, finish: CERAMIC }
      const rim = centreAtOrigin(new TorusGeometry(0.17, 0.025, 10, 24)).rotateX(Math.PI / 2)
      const seat: Piece = { geometry: rim, along: 0, out: 0.42, y: 0.4, finish: CERAMIC_LID }
      const base = [drum(0.12, 0.16, 0.18, 0, 0.4, 0, CERAMIC, 16), puck(0.11, 0.04, 0, 0.4, 0, CERAMIC, 16)]
      return [...cistern, bowl, seat, ...base]
    }
    case 'basin': {
      const deck = box(w, d, 0.05, 0, d / 2, h - 0.05, CERAMIC)
      const apron = box(w * 0.92, d * 0.7, h - 0.08, 0, d * 0.45, 0, CERAMIC)
      const cup = bowl(Math.min(w, d) * 0.32, 0.12, 0, d * 0.48, h - 0.16, CERAMIC)
      const bracket = box(0.08, 0.04, 0.12, 0, 0.02, 0.5, BRUSHED)
      return [deck, apron, cup, bracket, ...mixer(0, d * 0.22, h - 0.02)]
    }
    case 'shower': {
      const lip = 0.04
      const tray = [
        box(w, d, 0.03, 0, d / 2, 0, CERAMIC),
        box(w, lip, h, 0, lip / 2, 0, CERAMIC),
        box(w, lip, h, 0, d - lip / 2, 0, CERAMIC),
        box(lip, d, h, -w / 2 + lip / 2, d / 2, 0, CERAMIC),
        box(lip, d, h, w / 2 - lip / 2, d / 2, 0, CERAMIC),
      ]
      const drain = puck(0.04, 0.008, 0, d / 2, 0.03, CHROME, 12)
      const riser = puck(0.015, 1.85, 0, 0.06, 0.05, CHROME, 10)
      const arm = box(0.02, 0.22, 0.02, 0, 0.16, 1.88, CHROME)
      const rose = puck(0.08, 0.02, 0, 0.28, 1.86, CHROME, 16)
      const face = puck(0.07, 0.008, 0, 0.29, 1.85, BRUSHED, 16)
      return [...tray, drain, riser, arm, rose, face]
    }
    case 'bath': {
      const wall = 0.055
      const floor = 0.07
      const shell = [
        box(w - 2 * wall, d - 2 * wall, floor, 0, d / 2, 0, CERAMIC),
        box(w, wall, h, 0, wall / 2, 0, CERAMIC),
        box(w, wall, h, 0, d - wall / 2, 0, CERAMIC),
        box(wall, d, h, -w / 2 + wall / 2, d / 2, 0, CERAMIC),
        box(wall, d, h, w / 2 - wall / 2, d / 2, 0, CERAMIC),
        box(w, d, 0.03, 0, d / 2, h - 0.03, CERAMIC_LID),
      ]
      const water = box(w - 2 * wall - 0.04, d - 2 * wall - 0.04, 0.01, 0, d / 2, h * 0.42, WATER)
      const taps = mixer(-w / 2 + 0.18, d * 0.22, h - 0.02)
      return [...shell, water, ...taps]
    }
    case 'sink': {
      const carcass = [
        box(w, d - 0.02, h - 0.06, 0, d / 2, 0, CABINET),
        box(w, d, 0.045, 0, d / 2, h - 0.045, COUNTER),
        box(0.012, 0.01, h - 0.12, 0, d - 0.03, 0.06, BRUSHED),
        box(w * 0.42, 0.01, h * 0.55, -w * 0.22, d - 0.03, 0.12, CERAMIC_LID),
        box(w * 0.42, 0.01, h * 0.55, w * 0.22, d - 0.03, 0.12, CERAMIC_LID),
      ]
      const cups = [
        bowl(0.16, 0.12, -0.22, d * 0.48, h - 0.15, CERAMIC),
        bowl(0.12, 0.1, 0.2, d * 0.48, h - 0.14, CERAMIC),
      ]
      return [...carcass, ...cups, ...mixer(-0.05, d * 0.2, h - 0.01)]
    }
    case 'water-tank': {
      const { side: slab, thick } = tankSlab(w)
      // Pad back flush with the wall face; the overhang falls into the yard and along the wall.
      const slabOut = slab / 2
      const bodyH = h - thick - 0.12
      return [
        box(slab, slab, thick, 0, slabOut, 0, CONCRETE),
        puck(w / 2, bodyH, 0, d / 2, thick, TANK, 28),
        drum(w / 2, (w / 2) * 0.55, 0.12, 0, d / 2, thick + bodyH, TANK_RIM, 24),
        puck(w / 2 * 0.5, 0.04, 0, d / 2, h - 0.04, TANK_RIM, 20),
        puck(0.04, 0.08, 0, d / 2, h - 0.02, CHROME, 10),
      ]
    }
    case 'washing-machine': {
      const door = centreAtOrigin(new CylinderGeometry(0.2, 0.2, 0.04, 28)).rotateX(Math.PI / 2)
      return [
        box(w, d, h, 0, d / 2, 0, APPLIANCE),
        box(w - 0.04, 0.02, 0.08, 0, 0.02, h - 0.1, APPLIANCE_DARK),
        { geometry: door, along: 0, out: 0.02, y: h * 0.45, finish: GLASS },
        puck(0.22, 0.02, 0, 0.035, h * 0.45 - 0.01, BRUSHED, 24),
        puck(0.015, 0.03, w * 0.28, 0.03, h - 0.07, CHROME, 8),
        box(0.04, 0.04, 0.03, -w / 2 + 0.05, 0.05, 0, APPLIANCE_DARK),
        box(0.04, 0.04, 0.03, w / 2 - 0.05, 0.05, 0, APPLIANCE_DARK),
        box(0.04, 0.04, 0.03, -w / 2 + 0.05, d - 0.05, 0, APPLIANCE_DARK),
        box(0.04, 0.04, 0.03, w / 2 - 0.05, d - 0.05, 0, APPLIANCE_DARK),
      ]
    }
    case 'geyser':
    case 'solar-geyser': {
      const tank = centreAtOrigin(new CylinderGeometry(d / 2, d / 2, w, 28)).rotateZ(Math.PI / 2)
      const parts: Piece[] = [
        { geometry: tank, along: 0, out: d / 2, y: h / 2, finish: APPLIANCE },
        puck(d / 2 + 0.01, 0.04, -w / 2 + 0.02, d / 2, h / 2 - 0.02, BRUSHED, 16),
        puck(d / 2 + 0.01, 0.04, w / 2 - 0.02, d / 2, h / 2 - 0.02, BRUSHED, 16),
        puck(0.03, 0.1, -w / 4, d / 2, 0, CHROME, 10),
        puck(0.03, 0.1, w / 4, d / 2, 0, CHROME, 10),
      ]
      if (kind === 'solar-geyser') {
        parts.push(box(w * 0.5, 0.04, 0.04, 0, d / 2, h / 2 + d / 2 + 0.02, { colour: '#1e2a44', roughness: 0.35, metalness: 0.4 }))
      }
      return parts
    }
    case 'stove':
    case 'gas-stove': {
      const gas = kind === 'gas-stove'
      const body = [
        box(w, d, h - 0.05, 0, d / 2, 0, APPLIANCE),
        box(w - 0.05, d - 0.08, 0.025, 0, d / 2 + 0.02, h - 0.05, HOB),
        box(w, 0.04, 0.1, 0, 0.02, h - 0.05, APPLIANCE),
        box(w * 0.7, 0.02, h * 0.45, 0, 0.03, 0.12, APPLIANCE_DARK),
        box(w * 0.55, 0.015, 0.03, 0, 0.04, 0.35, BRUSHED),
      ]
      const knobs = [-0.2, -0.07, 0.07, 0.2].map((x) => puck(0.015, 0.02, x, 0.05, h - 0.02, CHROME, 10))
      const burners = [-0.14, 0.14].flatMap((x) =>
        [0.2, 0.42].flatMap((out) => {
          const r = gas ? 0.055 : 0.075
          const ring = puck(r, 0.015, x, out, h - 0.03, gas ? CHROME : RING, 16)
          if (!gas) return [ring]
          return [
            ring,
            box(r * 1.6, 0.008, 0.008, x, out, h - 0.018, BRUSHED),
            box(0.008, r * 1.6, 0.008, x, out, h - 0.018, BRUSHED),
          ]
        }),
      )
      return [...body, ...knobs, ...burners]
    }
    case 'gas-geyser': {
      return [
        box(w, d, h, 0, d / 2, 0, APPLIANCE),
        box(w - 0.04, 0.01, h * 0.35, 0, 0.02, h * 0.35, BRUSHED),
        puck(0.045, 0.14, 0, d / 2, h, CHROME, 14),
        puck(0.018, 0.08, -0.08, d / 2, 0.08, CHROME, 8),
        puck(0.018, 0.08, 0, d / 2, 0.08, CHROME, 8),
        puck(0.018, 0.08, 0.08, d / 2, 0.08, CHROME, 8),
      ]
    }
    case 'gas-cylinder': {
      const { count, kg, cage } = bottleSetup(fixture)
      const bottle = BOTTLES[kg]
      const wrap = cage ? CAGE_M : 0
      const out: Piece[] = []
      for (let i = 0; i < count; i++) {
        const x = -w / 2 + wrap + bottle.dia / 2 + i * (bottle.dia + BOTTLE_GAP_M)
        const bodyH = bottle.height - 0.16
        out.push(
          puck(bottle.dia / 2, bodyH, x, d / 2, 0, BOTTLE, 22),
          drum(bottle.dia / 2, bottle.dia / 2 * 0.45, 0.08, x, d / 2, bodyH, BOTTLE, 18),
          puck(0.045, 0.08, x, d / 2, bodyH + 0.08, CHROME, 12),
        )
      }
      if (cage) {
        const bar = 0.025
        for (const x of [-w / 2 + bar / 2, w / 2 - bar / 2]) {
          for (const z of [bar / 2, d - bar / 2]) out.push(box(bar, bar, h, x, z, 0, CAGE))
        }
        for (const y of [0.02, h / 2, h - bar]) {
          out.push(box(w, bar, bar, 0, d - bar / 2, y, CAGE), box(bar, d, bar, -w / 2 + bar / 2, d / 2, y, CAGE), box(bar, d, bar, w / 2 - bar / 2, d / 2, y, CAGE))
        }
        out.push(box(w, d, bar, 0, d / 2, h - bar, CAGE))
        const bars = Math.max(2, Math.round(w / 0.12))
        for (let i = 1; i < bars; i++) out.push(box(0.008, 0.008, h, -w / 2 + (w * i) / bars, d - bar / 2, 0, CAGE))
      }
      return out
    }
    case 'light':
      return [
        puck(0.04, 0.02, 0, 0, h - 0.02, BRUSHED, 12),
        puck(0.15, h - 0.02, 0, 0, 0, GLOW, 24),
      ]
    case 'outdoor-light':
      return [
        box(0.04, 0.08, 0.04, 0, 0.04, h * 0.55, BRUSHED),
        box(w * 0.7, d * 0.5, h * 0.55, 0, d * 0.55, h * 0.2, BRUSHED),
        box(w * 0.55, d * 0.35, h * 0.35, 0, d * 0.55, h * 0.28, GLOW),
      ]
    case 'db-board':
      return [
        box(w, d, h, 0, d / 2, 0, DB),
        box(w - 0.04, 0.01, h - 0.06, 0, 0.02, 0.03, DB_FACE),
        box(0.02, 0.015, h * 0.35, w * 0.35, 0.03, h * 0.35, CHROME),
        box(w * 0.7, 0.008, 0.015, 0, 0.03, h * 0.2, BRUSHED),
        box(w * 0.7, 0.008, 0.015, 0, 0.03, h * 0.45, BRUSHED),
        box(w * 0.7, 0.008, 0.015, 0, 0.03, h * 0.7, BRUSHED),
      ]
    case 'extractor':
      return [
        box(w, d, h, 0, d / 2, 0, PLASTIC),
        puck(0.08, 0.02, 0, d / 2, h / 2 - 0.01, BRUSHED, 16),
        box(w * 0.7, 0.01, 0.01, 0, 0.02, h * 0.35, BRUSHED),
        box(w * 0.7, 0.01, 0.01, 0, 0.02, h * 0.5, BRUSHED),
        box(w * 0.7, 0.01, 0.01, 0, 0.02, h * 0.65, BRUSHED),
      ]
    case 'outside-tap':
      return [
        puck(0.018, 0.06, 0, 0.03, 0.01, CHROME, 10),
        box(0.06, 0.018, 0.018, 0, 0.06, 0.04, CHROME),
        puck(0.012, 0.035, 0, 0.09, 0.02, CHROME, 8),
        box(0.04, 0.01, 0.01, 0.03, 0.05, 0.055, CHROME),
      ]
    case 'socket':
      return [
        box(w, d, h, 0, d / 2, 0, PLATE),
        box(0.012, 0.01, 0.035, -0.035, 0.02, h * 0.25, APPLIANCE_DARK),
        box(0.012, 0.01, 0.035, 0.035, 0.02, h * 0.25, APPLIANCE_DARK),
        box(0.012, 0.01, 0.035, -0.035, 0.02, h * 0.55, APPLIANCE_DARK),
        box(0.012, 0.01, 0.035, 0.035, 0.02, h * 0.55, APPLIANCE_DARK),
      ]
    case 'switch':
      return [
        box(w, d, h, 0, d / 2, 0, PLATE),
        box(0.035, 0.015, 0.045, 0, 0.025, h * 0.28, CERAMIC_LID),
      ]
    case 'stove-isolator':
      return [
        box(w, d, h, 0, d / 2, 0, PLATE),
        box(0.04, 0.015, 0.055, 0, 0.025, h * 0.35, CERAMIC_LID),
        puck(0.012, 0.02, 0, 0.03, h * 0.75, CHROME, 8),
      ]
    default:
      return [box(w, d, h, 0, d / 2, 0, PLATE)]
  }
}

// One merged geometry per finish for a set of fixtures. baseY is the underside of each fitting, or a function of it.
export function buildFixtureParts(fixtures: Fixture[], baseY: number | ((fixture: Fixture) => number)): FixturePart[] {
  const byFinish = new Map<string, { finish: Finish; list: BufferGeometry[] }>()
  const basis = new Matrix4()
  const move = new Matrix4()
  const baseOf = typeof baseY === 'function' ? baseY : () => baseY
  for (const fixture of fixtures) {
    const spec = fixtureSpec(fixture.kind)
    const out = spec.mount === 'ceiling' ? 0 : fixtureSize(fixture).depth / 2
    const back = { x: fixture.x - fixture.dx * out, z: fixture.z - fixture.dz * out }
    // A right-handed frame (along, up, out), so faces point outwards and nothing renders inside out.
    const along = { x: fixture.dz, z: -fixture.dx }
    for (const piece of pieces(fixture)) {
      basis.set(along.x, 0, fixture.dx, 0, 0, 1, 0, 0, along.z, 0, fixture.dz, 0, 0, 0, 0, 1)
      // A tank's pad sits on the ground; other fittings lift a hair to avoid z-fighting the slab.
      const clear = fixture.kind === 'water-tank' ? 0 : FLOOR_CLEAR_M
      move.makeTranslation(
        back.x + along.x * piece.along + fixture.dx * piece.out,
        baseOf(fixture) + fixture.y + piece.y + clear,
        back.z + along.z * piece.along + fixture.dz * piece.out,
      )
      const geometry = (piece.geometry.index ? piece.geometry.toNonIndexed() : piece.geometry).applyMatrix4(move.multiply(basis))
      if (piece.geometry !== geometry) piece.geometry.dispose()
      const key = finishKey(piece.finish)
      const bucket = byFinish.get(key) ?? { finish: piece.finish, list: [] }
      bucket.list.push(geometry)
      byFinish.set(key, bucket)
    }
  }
  const out: FixturePart[] = []
  for (const { finish, list } of byFinish.values()) {
    const merged = mergeGeometries(list, false)
    for (const geometry of list) geometry.dispose()
    if (merged) {
      out.push({
        geometry: merged,
        colour: finish.colour,
        roughness: finish.roughness,
        metalness: finish.metalness,
        emissive: finish.emissive,
        emissiveIntensity: finish.emissiveIntensity,
      })
    }
  }
  return out
}

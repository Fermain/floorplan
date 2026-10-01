import { BoxGeometry, BufferGeometry, CylinderGeometry, Matrix4 } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { cornerById } from '../model/geom'
import { BOTTLE_GAP_M, BOTTLES, bottleSetup, CAGE_M, EITHER_SIDE, fixtureFootprint, fixtureSize, fixtureSpec } from '../model/fixtures'
import type { Fixture, FixtureKind, Floor, Wall } from '../model/types'
import { wallReach } from './outline'
import { pointInRing } from './pad'
import { floorCells, ringLabelPoint, type WallSide } from './spaces'
import { stairBase } from './stairs'

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

// A fitting's own setup, such as how many gas bottles it holds, which can change its size.
export type FixtureSetup = Partial<Pick<Fixture, 'bottles' | 'bottleKg' | 'cage'>>

function against(face: Point, n: Point, kind: FixtureKind, y: number, setup: FixtureSetup = {}): Omit<Fixture, 'id'> {
  const reach = fixtureSize({ kind, ...setup }).depth / 2 + FACE_GAP_M
  return { kind, ...setup, x: face.x + n.x * reach, z: face.z + n.z * reach, dx: n.x, dz: n.z, y }
}

// Indoors, gas bottles start as a single 9 kg bottle with no cage.
const INDOOR_SETUP: Partial<Record<FixtureKind, FixtureSetup>> = { 'gas-cylinder': { bottles: 1, bottleKg: 9, cage: false } }

// Where a fixture goes for a pointer: snapped against the nearest wall face it can use, or over the middle of a room.
export function placeFixture(floor: Floor, pointer: Point, kind: FixtureKind, preferred: Point): FixturePlacement {
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
  const consider = (fixture: Omit<Fixture, 'id'>, fits: boolean) => {
    if (!fits) return
    const score = Math.hypot(fixture.x - pointer.x, fixture.z - pointer.z)
    if (score > FIXTURE_SNAP_M || (best && score >= best.score)) return
    best = { fixture, score }
  }

  const either = EITHER_SIDE.includes(kind)
  if (!spec.outside && !cell) return { fixture: free, snapped: false, problem: 'Point inside a room, near a wall.' }
  if (cell && (!spec.outside || either)) {
    const setup = INDOOR_SETUP[kind] ?? {}
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
      const s = Math.min(edge - half, Math.max(half, dot({ x: pointer.x - a.x, z: pointer.z - a.z }, t)))
      const fixture = against({ x: a.x + t.x * s, z: a.z + t.z * s }, n, kind, spec.y, setup)
      consider(fixture, fixtureFootprint(fixture).every((point) => pointInRing(ring, point.x, point.z)))
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
      if (length < spec.width) continue
      const t = { x: (b.x - a.x) / length, z: (b.z - a.z) / length }
      const reach = wallReach(wall)
      const half = spec.width / 2
      const s = Math.min(length - half - reach, Math.max(half + reach, dot({ x: pointer.x - a.x, z: pointer.z - a.z }, t)))
      for (const side of [1, -1] as const) {
        const n = { x: -t.z * side, z: t.x * side }
        const face = { x: a.x + t.x * s + n.x * reach, z: a.z + t.z * s + n.z * reach }
        const fixture = against(face, n, kind, spec.y)
        consider(fixture, !inAnyRoom({ x: face.x + n.x * 0.05, z: face.z + n.z * 0.05 }))
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

export type FixturePart = { geometry: BufferGeometry; colour: string }

const CERAMIC = '#f4f4f2'
const PLATE = '#ededea'
const METAL = '#8d9399'
const COUNTER = '#d6d0c4'
const GLOW = '#fff7d6'
// A hair above the floor, so a shower tray or washing machine does not flicker against the slab.
const FLOOR_CLEAR_M = 0.003
const TANK = '#2f5d3a'
const CONCRETE = '#a8a29e'
const HOB = '#2b2b2b'
const BOTTLE = '#b4b8bd'
const CAGE = '#9aa3a8'

type Piece = { geometry: BufferGeometry; along: number; out: number; y: number; colour: string }

function box(w: number, d: number, h: number, along: number, out: number, y: number, colour: string): Piece {
  return { geometry: new BoxGeometry(w, h, d), along, out, y: y + h / 2, colour }
}

function puck(r: number, h: number, along: number, out: number, y: number, colour: string): Piece {
  return { geometry: new CylinderGeometry(r, r, h, 20), along, out, y: y + h / 2, colour }
}

// Pieces in the fixture's own frame: along the wall, out from its back, and up from its underside.
function pieces(fixture: Fixture): Piece[] {
  const kind = fixture.kind
  const { width: w, depth: d, height: h } = fixtureSize(fixture)
  switch (kind) {
    case 'wc':
      return [box(0.36, 0.18, 0.4, 0, 0.09, 0.38, CERAMIC), box(0.34, 0.5, 0.4, 0, 0.43, 0, CERAMIC)]
    case 'basin':
      return [box(w, d, h, 0, d / 2, 0, CERAMIC), puck(0.03, 0.6, 0, 0.12, -0.6, METAL)]
    case 'shower':
      return [box(w, d, h, 0, d / 2, 0, CERAMIC), puck(0.07, 0.02, 0, 0.12, 1.9, METAL)]
    case 'bath':
      return [box(w, d, h, 0, d / 2, 0, CERAMIC)]
    case 'sink':
      return [box(w, d - 0.04, h - 0.04, 0, d / 2, 0, CERAMIC), box(w, d, 0.04, 0, d / 2, h - 0.04, COUNTER)]
    case 'water-tank':
      return [puck(w / 2, h - 0.1, 0, d / 2, 0.1, TANK), puck(w / 2 + 0.05, 0.1, 0, d / 2, 0, CONCRETE)]
    case 'washing-machine':
      return [box(w, d, h, 0, d / 2, 0, CERAMIC)]
    case 'geyser':
    case 'solar-geyser':
      return [{ geometry: new CylinderGeometry(d / 2, d / 2, w, 24).rotateZ(Math.PI / 2), along: 0, out: d / 2, y: h / 2, colour: CERAMIC }]
    case 'stove':
    case 'gas-stove': {
      const body = [box(w, d, h - 0.04, 0, d / 2, 0, CERAMIC), box(w - 0.04, d - 0.06, 0.02, 0, d / 2 + 0.02, h - 0.04, HOB), box(w, 0.04, 0.1, 0, 0.02, h - 0.04, CERAMIC)]
      const rings = [-0.14, 0.14].flatMap((x) => [0.2, 0.42].map((out) => puck(kind === 'gas-stove' ? 0.06 : 0.08, 0.02, x, out, h - 0.025, kind === 'gas-stove' ? METAL : '#3f3f46')))
      return [...body, ...rings]
    }
    case 'gas-geyser':
      return [box(w, d, h, 0, d / 2, 0, CERAMIC), puck(0.05, 0.12, 0, d / 2, h, METAL)]
    case 'gas-cylinder': {
      const { count, kg, cage } = bottleSetup(fixture)
      const bottle = BOTTLES[kg]
      const wrap = cage ? CAGE_M : 0
      const out: Piece[] = []
      for (let i = 0; i < count; i++) {
        const x = -w / 2 + wrap + bottle.dia / 2 + i * (bottle.dia + BOTTLE_GAP_M)
        out.push(puck(bottle.dia / 2, bottle.height - 0.12, x, d / 2, 0, BOTTLE), puck(0.07, 0.12, x, d / 2, bottle.height - 0.12, METAL))
      }
      if (cage) {
        // A galvanised frame: corner posts, rails round the top and bottom, and a mesh panel behind.
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
      return [puck(0.15, h, 0, 0, 0, GLOW)]
    case 'db-board':
      return [box(w, d, h, 0, d / 2, 0, METAL)]
    case 'outside-tap':
      return [puck(0.02, 0.1, 0, 0.05, 0, METAL)]
    default:
      return [box(w, d, h, 0, d / 2, 0, PLATE)]
  }
}

// One merged geometry per colour for a set of fixtures, standing on a finished floor at baseY.
export function buildFixtureParts(fixtures: Fixture[], baseY: number): FixturePart[] {
  const byColour = new Map<string, BufferGeometry[]>()
  const basis = new Matrix4()
  const move = new Matrix4()
  for (const fixture of fixtures) {
    const spec = fixtureSpec(fixture.kind)
    const out = spec.mount === 'ceiling' ? 0 : fixtureSize(fixture).depth / 2
    const back = { x: fixture.x - fixture.dx * out, z: fixture.z - fixture.dz * out }
    // A right-handed frame (along, up, out), so faces point outwards and nothing renders inside out.
    const along = { x: fixture.dz, z: -fixture.dx }
    for (const piece of pieces(fixture)) {
      basis.set(along.x, 0, fixture.dx, 0, 0, 1, 0, 0, along.z, 0, fixture.dz, 0, 0, 0, 0, 1)
      move.makeTranslation(
        back.x + along.x * piece.along + fixture.dx * piece.out,
        baseY + fixture.y + piece.y + FLOOR_CLEAR_M,
        back.z + along.z * piece.along + fixture.dz * piece.out,
      )
      const geometry = (piece.geometry.index ? piece.geometry.toNonIndexed() : piece.geometry).applyMatrix4(move.multiply(basis))
      if (piece.geometry !== geometry) piece.geometry.dispose()
      const list = byColour.get(piece.colour) ?? []
      list.push(geometry)
      byColour.set(piece.colour, list)
    }
  }
  const out: FixturePart[] = []
  for (const [colour, list] of byColour) {
    const merged = mergeGeometries(list, false)
    for (const geometry of list) geometry.dispose()
    if (merged) out.push({ geometry: merged, colour })
  }
  return out
}

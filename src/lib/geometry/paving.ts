import { BufferGeometry, Float32BufferAttribute, ShapeUtils, Vector2 } from 'three'
import { signedPolygonArea } from '../model/geom'
import { carportRing } from '../model/carports'
import { projectDefaults } from '../model/defaults'
import type { Document, PavingSurface } from '../model/types'
import type { DeckPolygon } from './deck'
import { offsetEdges } from './outline'
import type { Ring } from './pad'
import { clipHalfPlane, wallFootprints } from './roof'

// What each surface is built of, top down, as laid in South Africa: the wearing course, a bed, and a G5 sub-base.
export type PavingLayer = { name: string; thickness: number; rateKey: string }

export type PavingSpec = {
  id: PavingSurface
  name: string
  text: string
  colour: string
  layers: PavingLayer[]
  // Pavers and gravel need a kerb or edge restraint all round to stop them spreading.
  edging: boolean
}

const G5: PavingLayer = { name: 'G5 sub-base, compacted', thickness: 0.15, rateKey: 'g5-m3' }
const BEDDING: PavingLayer = { name: 'Bedding sand', thickness: 0.025, rateKey: 'sand-m3' }

export const PAVING: Record<PavingSurface, PavingSpec> = {
  concrete: {
    id: 'concrete',
    name: 'Concrete',
    text: 'A 100 mm concrete slab on a compacted base. The usual apron round a house; plain but hard-wearing.',
    colour: '#bdb8ae',
    layers: [{ name: 'Concrete 25 MPa', thickness: 0.1, rateKey: 'concrete-m3' }, G5],
    edging: false,
  },
  'cement-pavers': {
    id: 'cement-pavers',
    name: 'Cement pavers',
    text: '60 mm interlocking cement pavers on sand, with a kerb along the edges. Takes a car.',
    colour: '#9c958b',
    layers: [BEDDING, G5],
    edging: true,
  },
  'clay-pavers': {
    id: 'clay-pavers',
    name: 'Clay pavers',
    text: '50 mm clay brick pavers on sand, with a kerb along the edges. Warmer looking, a little dearer.',
    colour: '#a65f43',
    layers: [BEDDING, G5],
    edging: true,
  },
  gravel: {
    id: 'gravel',
    name: 'Gravel',
    text: '75 mm of stone on a weed mat, kept in by an edge. The cheapest hard surface, and it lets the rain in.',
    colour: '#c9c2b2',
    layers: [{ name: 'Gravel 19 mm', thickness: 0.075, rateKey: 'gravel-m3' }],
    edging: true,
  },
  'grass-blocks': {
    id: 'grass-blocks',
    name: 'Grass blocks',
    text: 'Open concrete blocks with grass growing through, on sand and a base. A driveway that stays green.',
    colour: '#8f9f78',
    layers: [BEDDING, G5],
    edging: true,
  },
}

export const PAVING_LIST: PavingSpec[] = Object.values(PAVING)

// One stretch of paving: a drawn area, or the apron round the house, with where its edges need restraining.
export type PavingPiece = { id: string; surface: PavingSurface; polygon: DeckPolygon; area: number; edge: number; apron: boolean }

function ringArea(ring: Ring): number {
  return Math.abs(signedPolygonArea(ring))
}

function perimeter(ring: Ring): number {
  let length = 0
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    length += Math.hypot(b.x - a.x, b.z - a.z)
  }
  return length
}

// The apron: a strip of the chosen width outside each building's walls on the ground floor.
export function apronPolygons(doc: Document): DeckPolygon[] {
  const { apronWidth } = projectDefaults(doc)
  if (!(apronWidth > 0)) return []
  const ground = doc.building.floors.find((floor) => floor.index === 0)
  if (!ground || ground.walls.length === 0) return []
  // Round what is built: a patio, deck or carport marked off by lines with nothing on them gets no apron.
  const built = { ...ground, walls: ground.walls.filter((wall) => wall.skin !== 'logical') }
  if (built.walls.length === 0) return []
  return wallFootprints(built).map((footprint) => ({
    outer: withinPlot(offsetEdges(footprint.outer, footprint.outer.map(() => apronWidth)), doc.plot.ring),
    holes: [footprint.outer],
  }))
}

// The apron stops at the boundary. A plot with every corner turning the same way is trimmed side by side; one with
// an inward corner is left as it is.
function withinPlot(ring: Ring, plot: [number, number][]): Ring {
  const n = plot.length
  const turn = (i: number) => {
    const [ax, az] = plot[i]
    const [bx, bz] = plot[(i + 1) % n]
    const [cx, cz] = plot[(i + 2) % n]
    return (bx - ax) * (cz - bz) - (bz - az) * (cx - bx)
  }
  const turns = plot.map((_, i) => turn(i))
  const convex = turns.every((value) => value >= -1e-9) || turns.every((value) => value <= 1e-9)
  if (!convex) return ring
  const sign = turns.some((value) => value > 1e-9) ? 1 : -1
  let out = ring
  for (let i = 0; i < n && out.length >= 3; i++) {
    const [ax, az] = plot[i]
    const [bx, bz] = plot[(i + 1) % n]
    // The inward side of this edge of the plot.
    const axis = { x: -(bz - az) * sign, z: (bx - ax) * sign }
    out = clipHalfPlane(out, axis, ax * axis.x + az * axis.z, true)
  }
  return out
}

export function pavingPieces(doc: Document): PavingPiece[] {
  const pieces: PavingPiece[] = []
  for (const item of doc.paving ?? []) {
    const ring = item.ring.map(([x, z]) => ({ x, z }))
    pieces.push({ id: item.id, surface: item.surface, polygon: { outer: ring, holes: [] }, area: ringArea(ring), edge: perimeter(ring), apron: false })
  }
  const surface = projectDefaults(doc).apronSurface
  apronPolygons(doc).forEach((polygon, i) => {
    const area = ringArea(polygon.outer) - polygon.holes.reduce((sum, hole) => sum + ringArea(hole), 0)
    // Against the wall the apron needs no edging; only its outer edge does.
    pieces.push({ id: `apron-${i}`, surface, polygon, area, edge: perimeter(polygon.outer), apron: true })
  })
  return pieces
}

// Triangles of a polygon with holes, split until no edge is longer than a metre, so they can follow the ground.
function triangles(polygon: DeckPolygon): [number, number][][] {
  const contour = polygon.outer.map((p) => new Vector2(p.x, p.z))
  const holes = polygon.holes.map((hole) => hole.map((p) => new Vector2(p.x, p.z)))
  const all = [...contour, ...holes.flat()]
  const out: [number, number][][] = []
  const split = (a: [number, number], b: [number, number], c: [number, number], depth: number) => {
    const longest = Math.max(Math.hypot(b[0] - a[0], b[1] - a[1]), Math.hypot(c[0] - b[0], c[1] - b[1]), Math.hypot(a[0] - c[0], a[1] - c[1]))
    if (longest <= 1 || depth > 8) {
      out.push([a, b, c])
      return
    }
    const ab: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
    const bc: [number, number] = [(b[0] + c[0]) / 2, (b[1] + c[1]) / 2]
    const ca: [number, number] = [(c[0] + a[0]) / 2, (c[1] + a[1]) / 2]
    split(a, ab, ca, depth + 1)
    split(ab, b, bc, depth + 1)
    split(ca, bc, c, depth + 1)
    split(ab, bc, ca, depth + 1)
  }
  for (const [i, j, k] of ShapeUtils.triangulateShape(contour, holes)) {
    split([all[i].x, all[i].y], [all[j].x, all[j].y], [all[k].x, all[k].y], 0)
  }
  return out
}

export type PavingPart = { geometry: BufferGeometry; colour: string }

// The paving laid over the ground for Review, one mesh per surface. The apron sits a touch higher where they meet.
export function buildPavingParts(doc: Document, heightAt: (x: number, z: number) => number): PavingPart[] {
  const bySurface = new Map<PavingSurface, number[]>()
  for (const piece of pavingPieces(doc)) {
    const lift = piece.apron ? 0.06 : 0.045
    const positions = bySurface.get(piece.surface) ?? []
    for (const triangle of triangles(piece.polygon)) {
      for (const [x, z] of triangle) positions.push(x, heightAt(x, z) + lift, z)
    }
    bySurface.set(piece.surface, positions)
  }
  const parts: PavingPart[] = []
  for (const [surface, positions] of bySurface) {
    if (positions.length === 0) continue
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
    geometry.computeVertexNormals()
    parts.push({ geometry, colour: PAVING[surface].colour })
  }
  return parts
}

type Point = { x: number; z: number }

// Where paving corners like to land: the plot's corners and sides, the house's outside faces and its apron, and
// the corners and sides of paving already laid.
export function pavingSnapTargets(doc: Document): { points: Point[]; edges: [Point, Point][] } {
  const rings: Ring[] = [doc.plot.ring.map(([x, z]) => ({ x, z }))]
  const ground = doc.building.floors.find((floor) => floor.index === 0)
  if (ground && ground.walls.length > 0) for (const footprint of wallFootprints(ground)) rings.push(footprint.outer)
  for (const polygon of apronPolygons(doc)) rings.push(polygon.outer)
  for (const item of doc.paving ?? []) rings.push(item.ring.map(([x, z]) => ({ x, z })))
  for (const carport of doc.carports ?? []) rings.push(carportRing(carport))
  const points = rings.flat()
  const edges = rings.flatMap((ring) => ring.map((p, i) => [p, ring[(i + 1) % ring.length]] as [Point, Point]))
  return { points, edges }
}

// A corner snapped to the nearest target within reach: a corner first, then a side; otherwise to the nearest 50 mm.
export function snapPavingPoint(p: Point, targets: { points: Point[]; edges: [Point, Point][] }, radius: number): { point: Point; snapped: boolean } {
  let best: { point: Point; d: number } | null = null
  for (const q of targets.points) {
    const d = Math.hypot(q.x - p.x, q.z - p.z)
    if (d <= radius && (!best || d < best.d)) best = { point: { x: q.x, z: q.z }, d }
  }
  if (best) return { point: best.point, snapped: true }
  for (const [a, b] of targets.edges) {
    const dx = b.x - a.x
    const dz = b.z - a.z
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1)))
    const q = { x: a.x + dx * t, z: a.z + dz * t }
    const d = Math.hypot(q.x - p.x, q.z - p.z)
    if (d <= radius && (!best || d < best.d)) best = { point: q, d }
  }
  if (best) return { point: best.point, snapped: true }
  return { point: { x: Math.round(p.x * 20) / 20, z: Math.round(p.z * 20) / 20 }, snapped: false }
}

export type PavingTrace = { x1: number; z1: number; x2: number; z2: number }

// A corner with the guides that explain where it landed, as wall drawing shows them: a cross on a corner it
// snapped to, the side it is sliding along, or a line back to each corner it has lined up with. Lining up is
// along and across the drawing grid, against the snap targets and any corners already drawn.
export function guidePavingPoint(
  p: Point,
  targets: { points: Point[]; edges: [Point, Point][] },
  radius: number,
  options: { axis?: Point; nodes?: Point[]; align?: number } = {},
): { point: Point; snapped: boolean; traces: PavingTrace[] } {
  const base = snapPavingPoint(p, targets, radius)
  if (base.snapped) {
    const at = base.point
    const corner = targets.points.some((q) => Math.hypot(q.x - at.x, q.z - at.z) < 1e-6)
    if (corner) {
      const arm = radius * 1.4
      return {
        ...base,
        traces: [
          { x1: at.x - arm, z1: at.z, x2: at.x + arm, z2: at.z },
          { x1: at.x, z1: at.z - arm, x2: at.x, z2: at.z + arm },
        ],
      }
    }
    const side = targets.edges.find(([a, b]) => {
      const length = Math.hypot(b.x - a.x, b.z - a.z) || 1
      return Math.abs(((at.x - a.x) * (b.z - a.z) - (at.z - a.z) * (b.x - a.x)) / length) < 1e-6
    })
    return { ...base, traces: side ? [{ x1: side[0].x, z1: side[0].z, x2: side[1].x, z2: side[1].z }] : [] }
  }
  const axis = options.axis ?? { x: 1, z: 0 }
  const length = Math.hypot(axis.x, axis.z) || 1
  const u = { x: axis.x / length, z: axis.z / length }
  const v = { x: -u.z, z: u.x }
  const reach = options.align ?? radius
  const along = (q: Point) => q.x * u.x + q.z * u.z
  const across = (q: Point) => q.x * v.x + q.z * v.z
  let s = along(p)
  let t = across(p)
  let sNode: { node: Point; d: number } | null = null
  let tNode: { node: Point; d: number } | null = null
  for (const node of [...(options.nodes ?? []), ...targets.points]) {
    const ds = Math.abs(along(node) - s)
    const dt = Math.abs(across(node) - t)
    if (ds <= reach && (!sNode || ds < sNode.d - 1e-9)) sNode = { node, d: ds }
    if (dt <= reach && (!tNode || dt < tNode.d - 1e-9)) tNode = { node, d: dt }
  }
  const step = (value: number) => Math.round(value * 20) / 20
  s = sNode ? along(sNode.node) : step(s)
  t = tNode ? across(tNode.node) : step(t)
  const point = { x: u.x * s + v.x * t, z: u.z * s + v.z * t }
  const traces = [sNode, tNode].flatMap((hit) => (hit ? [{ x1: hit.node.x, z1: hit.node.z, x2: point.x, z2: point.z }] : []))
  return { point, snapped: traces.length > 0, traces }
}

// A rectangle from two opposite corners, square to the given direction.
export function pavingRectangle(a: Point, b: Point, axis: Point = { x: 1, z: 0 }): [number, number][] {
  const length = Math.hypot(axis.x, axis.z) || 1
  const u = { x: axis.x / length, z: axis.z / length }
  const v = { x: -u.z, z: u.x }
  const du = (b.x - a.x) * u.x + (b.z - a.z) * u.z
  const dv = (b.x - a.x) * v.x + (b.z - a.z) * v.z
  const at = (s: number, t: number): [number, number] => [a.x + u.x * s + v.x * t, a.z + u.z * s + v.z * t]
  return [at(0, 0), at(du, 0), at(du, dv), at(0, dv)]
}

function inside(ring: Point[], p: Point): boolean {
  let hit = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]
    const b = ring[j]
    if (a.z > p.z !== b.z > p.z && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) hit = !hit
  }
  return hit
}

// The paving under a point: the most recently laid area first, then the apron.
export function pavingAt(doc: Document, p: Point): { kind: 'paving'; id: string } | { kind: 'apron' } | null {
  for (const item of [...(doc.paving ?? [])].reverse()) {
    if (inside(item.ring.map(([x, z]) => ({ x, z })), p)) return { kind: 'paving', id: item.id }
  }
  for (const polygon of apronPolygons(doc)) {
    if (inside(polygon.outer, p) && !polygon.holes.some((hole) => inside(hole, p))) return { kind: 'apron' }
  }
  return null
}

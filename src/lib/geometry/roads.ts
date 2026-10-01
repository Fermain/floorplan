import { BufferGeometry, Float32BufferAttribute } from 'three'
import type { Plot } from '../model/types'
import { pointInRing } from './pad'

type Point = { x: number; z: number }

// A plain suburban street, for context: a grass verge along the boundary, then the tarred road.
export const VERGE_M = 2.5
export const CARRIAGEWAY_M = 6.5
// How far the road runs on past the plot's corners, either way.
export const ROAD_RUN_M = 12

export type RoadStrip = {
  edge: number
  // Along the road, and out from the plot across it.
  t: Point
  n: Point
  verge: Point[]
  road: Point[]
  // The middle of the road, for its centre line.
  centre: [Point, Point]
}

const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west']

function edgeOf(plot: Plot, edge: number): { a: Point; b: Point; t: Point; n: Point; length: number } | null {
  const ring = plot.ring
  const [ax, az] = ring[edge] ?? []
  const [bx, bz] = ring[(edge + 1) % ring.length] ?? []
  if (ax === undefined || bx === undefined) return null
  const length = Math.hypot(bx - ax, bz - az)
  if (length < 1e-6) return null
  const t = { x: (bx - ax) / length, z: (bz - az) / length }
  let n = { x: -t.z, z: t.x }
  const points = ring.map(([x, z]) => ({ x, z }))
  // The outward side: a step out from the middle of the edge lands outside the plot.
  if (pointInRing(points, (ax + bx) / 2 + n.x * 0.05, (az + bz) / 2 + n.z * 0.05)) n = { x: -n.x, z: -n.z }
  return { a: { x: ax, z: az }, b: { x: bx, z: bz }, t, n, length }
}

// Which way a side of the plot faces, as a compass point, and how long it is.
export function plotSide(plot: Plot, edge: number): { length: number; facing: string } | null {
  const side = edgeOf(plot, edge)
  if (!side) return null
  const b = (plot.northBearingDeg * Math.PI) / 180
  const north = { x: -Math.sin(b), z: Math.cos(b) }
  const east = { x: Math.cos(b), z: Math.sin(b) }
  const angle = Math.atan2(side.n.x * east.x + side.n.z * east.z, side.n.x * north.x + side.n.z * north.z)
  const index = ((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8
  return { length: side.length, facing: COMPASS[index] }
}

// The far kerb of each road, opposite the plot's corners: what a view of the plot should take in.
export function roadReach(plot: Plot): [number, number][] {
  const out: [number, number][] = []
  for (const edge of plot.roads ?? []) {
    const side = edgeOf(plot, edge)
    if (!side) continue
    const across = VERGE_M + CARRIAGEWAY_M
    for (const p of [side.a, side.b]) out.push([p.x + side.n.x * across, p.z + side.n.z * across])
  }
  return out
}

export function roadStrips(plot: Plot): RoadStrip[] {
  const strips: RoadStrip[] = []
  for (const edge of plot.roads ?? []) {
    const side = edgeOf(plot, edge)
    if (!side) continue
    const { t, n } = side
    const at = (p: Point, along: number, out: number) => ({ x: p.x + t.x * along + n.x * out, z: p.z + t.z * along + n.z * out })
    const quad = (from: number, to: number) => [at(side.a, -ROAD_RUN_M, from), at(side.b, ROAD_RUN_M, from), at(side.b, ROAD_RUN_M, to), at(side.a, -ROAD_RUN_M, to)]
    const middle = VERGE_M + CARRIAGEWAY_M / 2
    strips.push({
      edge,
      t,
      n,
      verge: quad(0, VERGE_M),
      road: quad(VERGE_M, VERGE_M + CARRIAGEWAY_M),
      centre: [at(side.a, -ROAD_RUN_M, middle), at(side.b, ROAD_RUN_M, middle)],
    })
  }
  return strips
}

export type RoadPart = { geometry: BufferGeometry; colour: string }

const VERGE_COLOUR = '#7d9a6a'
const ROAD_COLOUR = '#4a4a4f'
const LINE_COLOUR = '#ecebe6'

// A quad laid over the ground: split into strips along and across so it follows the slope, lifted a hair above.
function drape(quad: Point[], heightAt: (x: number, z: number) => number, lift: number, step = 1): number[] {
  const [a, b, , d] = quad
  const along = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / step))
  const across = Math.max(1, Math.ceil(Math.hypot(d.x - a.x, d.z - a.z) / step))
  const at = (i: number, j: number) => {
    const u = i / along
    const v = j / across
    const x = a.x + (b.x - a.x) * u + (d.x - a.x) * v
    const z = a.z + (b.z - a.z) * u + (d.z - a.z) * v
    return [x, heightAt(x, z) + lift, z]
  }
  const out: number[] = []
  for (let i = 0; i < along; i++) {
    for (let j = 0; j < across; j++) {
      const p00 = at(i, j)
      const p10 = at(i + 1, j)
      const p11 = at(i + 1, j + 1)
      const p01 = at(i, j + 1)
      out.push(...p00, ...p01, ...p11, ...p00, ...p11, ...p10)
    }
  }
  return out
}

// Drawn double-sided: a strip's winding depends on which way the road runs.
function geometryOf(positions: number[]): BufferGeometry {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.computeVertexNormals()
  return geometry
}

// The verge, the road and its dashed centre line, draped over the ground for Review.
export function buildRoadParts(plot: Plot, heightAt: (x: number, z: number) => number): RoadPart[] {
  const strips = roadStrips(plot)
  if (strips.length === 0) return []
  const verge: number[] = []
  const road: number[] = []
  const lines: number[] = []
  for (const strip of strips) {
    verge.push(...drape(strip.verge, heightAt, 0.03))
    road.push(...drape(strip.road, heightAt, 0.05))
    const [from, to] = strip.centre
    const length = Math.hypot(to.x - from.x, to.z - from.z)
    const half = 0.06
    for (let s = 0; s + 2 <= length; s += 5) {
      const p = (along: number, side: number) => ({ x: from.x + strip.t.x * along + strip.n.x * side, z: from.z + strip.t.z * along + strip.n.z * side })
      lines.push(...drape([p(s, -half), p(s + 2, -half), p(s + 2, half), p(s, half)], heightAt, 0.07, 2))
    }
  }
  return [
    { geometry: geometryOf(verge), colour: VERGE_COLOUR },
    { geometry: geometryOf(road), colour: ROAD_COLOUR },
    { geometry: geometryOf(lines), colour: LINE_COLOUR },
  ].filter((part) => part.geometry.getAttribute('position').count > 0)
}

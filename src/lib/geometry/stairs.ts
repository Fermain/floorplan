import { pointInsideRings, storeyFootprint } from '../model/stories'
import type { Document, Floor, Stair } from '../model/types'
import { FLOOR_TO_FLOOR } from '../plot/fixture'
import { pointInRing, SURFACE_BED_TOP_ABOVE_DATUM_M, type Ring } from './pad'
import { floorCells } from './spaces'

export const MAX_RISER_M = 0.2
export const MIN_GOING_M = 0.25
export const DEFAULT_STAIR_WIDTH_M = 0.9
export const MIN_STAIR_WIDTH_M = 0.6
export const STAIR_WAIST_M = 0.15

export type StairStep = { u0: number; u1: number; top: number }

export type StairLayout = {
  base: number
  rise: number
  risers: number
  riser: number
  treads: number
  going: number
  length: number
  footprint: Ring
  nosings: { a: { x: number; z: number }; b: { x: number; z: number } }[]
  steps: StairStep[]
}

export function stairBase(floorIndex: number): number {
  return floorIndex === 0 ? SURFACE_BED_TOP_ABOVE_DATUM_M : 0
}

export function stairRise(floorIndex: number): number {
  return FLOOR_TO_FLOOR - stairBase(floorIndex)
}

export function stairLayout(stair: Stair, floorIndex: number): StairLayout {
  const base = stairBase(floorIndex)
  const rise = stairRise(floorIndex)
  const risers = Math.ceil(rise / MAX_RISER_M - 1e-9)
  const riser = rise / risers
  const treads = risers - 1
  const going = MIN_GOING_M
  const length = treads * going
  const side = { x: -stair.dz, z: stair.dx }
  const half = stair.width / 2
  const at = (u: number, s: number) => ({
    x: stair.x + stair.dx * u + side.x * s,
    z: stair.z + stair.dz * u + side.z * s,
  })
  const footprint = [at(0, -half), at(length, -half), at(length, half), at(0, half)]
  const nosings = []
  const steps: StairStep[] = []
  for (let i = 0; i < treads; i++) {
    nosings.push({ a: at(i * going, -half), b: at(i * going, half) })
    steps.push({ u0: i * going, u1: (i + 1) * going, top: base + (i + 1) * riser })
  }
  return { base, rise, risers, riser, treads, going, length, footprint, nosings, steps }
}

export function floorAbove(doc: Document, floor: Floor, footprint: Ring): Floor | undefined {
  return doc.building.floors.find((item) => {
    if (item.index !== floor.index + 1) return false
    const rings = storeyFootprint(doc, item)
    return !!rings && footprint.every((point) => pointInsideRings(rings, point.x, point.z))
  })
}

export function stairFitProblem(doc: Document, floor: Floor, stair: Stair): string | null {
  if (stair.width < MIN_STAIR_WIDTH_M - 1e-9) return 'stair too narrow'
  const { footprint } = stairLayout(stair, floor.index)
  const cells = floorCells(floor)
  const room = cells.find((cell) => footprint.every((point) => pointInRing(cell.net, point.x, point.z)))
  if (!room) return 'stair must fit inside one room'
  if (!floorAbove(doc, floor, footprint)) return 'add a storey above the stair first'
  return null
}

export function stairVoids(doc: Document, floor: Floor): Ring[] {
  if (floor.index === 0) return []
  const rings = storeyFootprint(doc, floor)
  if (!rings || rings.length === 0) return []
  const voids: Ring[] = []
  for (const below of doc.building.floors) {
    if (below.index !== floor.index - 1) continue
    for (const stair of below.stairs ?? []) {
      const { footprint } = stairLayout(stair, below.index)
      if (footprint.every((point) => pointInsideRings(rings, point.x, point.z))) voids.push(footprint)
    }
  }
  return voids
}

export function stairConcreteM3(stair: Stair, floorIndex: number): number {
  const layout = stairLayout(stair, floorIndex)
  const triangles = layout.treads * 0.5 * layout.riser * layout.going
  const waist = Math.hypot(layout.length, layout.rise) * STAIR_WAIST_M
  return stair.width * (triangles + waist)
}

export type StairSnap = 'side' | 'end' | null

export type StairPlacement = { stair: Stair; layout: StairLayout; snap: StairSnap; problem: string | null }

export const STAIR_SNAP_M = 0.6
const STAIR_FACE_GAP_M = 0.005

type Dir = { x: number; z: number }

function dot(a: Dir, b: Dir): number {
  return a.x * b.x + a.z * b.z
}

function stairFrom(centre: Dir, dir: Dir, width: number, length: number): Stair {
  return {
    id: 'preview',
    x: centre.x - dir.x * (length / 2),
    z: centre.z - dir.z * (length / 2),
    dx: dir.x,
    dz: dir.z,
    width,
  }
}

// The whole stair follows the pointer. Near a wall face it sits flush: its long side against the wall,
// or, held about half a flight out, its short end. The preferred direction picks which way it climbs.
export function placeStair(
  doc: Document,
  floor: Floor,
  pointer: Dir,
  preferred: Dir,
  width = DEFAULT_STAIR_WIDTH_M,
): StairPlacement {
  const length = stairLayout({ id: '', x: 0, z: 0, dx: 1, dz: 0, width }, floor.index).length
  const cell = floorCells(floor).find((item) => pointInRing(item.net, pointer.x, pointer.z))
  let best: { stair: Stair; snap: StairSnap; score: number } | null = null
  const ring = cell?.net ?? []
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    const edge = Math.hypot(b.x - a.x, b.z - a.z)
    if (edge < 1e-6) continue
    const t = { x: (b.x - a.x) / edge, z: (b.z - a.z) / edge }
    let n = { x: -t.z, z: t.x }
    const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 }
    if (!pointInRing(ring, mid.x + n.x * 0.01, mid.z + n.z * 0.01)) n = { x: -n.x, z: -n.z }
    for (const snap of ['side', 'end'] as const) {
      const along = snap === 'side' ? length / 2 : width / 2
      const across = snap === 'side' ? width / 2 : length / 2
      if (edge < 2 * along - 1e-9) continue
      const s = Math.min(edge - along, Math.max(along, dot({ x: pointer.x - a.x, z: pointer.z - a.z }, t)))
      const centre = {
        x: a.x + t.x * s + n.x * (across + STAIR_FACE_GAP_M),
        z: a.z + t.z * s + n.z * (across + STAIR_FACE_GAP_M),
      }
      const score = Math.hypot(centre.x - pointer.x, centre.z - pointer.z)
      if (score > length || (best && score >= best.score)) continue
      const options = snap === 'side' ? [t, { x: -t.x, z: -t.z }] : [n, { x: -n.x, z: -n.z }]
      const dir = dot(options[1], preferred) > dot(options[0], preferred) + 1e-9 ? options[1] : options[0]
      const stair = stairFrom(centre, dir, width, length)
      const { footprint } = stairLayout(stair, floor.index)
      if (!footprint.every((point) => pointInRing(ring, point.x, point.z))) continue
      best = { stair, snap, score }
    }
  }
  // A free stair that would poke through a wall is pulled to the nearest flush spot instead.
  const free = stairFrom(pointer, preferred, width, length)
  const freeFits = ring.length > 0 && stairLayout(free, floor.index).footprint.every((point) => pointInRing(ring, point.x, point.z))
  const snapped = best && (best.score <= STAIR_SNAP_M || !freeFits) ? best : null
  const stair = snapped?.stair ?? free
  return {
    stair,
    layout: stairLayout(stair, floor.index),
    snap: snapped?.snap ?? null,
    problem: stairFitProblem(doc, floor, stair),
  }
}

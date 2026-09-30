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

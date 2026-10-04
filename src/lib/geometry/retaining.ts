import { BufferGeometry, Float32BufferAttribute } from 'three'
import { RETAINING_ENGINEER_M, retainingLength, retainingSpec } from '../model/retaining'
import type { Document, RetainingType, RetainingWall } from '../model/types'
import { siteField } from './fixtures'
import { bilinearHeight } from './terrain'

type Point = { x: number; z: number }
type HeightAt = (x: number, z: number) => number

// How far to either side of the wall the ground is read, to find what the wall holds back.
export const RETAINING_REACH_M = 1
const SAMPLE_M = 0.5

// The wall at one point along it: where it is, the ground on its low and high sides, and which way is downhill.
export type RetainingSample = { x: number; z: number; low: number; high: number; down: Point }

// The wall sampled along its length. The ground is read a metre to each side; the higher side is what is held
// back, and the difference is the height retained there. The ground itself is taken as it lies.
export function retainingSamples(wall: Pick<RetainingWall, 'points'>, heightAt: HeightAt): RetainingSample[] {
  const samples: RetainingSample[] = []
  for (let i = 0; i < wall.points.length - 1; i++) {
    const [ax, az] = wall.points[i]
    const [bx, bz] = wall.points[i + 1]
    const length = Math.hypot(bx - ax, bz - az)
    if (length < 1e-6) continue
    const t = { x: (bx - ax) / length, z: (bz - az) / length }
    const n = { x: -t.z, z: t.x }
    const steps = Math.max(1, Math.ceil(length / SAMPLE_M))
    for (let k = i === 0 ? 0 : 1; k <= steps; k++) {
      const x = ax + (t.x * length * k) / steps
      const z = az + (t.z * length * k) / steps
      const left = heightAt(x + n.x * RETAINING_REACH_M, z + n.z * RETAINING_REACH_M)
      const right = heightAt(x - n.x * RETAINING_REACH_M, z - n.z * RETAINING_REACH_M)
      const down = left <= right ? n : { x: -n.x, z: -n.z }
      samples.push({ x, z, low: Math.min(left, right), high: Math.max(left, right), down })
    }
  }
  return samples
}

export type RetainingMeasure = { length: number; highest: number; average: number; face: number }

// How long the wall is, the most and the average it holds back, and the area of its face.
export function measureRetaining(wall: Pick<RetainingWall, 'points'>, heightAt: HeightAt): RetainingMeasure {
  const samples = retainingSamples(wall, heightAt)
  const length = retainingLength(wall.points)
  if (samples.length === 0) return { length, highest: 0, average: 0, face: 0 }
  const heights = samples.map((sample) => sample.high - sample.low)
  const average = heights.reduce((sum, height) => sum + height, 0) / heights.length
  return { length, highest: Math.max(...heights), average, face: average * length }
}

// The ground as it lies, with the pads under buildings levelled.
export function groundOf(doc: Document): HeightAt {
  const field = siteField(doc)
  return (x, z) => bilinearHeight(field, x, z)
}

// The retaining wall within reach of a point: the last drawn first.
export function retainingAt(doc: Document, p: Point, reach: number): RetainingWall | null {
  for (const wall of [...(doc.retaining ?? [])].reverse()) {
    for (let i = 0; i < wall.points.length - 1; i++) {
      const [ax, az] = wall.points[i]
      const [bx, bz] = wall.points[i + 1]
      const dx = bx - ax
      const dz = bz - az
      const t = Math.max(0, Math.min(1, ((p.x - ax) * dx + (p.z - az) * dz) / (dx * dx + dz * dz || 1)))
      if (Math.hypot(ax + dx * t - p.x, az + dz * t - p.z) <= reach) return wall
    }
  }
  return null
}

export type RetainingPart = { geometry: BufferGeometry; colour: string }

// The walls for Review: each a strip as thick as its kind, from just under the low ground to the top of the high
// ground it holds, following both along its length.
export function buildRetainingParts(doc: Document, heightAt: HeightAt): RetainingPart[] {
  const byType = new Map<RetainingType, number[]>()
  for (const wall of doc.retaining ?? []) {
    const spec = retainingSpec(wall.type)
    const samples = retainingSamples(wall, heightAt)
    const positions = byType.get(wall.type) ?? []
    const half = spec.thickness / 2
    for (let i = 0; i < samples.length - 1; i++) {
      const [a, b] = [samples[i], samples[i + 1]]
      // The eight corners of this length of wall: front (downhill) and back, bottom and top, at each end.
      const corner = (s: RetainingSample, side: number, top: boolean): [number, number, number] => [s.x + s.down.x * half * side, top ? s.high + 0.05 : s.low - 0.15, s.z + s.down.z * half * side]
      const quad = (p0: [number, number, number], p1: [number, number, number], p2: [number, number, number], p3: [number, number, number]) => positions.push(...p0, ...p1, ...p2, ...p0, ...p2, ...p3)
      for (const side of [1, -1]) quad(corner(a, side, false), corner(b, side, false), corner(b, side, true), corner(a, side, true))
      quad(corner(a, 1, true), corner(b, 1, true), corner(b, -1, true), corner(a, -1, true))
      if (i === 0) quad(corner(a, 1, false), corner(a, 1, true), corner(a, -1, true), corner(a, -1, false))
      if (i === samples.length - 2) quad(corner(b, 1, false), corner(b, 1, true), corner(b, -1, true), corner(b, -1, false))
    }
    byType.set(wall.type, positions)
  }
  const parts: RetainingPart[] = []
  for (const [type, positions] of byType) {
    if (positions.length === 0) continue
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
    geometry.computeVertexNormals()
    parts.push({ geometry, colour: retainingSpec(type).colour })
  }
  return parts
}

export type RetainingIssue = { id: string; text: string }

// Walls that hold back more than a builder should take on without an engineer.
export function retainingIssues(doc: Document): RetainingIssue[] {
  const ground = (doc.retaining ?? []).length > 0 ? groundOf(doc) : null
  if (!ground) return []
  const issues: RetainingIssue[] = []
  for (const wall of doc.retaining ?? []) {
    const { highest } = measureRetaining(wall, ground)
    if (highest > RETAINING_ENGINEER_M + 1e-6) {
      issues.push({
        id: `retaining:${wall.id}`,
        text: `A retaining wall holds back up to ${highest.toFixed(1)} m of ground. Over ${RETAINING_ENGINEER_M} m it needs an engineer's design.`,
      })
    }
  }
  return issues
}

// What the retaining walls of a plot come to, for Quantities: the face of each kind, and the drain behind them.
export function retainingTotals(doc: Document): { face: Record<RetainingType, number>; length: number } {
  const totals = { face: { blocks: 0, masonry: 0, concrete: 0 }, length: 0 }
  if ((doc.retaining ?? []).length === 0) return totals
  const ground = groundOf(doc)
  for (const wall of doc.retaining ?? []) {
    const measure = measureRetaining(wall, ground)
    // Bedded 300 mm into the ground below what shows.
    totals.face[wall.type] += measure.face + measure.length * 0.3
    totals.length += measure.length
  }
  return totals
}

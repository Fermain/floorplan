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

// A retaining block, a Löffelstein: 450 mm long, 300 mm front to back and 200 mm high, each course set 50 mm back
// up the bank from the one below. Brick and concrete walls stand upright, and step along their tops in the same 200 mm.
export const RETAINING_BLOCK = { length: 0.45, depth: 0.3, height: 0.2, setback: 0.05 }
const STEP_M = RETAINING_BLOCK.height
// The wall dies into the bank over this much at each end, and the ground is drawn in to it from this far away.
const TAPER_M = 1
const PINCH_M = RETAINING_REACH_M

type Profile = { x: number; z: number; low: number; high: number; down: Point; ease: number }

// The wall at a point along one of its lengths: the ground it stands on and the ground it holds, once the ground has
// been drawn in to meet it. Towards either end the wall runs out into the ground as it lies.
function profileAt(wall: Pick<RetainingWall, 'points'>, segment: number, along: number, heightAt: HeightAt): Profile | null {
  const [ax, az] = wall.points[segment]
  const [bx, bz] = wall.points[segment + 1]
  const length = Math.hypot(bx - ax, bz - az)
  if (length < 1e-6) return null
  const t = { x: (bx - ax) / length, z: (bz - az) / length }
  const n = { x: -t.z, z: t.x }
  const x = ax + t.x * along
  const z = az + t.z * along
  const left = heightAt(x + n.x * RETAINING_REACH_M, z + n.z * RETAINING_REACH_M)
  const right = heightAt(x - n.x * RETAINING_REACH_M, z - n.z * RETAINING_REACH_M)
  const down = left <= right ? n : { x: -n.x, z: -n.z }
  let before = along
  for (let i = 0; i < segment; i++) before += Math.hypot(wall.points[i + 1][0] - wall.points[i][0], wall.points[i + 1][1] - wall.points[i][1])
  const ease = Math.max(0, Math.min(1, Math.min(before, retainingLength(wall.points) - before) / TAPER_M))
  const here = heightAt(x, z)
  return { x, z, low: here + (Math.min(left, right) - here) * ease, high: here + (Math.max(left, right) - here) * ease, down, ease }
}

// The courses a wall is built in at a point: the lowest is bedded under the low ground, the top one finishes at or
// just over the ground it holds. None where there is nothing to hold.
function coursesAt(profile: Profile): { from: number; to: number } | null {
  if (profile.high - profile.low < 0.05) return null
  return { from: Math.floor(profile.low / STEP_M + 1e-6) - 1, to: Math.ceil(profile.high / STEP_M - 0.1) }
}

// How far up the bank the top of the wall stands from its foot: retaining blocks lean back, the others do not.
function lean(type: RetainingType, profile: Profile): number {
  if (type !== 'blocks') return 0
  const courses = coursesAt(profile)
  return courses ? Math.max(0, courses.to - 1 - courses.from) * RETAINING_BLOCK.setback : 0
}

// The ground with each retaining wall's bank drawn in to it: level with the top of the wall behind it and with its
// foot in front, easing back to the ground as it lies a metre out and at either end. Nothing else is reshaped.
export function pinchedGround(doc: Document, heightAt: HeightAt): HeightAt {
  const walls = doc.retaining ?? []
  if (walls.length === 0) return heightAt
  return (x, z) => {
    const natural = heightAt(x, z)
    let best: { distance: number; wall: RetainingWall; segment: number; along: number } | null = null
    for (const wall of walls) {
      for (let i = 0; i < wall.points.length - 1; i++) {
        const [ax, az] = wall.points[i]
        const [bx, bz] = wall.points[i + 1]
        const length = Math.hypot(bx - ax, bz - az)
        if (length < 1e-6) continue
        const raw = ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / length
        // Past either end of the wall the ground is left alone; round a bend it is drawn in to the corner.
        if ((raw < 0 && i === 0) || (raw > length && i === wall.points.length - 2)) continue
        const along = Math.max(0, Math.min(length, raw))
        const distance = Math.hypot(ax + ((bx - ax) * along) / length - x, az + ((bz - az) * along) / length - z)
        if (distance < PINCH_M + 2 && (!best || distance < best.distance)) best = { distance, wall, segment: i, along }
      }
    }
    if (!best) return natural
    const profile = profileAt(best.wall, best.segment, best.along, heightAt)
    if (!profile) return natural
    const uphill = (x - profile.x) * -profile.down.x + (z - profile.z) * -profile.down.z
    // The step in the ground is under the top of the wall, which for a leaning wall is back from its foot.
    const from = (uphill >= 0 ? best.distance : -best.distance) - lean(best.wall.type, profile)
    const reach = Math.abs(from) / PINCH_M
    if (reach >= 1) return natural
    const target = from >= 0 ? profile.high : profile.low
    return natural + (target - natural) * (1 - reach * reach) * Math.min(1, profile.ease * 2)
  }
}

// How near a retaining wall a point is, for deciding where the ground needs drawing finely.
export function retainingDistance(doc: Document, x: number, z: number): number {
  let best = Infinity
  for (const wall of doc.retaining ?? []) {
    for (let i = 0; i < wall.points.length - 1; i++) {
      const [ax, az] = wall.points[i]
      const [bx, bz] = wall.points[i + 1]
      const dx = bx - ax
      const dz = bz - az
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)))
      best = Math.min(best, Math.hypot(ax + dx * t - x, az + dz * t - z))
    }
  }
  return best
}

// How far from a wall the ground can be changed by it: the band drawn in, and the lean of a tall wall.
export const RETAINING_GROUND_REACH_M = PINCH_M + 1.5

export type RetainingPart = { geometry: BufferGeometry; colour: string }

const SOIL_COLOUR = '#5f4d3c'

// The walls for Review, built course by course. Retaining blocks are laid as blocks, half a block along from the
// course below and stepped back up the bank, with soil in their tops; brick and concrete walls stand upright in
// lengths whose tops step level. Either way the top edge steps with the ground it holds rather than following it.
export function buildRetainingParts(doc: Document, heightAt: HeightAt): RetainingPart[] {
  const faces: Record<string, number[]> = {}
  const into = (key: string) => (faces[key] ??= [])
  type P3 = [number, number, number]
  const quad = (positions: number[], p0: P3, p1: P3, p2: P3, p3: P3) => positions.push(...p0, ...p1, ...p2, ...p0, ...p2, ...p3)
  const { length: blockLength, depth, height, setback } = RETAINING_BLOCK
  for (const wall of doc.retaining ?? []) {
    const spec = retainingSpec(wall.type)
    for (let i = 0; i < wall.points.length - 1; i++) {
      const [ax, az] = wall.points[i]
      const [bx, bz] = wall.points[i + 1]
      const length = Math.hypot(bx - ax, bz - az)
      if (length < 1e-6) continue
      const t = { x: (bx - ax) / length, z: (bz - az) / length }
      const count = Math.max(1, Math.round(length / blockLength))
      const piece = length / count
      const last = i === wall.points.length - 2
      if (wall.type !== 'blocks') {
        // One upright length of wall, level along its top.
        const half = spec.thickness / 2
        for (let j = 0; j < count; j++) {
          const ends = [profileAt(wall, i, j * piece, heightAt), profileAt(wall, i, (j + 1) * piece, heightAt)]
          if (!ends[0] || !ends[1]) continue
          const courses = ends.map((end) => coursesAt(end!))
          if (!courses[0] && !courses[1]) continue
          const top = Math.max(courses[0]?.to ?? -Infinity, courses[1]?.to ?? -Infinity) * STEP_M
          const bottom = Math.min(ends[0].low, ends[1].low) - 0.3
          const at = (end: Profile, side: number, y: number): P3 => [end.x + end.down.x * half * side, y, end.z + end.down.z * half * side]
          const [a, b] = [ends[0], ends[1]]
          const positions = into(spec.colour)
          for (const side of [1, -1]) quad(positions, at(a, side, bottom), at(b, side, bottom), at(b, side, top), at(a, side, top))
          quad(positions, at(a, 1, top), at(b, 1, top), at(b, -1, top), at(a, -1, top))
          quad(positions, at(a, 1, bottom), at(a, 1, top), at(a, -1, top), at(a, -1, bottom))
          quad(positions, at(b, 1, bottom), at(b, 1, top), at(b, -1, top), at(b, -1, bottom))
        }
        continue
      }
      // Blocks: even courses lie block for block along the wall, odd courses half a block on.
      for (const odd of [0, 1]) {
        for (let j = 0; j < count + odd; j++) {
          if (odd && (j === 0 || (j === count && last))) continue
          const profile = profileAt(wall, i, odd ? j * piece : (j + 0.5) * piece, heightAt)
          const courses = profile && coursesAt(profile)
          if (!profile || !courses) continue
          for (let k = courses.from; k < courses.to; k++) {
            if (((k % 2) + 2) % 2 !== odd) continue
            const back = (k - courses.from) * setback
            const y0 = k * height
            const y1 = y0 + height
            // The block from above: square at the back, bowed at the front like a scoop.
            const w = piece / 2 - 0.008
            const outline: [number, number][] = [[-w, -depth / 2], [w, -depth / 2], [w, depth / 2 - 0.07], [w / 2, depth / 2], [-w / 2, depth / 2], [-w, depth / 2 - 0.07]]
            const corner = ([u, v]: [number, number], y: number): P3 => [profile.x + t.x * u + profile.down.x * (v - back), y, profile.z + t.z * u + profile.down.z * (v - back)]
            const sides = into(spec.colour)
            for (let e = 0; e < outline.length; e++) {
              const [p, q] = [outline[e], outline[(e + 1) % outline.length]]
              quad(sides, corner(p, y0), corner(q, y0), corner(q, y1), corner(p, y1))
            }
            const rim = into(spec.colour)
            const soil = into(SOIL_COLOUR)
            const inner = outline.map(([u, v]): [number, number] => [u * 0.82, v * 0.72])
            for (let e = 0; e < outline.length; e++) {
              const f = (e + 1) % outline.length
              quad(rim, corner(outline[e], y1), corner(outline[f], y1), corner(inner[f], y1), corner(inner[e], y1))
            }
            for (let e = 1; e < inner.length - 1; e++) soil.push(...corner(inner[0], y1 - 0.02), ...corner(inner[e], y1 - 0.02), ...corner(inner[e + 1], y1 - 0.02))
          }
        }
      }
    }
  }
  const parts: RetainingPart[] = []
  for (const [colour, positions] of Object.entries(faces)) {
    if (positions.length === 0) continue
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
    geometry.computeVertexNormals()
    parts.push({ geometry, colour })
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

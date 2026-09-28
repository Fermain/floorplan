import type { Heightfield } from '../model/types'

const NICE_INTERVALS_M = [0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500]
const TARGET_CONTOURS = 8

export const CONTOUR_LIFT_M = 0.03

export type ContourLines = {
  interval: number | null
  minor: Float32Array
  major: Float32Array
}

type Vert = { x: number; y: number; z: number }

export function contourLevels(min: number, max: number, interval: number): number[] {
  const levels: number[] = []
  const first = Math.ceil(min / interval - 1e-9)
  const last = Math.floor(max / interval + 1e-9)
  for (let i = first; i <= last; i++) {
    const level = i * interval
    if (level > min + interval * 1e-6 && level < max - interval * 1e-6) levels.push(level)
  }
  return levels
}

function nearestNice(raw: number): number {
  let best = NICE_INTERVALS_M[0]
  let bestScore = Infinity
  for (const step of NICE_INTERVALS_M) {
    const score = Math.abs(Math.log(step / raw))
    if (score < bestScore) {
      bestScore = score
      best = step
    }
  }
  return best
}

export function contourInterval(min: number, max: number): number | null {
  const span = max - min
  if (!(span > 0)) return null
  let step = nearestNice(span / TARGET_CONTOURS)
  while (contourLevels(min, max, step).length < 3) {
    const finer = NICE_INTERVALS_M[NICE_INTERVALS_M.indexOf(step) - 1]
    if (finer === undefined) break
    step = finer
  }
  if (contourLevels(min, max, step).length === 0) return null
  return step
}

export function majorContourSpacing(interval: number): number {
  if (interval >= 1) return interval * 5
  if (interval >= 0.5) return interval * 2
  return 1
}

export function isMajorContour(level: number, interval: number): boolean {
  const spacing = majorContourSpacing(interval)
  const q = level / spacing
  return Math.abs(q - Math.round(q)) < 1e-6
}

function heightAt(field: Heightfield, c: number, r: number): number {
  return field.heights[r * field.cols + c]
}

function vert(field: Heightfield, c: number, r: number): Vert {
  return {
    x: field.originX + c * field.cellSize,
    y: heightAt(field, c, r),
    z: field.originZ + r * field.cellSize,
  }
}

function bounds(field: Heightfield): { min: number; max: number } {
  let min = Infinity
  let max = -Infinity
  for (const h of field.heights) {
    if (h < min) min = h
    if (h > max) max = h
  }
  return { min, max }
}

function edgePoint(a: Vert, b: Vert, level: number): { x: number; z: number } {
  const t = (level - a.y) / (b.y - a.y)
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t }
}

function faceNormal(a: Vert, b: Vert, c: Vert): { x: number; y: number; z: number } {
  const ux = b.x - a.x
  const uy = b.y - a.y
  const uz = b.z - a.z
  const vx = c.x - a.x
  const vy = c.y - a.y
  const vz = c.z - a.z
  let x = uy * vz - uz * vy
  let y = uz * vx - ux * vz
  let z = ux * vy - uy * vx
  const len = Math.hypot(x, y, z) || 1
  if (y < 0) {
    x = -x
    y = -y
    z = -z
  }
  return { x: x / len, y: y / len, z: z / len }
}

function addTriangle(
  minor: number[],
  major: number[],
  tri: [Vert, Vert, Vert],
  level: number,
  interval: number,
  lift: number,
) {
  const points: { x: number; z: number }[] = []
  for (let i = 0; i < 3; i++) {
    const a = tri[i]
    const b = tri[(i + 1) % 3]
    if ((a.y < level) === (b.y < level)) continue
    points.push(edgePoint(a, b, level))
  }
  if (points.length !== 2) return
  const n = faceNormal(tri[0], tri[1], tri[2])
  const out = isMajorContour(level, interval) ? major : minor
  out.push(
    points[0].x + n.x * lift,
    level + n.y * lift,
    points[0].z + n.z * lift,
    points[1].x + n.x * lift,
    level + n.y * lift,
    points[1].z + n.z * lift,
  )
}

export function buildContourLines(field: Heightfield, lift = 0): ContourLines {
  const empty: ContourLines = { interval: null, minor: new Float32Array(), major: new Float32Array() }
  if (field.cols < 2 || field.rows < 2 || field.heights.length !== field.cols * field.rows) return empty
  const { min, max } = bounds(field)
  const interval = contourInterval(min, max)
  if (interval === null) return empty
  const levels = contourLevels(min, max, interval)
  const minor: number[] = []
  const major: number[] = []
  for (let r = 0; r < field.rows - 1; r++) {
    for (let c = 0; c < field.cols - 1; c++) {
      const a = vert(field, c, r)
      const b = vert(field, c + 1, r)
      const d = vert(field, c, r + 1)
      const e = vert(field, c + 1, r + 1)
      const triangles: [Vert, Vert, Vert][] = [
        [a, d, b],
        [b, d, e],
      ]
      for (const level of levels) {
        for (const tri of triangles) addTriangle(minor, major, tri, level, interval, lift)
      }
    }
  }
  return { interval, minor: new Float32Array(minor), major: new Float32Array(major) }
}

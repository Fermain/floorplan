import type { Corner } from './types'

export const EPS = 0.001

export function dist(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.z - b.z)
}

export function cornerById(corners: Corner[], id: string): Corner | undefined {
  return corners.find((c) => c.id === id)
}

export function wallLength(
  corners: Corner[],
  startCornerId: string,
  endCornerId: string,
): number {
  const a = cornerById(corners, startCornerId)
  const b = cornerById(corners, endCornerId)
  if (!a || !b) return 0
  return dist(a, b)
}

export function signedPolygonArea(points: { x: number; z: number }[]): number {
  let sum = 0
  const n = points.length
  for (let i = 0; i < n; i++) {
    const p = points[i]
    const q = points[(i + 1) % n]
    sum += p.x * q.z - q.x * p.z
  }
  return sum / 2
}

export function pointsNearlyEqual(
  a: { x: number; z: number },
  b: { x: number; z: number },
  eps = EPS,
): boolean {
  return dist(a, b) <= eps
}

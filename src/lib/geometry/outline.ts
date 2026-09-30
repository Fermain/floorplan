import { signedPolygonArea } from '../model/geom'
import { outerReach, systemOf, wallSystem, DEFAULT_WALL_SYSTEM_ID } from '../model/systems'
import type { Floor, Wall } from '../model/types'
import type { Ring } from './pad'

type PlanPoint = { x: number; z: number }

const MATCH_M = 1e-3

export const DEFAULT_REACH = outerReach(wallSystem(DEFAULT_WALL_SYSTEM_ID))

export function wallReach(wall: Wall | undefined): number {
  if (!wall || wall.skin === 'logical') return 0
  return outerReach(systemOf(wall))
}

export function widestReach(walls: Wall[]): number {
  const solid = walls.filter((wall) => wall.skin !== 'logical')
  if (solid.length === 0) return DEFAULT_REACH
  return Math.max(...solid.map(wallReach))
}

export function wallBetween(floor: Floor, a: string, b: string): Wall | undefined {
  return floor.walls.find(
    (wall) =>
      (wall.startCornerId === a && wall.endCornerId === b) ||
      (wall.startCornerId === b && wall.endCornerId === a),
  )
}

function cornerIdAt(floor: Floor, point: PlanPoint): string | undefined {
  return floor.corners.find((corner) => Math.hypot(corner.x - point.x, corner.z - point.z) <= MATCH_M)?.id
}

export function ringEdgeWalls(floor: Floor, ring: Ring): (Wall | undefined)[] {
  const ids = ring.map((point) => cornerIdAt(floor, point))
  return ring.map((_, i) => {
    const a = ids[i]
    const b = ids[(i + 1) % ring.length]
    return a && b ? wallBetween(floor, a, b) : undefined
  })
}

export function offsetEdges(ring: Ring, distances: number[]): Ring {
  if (ring.length < 3 || distances.length !== ring.length) return ring
  const ccw = signedPolygonArea(ring) < 0
  const points = ccw ? [...ring].reverse() : ring
  const edge = ccw ? reversedDistances(distances) : distances
  const count = points.length
  const offset: Ring = []
  const limit = Math.max(...edge.map((distance) => Math.abs(distance))) * 4
  for (let i = 0; i < count; i++) {
    const prev = points[(i + count - 1) % count]
    const current = points[i]
    const next = points[(i + 1) % count]
    const inward = direction(prev, current)
    const outward = direction(current, next)
    if (!inward || !outward) continue
    const dIn = edge[(i + count - 1) % count]
    const dOut = edge[i]
    const left = { x: inward.z, z: -inward.x }
    const right = { x: outward.z, z: -outward.x }
    const a = { x: current.x + left.x * dIn, z: current.z + left.z * dIn }
    const b = { x: current.x + right.x * dOut, z: current.z + right.z * dOut }
    const hit = lineIntersection(a, inward, b, outward)
    const span = hit ? Math.hypot(hit.x - current.x, hit.z - current.z) : Infinity
    if (!hit || span > limit) offset.push(a, b)
    else offset.push(hit)
  }
  return clean(offset)
}

function reversedDistances(distances: number[]): number[] {
  const count = distances.length
  const reversed: number[] = []
  for (let i = 0; i < count; i++) reversed.push(distances[(count - 2 - i + count) % count])
  return reversed
}

function direction(a: PlanPoint, b: PlanPoint): PlanPoint | null {
  const dx = b.x - a.x
  const dz = b.z - a.z
  const length = Math.hypot(dx, dz)
  if (length < 1e-9) return null
  return { x: dx / length, z: dz / length }
}

function lineIntersection(
  origin: PlanPoint,
  directionA: PlanPoint,
  other: PlanPoint,
  directionB: PlanPoint,
): PlanPoint | null {
  const det = directionA.x * directionB.z - directionA.z * directionB.x
  if (Math.abs(det) < 1e-12) return null
  const t = ((other.x - origin.x) * directionB.z - (other.z - origin.z) * directionB.x) / det
  return { x: origin.x + directionA.x * t, z: origin.z + directionA.z * t }
}

function clean(ring: Ring): Ring {
  const points: Ring = []
  for (const point of ring) {
    const previous = points[points.length - 1]
    if (previous && Math.hypot(point.x - previous.x, point.z - previous.z) < 1e-6) continue
    points.push(point)
  }
  const first = points[0]
  const last = points[points.length - 1]
  if (first && last && points.length > 1 && Math.hypot(first.x - last.x, first.z - last.z) < 1e-6) {
    points.pop()
  }
  return points
}

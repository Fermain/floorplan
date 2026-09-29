import { List, SkeletonBuilder, Vector2d } from 'straight-skeleton'
import {
  BufferGeometry,
  Float32BufferAttribute,
  ShapeUtils,
  Vector2,
} from 'three'
import { signedPolygonArea } from '../model/geom'
import { deriveRooms } from '../model/rooms'
import type { Floor, Roof, Wall } from '../model/types'
import {
  BLOCK_HEIGHT,
  BLOCK_THICKNESS,
  CAVITY,
  DEFAULT_STOREY_HEIGHT,
} from '../plot/fixture'
import { unionRings, type DeckPolygon } from './deck'
import type { Ring } from './pad'

const LEAF_OFFSET = CAVITY / 2 + BLOCK_THICKNESS / 2
const OUTER_DOUBLE = LEAF_OFFSET + BLOCK_THICKNESS / 2
const OUTER_SINGLE = BLOCK_THICKNESS / 2

export const WALL_HEAD_M = Math.floor(DEFAULT_STOREY_HEIGHT / BLOCK_HEIGHT) * BLOCK_HEIGHT

export type PlanPoint = { x: number; z: number }

export type RoofVertex = { x: number; y: number; z: number }

export function hipRoofFaces(
  ring: PlanPoint[],
  pitchDeg: number,
  baseY: number,
  holes: PlanPoint[][] = [],
): RoofVertex[][] {
  if (ring.length < 3 || pitchDeg <= 0) return []
  const rise = Math.tan((pitchDeg * Math.PI) / 180)
  try {
    const skeleton = SkeletonBuilder.Build(toList(ring), holeLists(holes) ?? undefined)
    const distances = new Map<string, number>()
    for (const [point, distance] of skeleton.Distances) {
      distances.set(vertexKey(point.X, point.Y), distance)
    }
    const faces: RoofVertex[][] = []
    for (const edge of skeleton.Edges) {
      const face: RoofVertex[] = []
      for (const point of edge.Polygon) {
        const distance = distances.get(vertexKey(point.X, point.Y)) ?? 0
        face.push({
          x: point.X,
          y: baseY + distance * rise,
          z: point.Y,
        })
      }
      if (face.length >= 3) faces.push(face)
    }
    return faces
  } catch {
    return []
  }
}

export function masonryReach(walls: Wall[]): number {
  const solid = walls.filter((wall) => wall.skin !== 'logical')
  if (solid.length > 0 && solid.every((wall) => wall.skin === 'single')) return OUTER_SINGLE
  return OUTER_DOUBLE
}

export function roofFacesForFloor(floor: Floor, roof: Roof, reach = OUTER_DOUBLE): RoofVertex[][] {
  const rise = Math.tan((roof.pitchDeg * Math.PI) / 180)
  const baseY = -roof.eaves * rise
  const faces: RoofVertex[][] = []
  for (const footprint of eavesFootprints(floor, roof.eaves, reach)) {
    faces.push(...hipRoofFaces(footprint.outer, roof.pitchDeg, baseY, footprint.holes))
  }
  return faces
}

export type RoofPlan = {
  footprints: DeckPolygon[]
  hips: { a: PlanPoint; b: PlanPoint }[]
}

export function roofPlan(floor: Floor, roof: Roof, reach = OUTER_DOUBLE): RoofPlan {
  const footprints = eavesFootprints(floor, roof.eaves, reach)
  const rise = Math.tan((roof.pitchDeg * Math.PI) / 180)
  const baseY = -roof.eaves * rise
  const seen = new Set<string>()
  const hips: RoofPlan['hips'] = []
  for (const footprint of footprints) {
    for (const face of hipRoofFaces(footprint.outer, roof.pitchDeg, baseY, footprint.holes)) {
      for (let i = 0; i < face.length; i++) {
        const a = face[i]
        const b = face[(i + 1) % face.length]
        if (a.y <= baseY + 1e-4 && b.y <= baseY + 1e-4) continue
        const key = edgeKey(a, b)
        if (seen.has(key)) continue
        seen.add(key)
        hips.push({ a: { x: a.x, z: a.z }, b: { x: b.x, z: b.z } })
      }
    }
  }
  return { footprints, hips }
}

export function buildRoofGeometry(floor: Floor, roof: Roof, reach = OUTER_DOUBLE): BufferGeometry | null {
  const positions: number[] = []
  for (const face of roofFacesForFloor(floor, roof, reach)) {
    positions.push(...triangulateFace(face))
  }
  if (positions.length < 9) return null
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.computeVertexNormals()
  return geometry
}

function eavesFootprints(floor: Floor, eaves: number, reach: number): DeckPolygon[] {
  const pieces: Ring[] = []
  if (floor.walls.length === 0) {
    for (const ring of floor.outline ?? []) {
      if (ring.length < 3) continue
      pieces.push(offsetEdges(ring, ring.map(() => reach)))
    }
  }
  for (const room of deriveRooms(floor)) {
    const ring: Ring = []
    const distances: number[] = []
    for (let i = 0; i < room.cornerIds.length; i++) {
      const id = room.cornerIds[i]
      const next = room.cornerIds[(i + 1) % room.cornerIds.length]
      const corner = floor.corners.find((item) => item.id === id)
      if (!corner) {
        ring.length = 0
        break
      }
      ring.push({ x: corner.x, z: corner.z })
      distances.push(outerReach(wallBetween(floor, id, next)))
    }
    if (ring.length >= 3) pieces.push(offsetEdges(ring, distances))
  }
  return unionRings(pieces.filter((ring) => ring.length >= 3)).map((footprint) => ({
    outer: offsetEdges(footprint.outer, footprint.outer.map(() => eaves)),
    holes: footprint.holes
      .map((hole) => offsetEdges(hole, hole.map(() => -eaves)))
      .filter((hole) => hole.length >= 3),
  }))
}

function wallBetween(floor: Floor, a: string, b: string): Wall | undefined {
  return floor.walls.find(
    (wall) =>
      (wall.startCornerId === a && wall.endCornerId === b) ||
      (wall.startCornerId === b && wall.endCornerId === a),
  )
}

function outerReach(wall: Wall | undefined): number {
  if (!wall || wall.skin === 'logical') return 0
  if (wall.skin === 'single') return OUTER_SINGLE
  return OUTER_DOUBLE
}

function offsetEdges(ring: Ring, distances: number[]): Ring {
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

function triangulateFace(face: RoofVertex[]): number[] {
  const contour = face.map((vertex) => new Vector2(vertex.x, vertex.z))
  let triangles = ShapeUtils.triangulateShape(contour, [])
  let ordered = face
  if (triangles.length === 0) {
    ordered = [...face].reverse()
    triangles = ShapeUtils.triangulateShape(
      ordered.map((vertex) => new Vector2(vertex.x, vertex.z)),
      [],
    )
  }
  const positions: number[] = []
  for (const triangle of triangles) {
    for (const index of triangle) {
      const vertex = ordered[index]
      positions.push(vertex.x, vertex.y, vertex.z)
    }
  }
  return positions
}

function toList(ring: PlanPoint[]): List<Vector2d> {
  const polygon = new List<Vector2d>()
  for (const point of ring) polygon.Add(new Vector2d(point.x, point.z))
  return polygon
}

function holeLists(holes: PlanPoint[][]): List<List<Vector2d>> | null {
  if (holes.length === 0) return null
  const lists = new List<List<Vector2d>>()
  for (const hole of holes) {
    if (hole.length < 3) continue
    lists.Add(toList(hole))
  }
  return lists.Count > 0 ? lists : null
}

function vertexKey(x: number, z: number): string {
  return `${x.toFixed(5)},${z.toFixed(5)}`
}

function edgeKey(a: RoofVertex, b: RoofVertex): string {
  const left = vertexKey(a.x, a.z)
  const right = vertexKey(b.x, b.z)
  return left < right ? `${left}|${right}` : `${right}|${left}`
}

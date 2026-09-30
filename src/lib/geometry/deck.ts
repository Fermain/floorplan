import { union } from '@turf/union'
import { signedPolygonArea } from '../model/geom'
import { deriveRooms } from '../model/rooms'
import type { DerivedRoom, Floor, Wall } from '../model/types'
import { FLOOR_TO_FLOOR, WALL_HEAD } from '../plot/fixture'
import { leafOffset, systemOf } from '../model/systems'
import { leafSigns, wallMeshURange } from './walls'
import { offsetEdges, ringEdgeWalls, wallReach } from './outline'
import { pointInRing, WALL_OUTSTAND_M, type Ring } from './pad'

const CAVITY_FACE_M = 0.025
const MAX_DECK_THICKNESS_M = 0.255
const SURFACE_BED_FACE_CLEARANCE_M = 0.02

export type DeckPolygon = { outer: Ring; holes: Ring[] }

export function surfaceBedPolygons(rings: Ring[], floor?: Floor): DeckPolygon[] {
  const expanded = rings
    .map((ring) => {
      if (!floor) return offsetOutward(ring, WALL_OUTSTAND_M - SURFACE_BED_FACE_CLEARANCE_M)
      const distances = ringEdgeWalls(floor, ring).map((wall) =>
        wall && wall.skin !== 'logical'
          ? wallReach(wall) - SURFACE_BED_FACE_CLEARANCE_M
          : SURFACE_BED_FACE_CLEARANCE_M,
      )
      return offsetEdges(ring, distances)
    })
    .filter((ring) => ring.length >= 3)
  return unionRings(expanded)
}

export function deckThickness(): number {
  return Math.min(FLOOR_TO_FLOOR - WALL_HEAD, MAX_DECK_THICKNESS_M)
}

export function deckPolygons(floor: Floor, voids: Ring[] = []): DeckPolygon[] {
  const pieces = floor.walls.length > 0 ? wallPieces(floor) : []
  for (const ring of floor.outline ?? []) {
    if (ring.length >= 3) pieces.push(offsetOutward(ring, -CAVITY_FACE_M))
  }
  const polygons = unionRings(pieces.filter((ring) => ring.length >= 3))
  if (voids.length === 0) return polygons
  return polygons.map((polygon) => ({
    ...polygon,
    holes: [
      ...polygon.holes,
      ...voids.filter((ring) => ring.every((point) => pointInRing(polygon.outer, point.x, point.z))),
    ],
  }))
}

function wallPieces(floor: Floor): Ring[] {
  const rooms = deriveRooms(floor)
  const pieces: Ring[] = []
  for (const room of rooms) {
    const ring: Ring = []
    for (const id of room.cornerIds) {
      const corner = floor.corners.find((item) => item.id === id)
      if (!corner) {
        ring.length = 0
        break
      }
      ring.push({ x: corner.x, z: corner.z })
    }
    if (ring.length >= 3) pieces.push(offsetOutward(ring, -CAVITY_FACE_M))
  }
  for (const wall of floor.walls) {
    const strip = wallStrip(floor, wall, rooms)
    if (strip) pieces.push(strip)
  }
  return pieces
}

function wallStrip(floor: Floor, wall: Wall, rooms: DerivedRoom[]): Ring | null {
  if (wall.skin === 'logical') return null
  const start = floor.corners.find((corner) => corner.id === wall.startCornerId)
  const end = floor.corners.find((corner) => corner.id === wall.endCornerId)
  if (!start || !end) return null
  const dx = end.x - start.x
  const dz = end.z - start.z
  const length = Math.hypot(dx, dz)
  if (length < 1e-9) return null
  const dir = { x: dx / length, z: dz / length }
  const normal = { x: -dir.z, z: dir.x }
  const roomSide = roomSideAlongNormal(floor, wall, rooms, normal)
  let u0 = 0
  let u1 = length
  for (const sign of leafSigns(wall.skin)) {
    const range = wallMeshURange(floor, wall, sign)
    u0 = Math.min(u0, range.uMin)
    u1 = Math.max(u1, range.uMax)
  }
  const at = (u: number, side: number) => ({
    x: start.x + dir.x * u + normal.x * side,
    z: start.z + dir.z * u + normal.z * side,
  })
  const system = systemOf(wall)
  if (roomSide === null) {
    const half = system.leafThickness / 2
    return [at(u0, -half), at(u1, -half), at(u1, half), at(u0, half)]
  }
  if (wall.skin === 'single') {
    const inner = roomSide * (system.leafThickness / 2)
    return [at(u0, 0), at(u1, 0), at(u1, inner), at(u0, inner)]
  }
  const cavityFace = leafOffset(system) - system.leafThickness / 2
  const cavity = roomSide * cavityFace
  const roomFace = roomSide * (cavityFace + system.leafThickness)
  return [at(u0, cavity), at(u1, cavity), at(u1, roomFace), at(u0, roomFace)]
}

function roomSideAlongNormal(
  floor: Floor,
  wall: Wall,
  rooms: DerivedRoom[],
  normal: { x: number; z: number },
): number | null {
  if (rooms.length === 0) return null
  const start = floor.corners.find((corner) => corner.id === wall.startCornerId)
  const end = floor.corners.find((corner) => corner.id === wall.endCornerId)
  if (!start || !end) return null
  const midX = (start.x + end.x) / 2
  const midZ = (start.z + end.z) / 2
  const probe = 0.02
  const rings = rooms.map((room) => {
    const ring: Ring = []
    for (const id of room.cornerIds) {
      const corner = floor.corners.find((item) => item.id === id)
      if (!corner) return null
      ring.push({ x: corner.x, z: corner.z })
    }
    return ring.length >= 3 ? ring : null
  })
  const hit = (side: number) =>
    rings.some((ring) => ring && pointInRing(ring, midX + normal.x * side * probe, midZ + normal.z * side * probe))
  const pos = hit(1)
  const neg = hit(-1)
  if (pos && !neg) return 1
  if (neg && !pos) return -1
  return null
}

function offsetOutward(ring: Ring, distance: number): Ring {
  const points = cleanRing(ring)
  if (points.length < 3) return points
  const ccw = signedPolygonArea(points) < 0 ? [...points].reverse() : points
  const count = ccw.length
  const offset: Ring = []
  const limit = Math.abs(distance) * 4
  for (let i = 0; i < count; i++) {
    const prev = ccw[(i + count - 1) % count]
    const current = ccw[i]
    const next = ccw[(i + 1) % count]
    const inward = direction(prev, current)
    const outward = direction(current, next)
    if (!inward || !outward) continue
    const left = { x: inward.z, z: -inward.x }
    const right = { x: outward.z, z: -outward.x }
    const a = { x: current.x + left.x * distance, z: current.z + left.z * distance }
    const b = { x: current.x + right.x * distance, z: current.z + right.z * distance }
    const hit = lineIntersection(a, inward, b, outward)
    const span = hit ? Math.hypot(hit.x - current.x, hit.z - current.z) : Infinity
    if (!hit || span > limit) {
      offset.push(a, b)
    } else {
      offset.push(hit)
    }
  }
  return cleanRing(offset)
}

function direction(a: { x: number; z: number }, b: { x: number; z: number }): { x: number; z: number } | null {
  const dx = b.x - a.x
  const dz = b.z - a.z
  const length = Math.hypot(dx, dz)
  if (length < 1e-9) return null
  return { x: dx / length, z: dz / length }
}

function lineIntersection(
  origin: { x: number; z: number },
  directionA: { x: number; z: number },
  other: { x: number; z: number },
  directionB: { x: number; z: number },
): { x: number; z: number } | null {
  const det = directionA.x * directionB.z - directionA.z * directionB.x
  if (Math.abs(det) < 1e-12) return null
  const t = ((other.x - origin.x) * directionB.z - (other.z - origin.z) * directionB.x) / det
  return { x: origin.x + directionA.x * t, z: origin.z + directionA.z * t }
}

function cleanRing(ring: Ring): Ring {
  const points: Ring = []
  for (const point of ring) {
    const previous = points[points.length - 1]
    if (previous && Math.hypot(point.x - previous.x, point.z - previous.z) < 1e-6) continue
    points.push({ x: point.x, z: point.z })
  }
  const first = points[0]
  const last = points[points.length - 1]
  if (first && last && points.length > 1 && Math.hypot(first.x - last.x, first.z - last.z) < 1e-6) points.pop()
  return points
}

export function unionRings(rings: Ring[]): DeckPolygon[] {
  const features = rings.filter((ring) => ring.length >= 3).map(toPolygon)
  if (features.length === 0) return []
  if (features.length === 1) return featurePolygons(features[0])
  let combined
  try {
    combined = union({ type: 'FeatureCollection', features } as Parameters<typeof union>[0])
  } catch {
    return features.flatMap(featurePolygons)
  }
  if (!combined) return features.flatMap(featurePolygons)
  return featurePolygons(combined)
}

function toPolygon(ring: Ring) {
  return {
    type: 'Feature' as const,
    properties: {},
    geometry: { type: 'Polygon' as const, coordinates: [close(ring)] },
  }
}

function close(ring: Ring): number[][] {
  const coordinates = ring.map((point) => [point.x, point.z])
  const first = coordinates[0]
  const last = coordinates[coordinates.length - 1]
  if (first && last && (first[0] !== last[0] || first[1] !== last[1])) coordinates.push([first[0], first[1]])
  return coordinates
}

function featurePolygons(feature: { geometry: { type: string; coordinates: number[][][] | number[][][][] } }): DeckPolygon[] {
  const geometry = feature.geometry
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates as number[][][]] : (geometry.coordinates as number[][][][])
  return polygons.map((polygon) => ({
    outer: fromPositions(polygon[0] ?? []),
    holes: polygon.slice(1).map((ring) => fromPositions(ring)).filter((ring) => ring.length >= 3),
  }))
}

function fromPositions(coordinates: number[][]): Ring {
  return cleanRing(coordinates.map(([x, z]) => ({ x, z })))
}

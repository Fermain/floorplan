import { List, SkeletonBuilder, Vector2d } from 'straight-skeleton'
import {
  BufferGeometry,
  Float32BufferAttribute,
  ShapeUtils,
  Vector2,
} from 'three'
import { deriveRooms } from '../model/rooms'
import type { Floor, Roof, Wall } from '../model/types'
import { WALL_HEAD } from '../plot/fixture'
import { unionRings, type DeckPolygon } from './deck'
import { DEFAULT_REACH, offsetEdges, wallBetween, wallReach, widestReach } from './outline'
import type { Ring } from './pad'

export const WALL_HEAD_M = WALL_HEAD

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
  return widestReach(walls)
}

export function roofFacesForFloor(floor: Floor, roof: Roof, reach = DEFAULT_REACH): RoofVertex[][] {
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

export function roofPlan(floor: Floor, roof: Roof, reach = DEFAULT_REACH): RoofPlan {
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

export function buildRoofGeometry(floor: Floor, roof: Roof, reach = DEFAULT_REACH): BufferGeometry | null {
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
      distances.push(wallReach(wallBetween(floor, id, next)))
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

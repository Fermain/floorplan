import { List, SkeletonBuilder, Vector2d } from 'straight-skeleton'
import {
  BufferGeometry,
  Float32BufferAttribute,
  ShapeUtils,
  Vector2,
} from 'three'
import { deriveRooms } from '../model/rooms'
import { signedPolygonArea } from '../model/geom'
import { pointInRing } from './pad'
import type { Floor, Roof, Wall } from '../model/types'
import { WALL_HEAD } from '../plot/fixture'
import { unionRings, type DeckPolygon } from './deck'
import { clean, DEFAULT_REACH, offsetEdges, wallBetween, wallReach, widestReach } from './outline'
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

type HeightAt = (point: PlanPoint) => number

type RoofSurface = { faces: RoofVertex[][]; heightAt: HeightAt | null; ridge: { a: PlanPoint; b: PlanPoint } | null }

function longestEdge(ring: Ring): PlanPoint {
  let best = { x: 1, z: 0 }
  let bestLength = 0
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    const length = Math.hypot(b.x - a.x, b.z - a.z)
    if (length > bestLength) {
      bestLength = length
      best = { x: (b.x - a.x) / length, z: (b.z - a.z) / length }
    }
  }
  return best
}

function quarterTurn(v: PlanPoint, turns: number): PlanPoint {
  let out = v
  for (let i = 0; i < ((turns % 4) + 4) % 4; i++) out = { x: -out.z, z: out.x }
  return out
}

function extent(ring: Ring, axis: PlanPoint): { min: number; max: number } {
  let min = Infinity
  let max = -Infinity
  for (const p of ring) {
    const t = p.x * axis.x + p.z * axis.z
    min = Math.min(min, t)
    max = Math.max(max, t)
  }
  return { min, max }
}

export function clipHalfPlane(ring: Ring, axis: PlanPoint, offset: number, keepAbove: boolean): Ring {
  const side = (p: PlanPoint) => (p.x * axis.x + p.z * axis.z - offset) * (keepAbove ? 1 : -1)
  const out: Ring = []
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    const sa = side(a)
    const sb = side(b)
    if (sa >= 0) out.push(a)
    if ((sa >= 0) !== (sb >= 0)) {
      const t = sa / (sa - sb)
      out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t })
    }
  }
  return clean(out)
}

function lift(ring: Ring, heightAt: HeightAt): RoofVertex[] {
  return ring.map((p) => ({ x: p.x, y: heightAt(p), z: p.z }))
}

function roofSurface(floor: Floor, roof: Roof, reach: number): RoofSurface {
  const rise = Math.tan((roof.pitchDeg * Math.PI) / 180)
  const baseY = -roof.eaves * rise
  const footprints = eavesFootprints(floor, roof.eaves, reach)
  const form = roof.form ?? 'hip'
  if (form === 'hip') {
    const faces: RoofVertex[][] = []
    for (const footprint of footprints) {
      faces.push(...hipRoofFaces(footprint.outer, roof.pitchDeg, baseY, footprint.holes))
    }
    return { faces, heightAt: null, ridge: null }
  }
  const outer = footprints.flatMap((footprint) => footprint.outer)
  if (outer.length < 3) return { faces: [], heightAt: null, ridge: null }
  const along = longestEdge(footprints.reduce((a, b) => (Math.abs(signedPolygonArea(b.outer)) > Math.abs(signedPolygonArea(a.outer)) ? b : a)).outer)
  const turns = roof.turns ?? 0
  if (form === 'mono') {
    const fall = quarterTurn(along, 1 + turns)
    const { min } = extent(outer, fall)
    const heightAt: HeightAt = (p) => (p.x * fall.x + p.z * fall.z - min) * rise + baseY
    const faces = footprints.map((footprint) => lift(footprint.outer, heightAt))
    return { faces, heightAt, ridge: null }
  }
  const ridgeAxis = quarterTurn(along, turns % 2)
  const across = quarterTurn(ridgeAxis, 1)
  const span = extent(outer, across)
  const middle = (span.min + span.max) / 2
  const half = (span.max - span.min) / 2
  const heightAt: HeightAt = (p) => (half - Math.abs(p.x * across.x + p.z * across.z - middle)) * rise + baseY
  const faces: RoofVertex[][] = []
  for (const footprint of footprints) {
    for (const keepAbove of [true, false]) {
      const piece = clipHalfPlane(footprint.outer, across, middle, keepAbove)
      if (piece.length >= 3) faces.push(lift(piece, heightAt))
    }
  }
  const length = extent(outer, ridgeAxis)
  const ridgePoint = (t: number) => ({
    x: ridgeAxis.x * t + across.x * middle,
    z: ridgeAxis.z * t + across.z * middle,
  })
  return { faces, heightAt, ridge: { a: ridgePoint(length.min), b: ridgePoint(length.max) } }
}

export function roofFacesForFloor(floor: Floor, roof: Roof, reach = DEFAULT_REACH): RoofVertex[][] {
  return roofSurface(floor, roof, reach).faces
}

export type RoofInfill = { wall: Wall; outer: RoofVertex[]; inner: RoofVertex[]; area: number }

export function roofInfills(below: Floor, floor: Floor, roof: Roof, reach = DEFAULT_REACH): RoofInfill[] {
  const { heightAt } = roofSurface(floor, roof, reach)
  if (!heightAt) return []
  const cells = deriveRooms(below)
  const count = new Map<string, number>()
  const edges: { wall: Wall; a: PlanPoint; b: PlanPoint; ring: Ring }[] = []
  for (const room of cells) {
    const ring: Ring = room.cornerIds.map((id) => {
      const corner = below.corners.find((item) => item.id === id)!
      return { x: corner.x, z: corner.z }
    })
    for (let i = 0; i < room.cornerIds.length; i++) {
      const wall = wallBetween(below, room.cornerIds[i], room.cornerIds[(i + 1) % room.cornerIds.length])
      if (!wall || wall.skin === 'logical') continue
      count.set(wall.id, (count.get(wall.id) ?? 0) + 1)
      edges.push({ wall, a: ring[i], b: ring[(i + 1) % ring.length], ring })
    }
  }
  const infills: RoofInfill[] = []
  for (const edge of edges) {
    if (count.get(edge.wall.id) !== 1) continue
    const dx = edge.b.x - edge.a.x
    const dz = edge.b.z - edge.a.z
    const length = Math.hypot(dx, dz)
    if (length < 1e-6) continue
    let normal = { x: dz / length, z: -dx / length }
    const mid = { x: (edge.a.x + edge.b.x) / 2, z: (edge.a.z + edge.b.z) / 2 }
    if (pointInRing(edge.ring, mid.x + normal.x * 0.05, mid.z + normal.z * 0.05)) normal = { x: -normal.x, z: -normal.z }
    const wallReachOut = wallReach(edge.wall)
    const face = (offset: number) => {
      const at = (t: number) => ({
        x: edge.a.x + dx * t + normal.x * offset,
        z: edge.a.z + dz * t + normal.z * offset,
      })
      const samples = [0, 1]
      const ha = heightAt(at(0))
      const hb = heightAt(at(1))
      for (let k = 1; k < 32; k++) {
        const t = k / 32
        const h = heightAt(at(t))
        const linear = ha + (hb - ha) * t
        if (Math.abs(h - linear) > 1e-3) samples.push(t)
      }
      samples.sort((p, q) => p - q)
      const top = samples.map((t) => {
        const p = at(t)
        return { x: p.x, y: Math.max(0, heightAt(p)), z: p.z }
      })
      return top
    }
    const outerTop = face(wallReachOut)
    if (outerTop.every((p) => p.y < 1e-3)) continue
    const innerTop = face(-wallReachOut)
    const close = (top: RoofVertex[]) => [
      { x: top[0].x, y: 0, z: top[0].z },
      { x: top[top.length - 1].x, y: 0, z: top[top.length - 1].z },
      ...[...top].reverse(),
    ]
    let area = 0
    for (let i = 0; i < outerTop.length - 1; i++) {
      const p = outerTop[i]
      const q = outerTop[i + 1]
      area += (Math.hypot(q.x - p.x, q.z - p.z) * (p.y + q.y)) / 2
    }
    infills.push({ wall: edge.wall, outer: close(outerTop), inner: close(innerTop), area })
  }
  return infills
}

export function buildInfillGeometry(infills: RoofInfill[]): BufferGeometry | null {
  const positions: number[] = []
  for (const infill of infills) {
    for (const polygon of [infill.outer, infill.inner]) {
      for (let i = 1; i < polygon.length - 1; i++) {
        for (const v of [polygon[0], polygon[i], polygon[i + 1]]) positions.push(v.x, v.y, v.z)
      }
    }
  }
  if (positions.length < 9) return null
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.computeVertexNormals()
  return geometry
}

export type RoofPlan = {
  footprints: DeckPolygon[]
  hips: { a: PlanPoint; b: PlanPoint }[]
}

export function roofPlan(floor: Floor, roof: Roof, reach = DEFAULT_REACH): RoofPlan {
  const footprints = eavesFootprints(floor, roof.eaves, reach)
  const rise = Math.tan((roof.pitchDeg * Math.PI) / 180)
  const baseY = -roof.eaves * rise
  if ((roof.form ?? 'hip') !== 'hip') {
    const { ridge } = roofSurface(floor, roof, reach)
    return { footprints, hips: ridge ? [ridge] : [] }
  }
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

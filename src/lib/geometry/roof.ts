import { List, SkeletonBuilder, Vector2d } from 'straight-skeleton'
import {
  BufferGeometry,
  Float32BufferAttribute,
  ShapeUtils,
  Vector2,
} from 'three'
import { deriveRooms } from '../model/rooms'
import { signedPolygonArea } from '../model/geom'
import { gableBlocks, polygonArea, type GableBlock } from './gable'
import { coveringOf } from './coverings'
import { systemOf } from '../model/systems'
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

export type RoofInfill = { wall: Wall; blocks: GableBlock[]; area: number }

export function roofInfills(below: Floor, floor: Floor, roof: Roof, reach = DEFAULT_REACH): RoofInfill[] {
  const { heightAt } = roofSurface(floor, roof, reach)
  if (!heightAt) return []
  const count = new Map<string, number>()
  const walls = new Map<string, Wall>()
  for (const room of deriveRooms(below)) {
    for (let i = 0; i < room.cornerIds.length; i++) {
      const wall = wallBetween(below, room.cornerIds[i], room.cornerIds[(i + 1) % room.cornerIds.length])
      if (!wall || wall.skin === 'logical') continue
      count.set(wall.id, (count.get(wall.id) ?? 0) + 1)
      walls.set(wall.id, wall)
    }
  }
  const infills: RoofInfill[] = []
  for (const wall of walls.values()) {
    if (count.get(wall.id) !== 1) continue
    const blocks = gableBlocks(below, wall, heightAt)
    if (blocks.length === 0) continue
    const leaves = Math.max(1, systemOf(wall).leaves)
    const area = blocks.reduce((sum, block) => sum + polygonArea(block.poly), 0) / leaves
    infills.push({ wall, blocks, area })
  }
  return infills
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

export type RoofMeshes = {
  top: BufferGeometry | null
  under: BufferGeometry | null
  edges: BufferGeometry | null
}

function faceTriangles(face: RoofVertex[]): RoofVertex[][] {
  let ordered = face
  let triangles = ShapeUtils.triangulateShape(
    ordered.map((vertex) => new Vector2(vertex.x, vertex.z)),
    [],
  )
  if (triangles.length === 0) {
    ordered = [...face].reverse()
    triangles = ShapeUtils.triangulateShape(
      ordered.map((vertex) => new Vector2(vertex.x, vertex.z)),
      [],
    )
  }
  return triangles.map((triangle) => triangle.map((index) => ordered[index]))
}

function facePlane(face: RoofVertex[]): { cos: number; down: PlanPoint } {
  let nx = 0
  let ny = 0
  let nz = 0
  for (let i = 0; i < face.length; i++) {
    const a = face[i]
    const b = face[(i + 1) % face.length]
    nx += (a.y - b.y) * (a.z + b.z)
    ny += (a.z - b.z) * (a.x + b.x)
    nz += (a.x - b.x) * (a.y + b.y)
  }
  if (ny < 0) {
    nx = -nx
    ny = -ny
    nz = -nz
  }
  const length = Math.hypot(nx, ny, nz) || 1
  const flat = Math.hypot(nx, nz)
  return {
    cos: ny / length,
    down: flat > 1e-9 ? { x: nx / flat, z: nz / flat } : { x: 0, z: 1 },
  }
}

function geometry(positions: number[], uvs?: number[]): BufferGeometry | null {
  if (positions.length < 9) return null
  const built = new BufferGeometry()
  built.setAttribute('position', new Float32BufferAttribute(positions, 3))
  if (uvs) built.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
  built.computeVertexNormals()
  return built
}

export function buildRoofMeshes(floor: Floor, roof: Roof, reach = DEFAULT_REACH): RoofMeshes {
  const spec = coveringOf(roof)
  const faces = roofFacesForFloor(floor, roof, reach)
  const top: number[] = []
  const uvs: number[] = []
  const under: number[] = []
  const edges: number[] = []
  const shared = new Map<string, number>()
  const key = (a: RoofVertex, b: RoofVertex) => edgeKey(a, b)
  for (const face of faces) {
    for (let i = 0; i < face.length; i++) {
      const k = key(face[i], face[(i + 1) % face.length])
      shared.set(k, (shared.get(k) ?? 0) + 1)
    }
  }
  for (const face of faces) {
    const { cos, down } = facePlane(face)
    const lift = spec.depth / Math.max(cos, 0.05)
    const along = { x: -down.z, z: down.x }
    for (const triangle of faceTriangles(face)) {
      for (const v of triangle) {
        top.push(v.x, v.y + lift, v.z)
        uvs.push(
          (v.x * along.x + v.z * along.z) / spec.across,
          (v.x * down.x + v.z * down.z) / Math.max(cos, 0.05) / spec.along,
        )
        under.push(v.x, v.y, v.z)
      }
    }
    for (let i = 0; i < face.length; i++) {
      const a = face[i]
      const b = face[(i + 1) % face.length]
      if (shared.get(key(a, b)) !== 1) continue
      const aTop = [a.x, a.y + lift, a.z]
      const bTop = [b.x, b.y + lift, b.z]
      edges.push(a.x, a.y, a.z, b.x, b.y, b.z, ...bTop)
      edges.push(a.x, a.y, a.z, ...bTop, ...aTop)
    }
  }
  return { top: geometry(top, uvs), under: geometry(under), edges: geometry(edges) }
}

// The outside faces of a storey's walls, joined into one outline per building, with any courtyards as holes.
export function wallFootprints(floor: Floor): DeckPolygon[] {
  return eavesFootprints(floor, 0, DEFAULT_REACH)
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

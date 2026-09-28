import { cornerById, signedPolygonArea } from '../model/geom'
import { deriveRooms } from '../model/rooms'
import type { Document, Floor, Heightfield } from '../model/types'
import { BLOCK_THICKNESS, CAVITY } from '../plot/fixture'
import { bilinearHeight } from './terrain'

const WALL_OUTSTAND_M = CAVITY / 2 + BLOCK_THICKNESS

export type Ring = { x: number; z: number }[]

export type GroundPad = {
  datum: number
  rings: Ring[]
}

export function pointInRing(ring: Ring, x: number, z: number): boolean {
  const n = ring.length
  if (n < 3) return false
  let inside = false
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = ring[i].x
    const zi = ring[i].z
    const xj = ring[j].x
    const zj = ring[j].z
    const dx = xj - xi
    const dz = zj - zi
    const len2 = dx * dx + dz * dz
    if (len2 > 0) {
      const t = Math.max(0, Math.min(1, ((x - xi) * dx + (z - zi) * dz) / len2))
      const px = xi + t * dx
      const pz = zi + t * dz
      if (Math.hypot(x - px, z - pz) <= 1e-6) return true
    }
    const crosses = (zi > z) !== (zj > z)
    if (crosses && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside
  }
  return inside
}

function groundFloor(doc: Document): Floor | undefined {
  return doc.building.floors.find((floor) => floor.index === 0) ?? doc.building.floors[0]
}

export function structureRings(floor: Floor): Ring[] {
  const rings: Ring[] = []
  for (const room of deriveRooms(floor)) {
    const ring: Ring = []
    for (const id of room.cornerIds) {
      const corner = cornerById(floor.corners, id)
      if (!corner) {
        ring.length = 0
        break
      }
      ring.push({ x: corner.x, z: corner.z })
    }
    if (ring.length >= 3) rings.push(ring)
  }
  return rings
}

export function averageGrade(field: Heightfield, rings: Ring[]): number | null {
  if (rings.length === 0) return null
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (const ring of rings) {
    for (const p of ring) {
      minX = Math.min(minX, p.x)
      maxX = Math.max(maxX, p.x)
      minZ = Math.min(minZ, p.z)
      maxZ = Math.max(maxZ, p.z)
    }
  }
  const step = Math.min(field.cellSize, 0.5) / 2
  const nx = Math.max(1, Math.round((maxX - minX) / step))
  const nz = Math.max(1, Math.round((maxZ - minZ) / step))
  let sum = 0
  let count = 0
  for (let i = 0; i <= nx; i++) {
    const x = minX + ((maxX - minX) * i) / nx
    for (let j = 0; j <= nz; j++) {
      const z = minZ + ((maxZ - minZ) * j) / nz
      if (!rings.some((ring) => pointInRing(ring, x, z))) continue
      sum += bilinearHeight(field, x, z)
      count += 1
    }
  }
  if (count > 0) return sum / count
  let weighted = 0
  let area = 0
  for (const ring of rings) {
    const ringArea = Math.abs(signedPolygonArea(ring))
    if (ringArea <= 0) continue
    let x = 0
    let z = 0
    for (const p of ring) {
      x += p.x
      z += p.z
    }
    weighted += bilinearHeight(field, x / ring.length, z / ring.length) * ringArea
    area += ringArea
  }
  if (area <= 0) return null
  return weighted / area
}

export function groundPad(doc: Document): GroundPad | null {
  const floor = groundFloor(doc)
  if (!floor) return null
  const rings = structureRings(floor)
  const datum = averageGrade(doc.heightfield, rings)
  if (datum === null) return null
  return { datum, rings }
}

function distanceToSegment(
  x: number,
  z: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  const dx = bx - ax
  const dz = bz - az
  const len2 = dx * dx + dz * dz
  if (len2 === 0) return Math.hypot(x - ax, z - az)
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2))
  return Math.hypot(x - (ax + t * dx), z - (az + t * dz))
}

export function ringDistance(ring: Ring, x: number, z: number): number {
  if (pointInRing(ring, x, z)) return 0
  let best = Infinity
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    best = Math.min(
      best,
      distanceToSegment(x, z, ring[j].x, ring[j].z, ring[i].x, ring[i].z),
    )
  }
  return best
}

export function padBleed(field: Heightfield): number {
  return field.cellSize * Math.SQRT2 + WALL_OUTSTAND_M
}

export function levelField(field: Heightfield, rings: Ring[], datum: number): Heightfield {
  const heights = field.heights.slice()
  const bleed = padBleed(field)
  for (let r = 0; r < field.rows; r++) {
    for (let c = 0; c < field.cols; c++) {
      const x = field.originX + c * field.cellSize
      const z = field.originZ + r * field.cellSize
      if (rings.some((ring) => ringDistance(ring, x, z) <= bleed)) {
        heights[r * field.cols + c] = datum
      }
    }
  }
  return { ...field, heights }
}

export function floorWorldDatum(floorDatumHeight: number, pad: GroundPad | null): number {
  return floorDatumHeight + (pad?.datum ?? 0)
}

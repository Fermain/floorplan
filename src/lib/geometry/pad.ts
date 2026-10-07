import { cornerById, signedPolygonArea } from '../model/geom'
import { deriveRooms } from '../model/rooms'
import type { Document, Floor, Heightfield, Wall } from '../model/types'
import { BLOCK_THICKNESS, LEAF_OFFSET } from '../plot/fixture'
import { bilinearHeight } from './terrain'

export const WALL_OUTSTAND_M = LEAF_OFFSET + BLOCK_THICKNESS / 2

export const SURFACE_BED_TOP_ABOVE_DATUM_M = 0.15
export const SURFACE_BED_THICKNESS_M = SURFACE_BED_TOP_ABOVE_DATUM_M

export type Ring = { x: number; z: number }[]

export type StructurePad = {
  datum: number
  rings: Ring[]
  cornerIds: Set<string>
}

export type GroundPad = {
  structures: StructurePad[]
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

function componentRoots(floor: Floor): Map<string, string> {
  const parent = new Map<string, string>()
  const find = (id: string): string => {
    let root = id
    while (parent.get(root) !== root) root = parent.get(root) as string
    let cursor = id
    while (cursor !== root) {
      const next = parent.get(cursor) as string
      parent.set(cursor, root)
      cursor = next
    }
    return root
  }
  const unite = (a: string, b: string) => {
    if (!parent.has(a)) parent.set(a, a)
    if (!parent.has(b)) parent.set(b, b)
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent.set(ra, rb)
  }
  for (const wall of floor.walls) unite(wall.startCornerId, wall.endCornerId)
  const roots = new Map<string, string>()
  for (const id of parent.keys()) roots.set(id, find(id))
  return roots
}

export function connectedCornerIds(floor: Floor, cornerId: string): string[] {
  const roots = componentRoots(floor)
  const root = roots.get(cornerId)
  if (!root) return [cornerId]
  const ids: string[] = []
  for (const [id, found] of roots) {
    if (found === root) ids.push(id)
  }
  return ids
}

export function groundPad(doc: Document): GroundPad | null {
  const floor = groundFloor(doc)
  if (!floor) return null
  const roots = componentRoots(floor)
  const ringsByRoot = new Map<string, Ring[]>()
  const cornersByRoot = new Map<string, Set<string>>()
  for (const [id, root] of roots) {
    const corners = cornersByRoot.get(root) ?? new Set<string>()
    corners.add(id)
    cornersByRoot.set(root, corners)
  }
  for (const room of deriveRooms(floor)) {
    const root = roots.get(room.cornerIds[0])
    if (!root) continue
    const ring: Ring = []
    for (const id of room.cornerIds) {
      const corner = cornerById(floor.corners, id)
      if (!corner) {
        ring.length = 0
        break
      }
      ring.push({ x: corner.x, z: corner.z })
    }
    if (ring.length < 3) continue
    const rings = ringsByRoot.get(root) ?? []
    rings.push(ring)
    ringsByRoot.set(root, rings)
  }
  const structures: StructurePad[] = []
  for (const [root, rings] of ringsByRoot) {
    const datum = averageGrade(doc.heightfield, rings)
    if (datum === null) continue
    structures.push({
      datum,
      rings,
      cornerIds: cornersByRoot.get(root) ?? new Set(),
    })
  }
  if (structures.length === 0) return null
  return { structures }
}

// The level of the pad a point stands on: the building it is in, or failing that one it is close against, such as
// a light on an outside wall. Null out in the open.
export function padDatumAt(pad: GroundPad | null, x: number, z: number, reach = 1): number | null {
  if (!pad) return null
  const inside = structureAt(pad, x, z)
  if (inside) return inside.datum
  let best: number | null = null
  let near = reach
  for (const structure of pad.structures) {
    for (const ring of structure.rings) {
      const d = ringDistance(ring, x, z)
      if (d < near) {
        near = d
        best = structure.datum
      }
    }
  }
  return best
}

function structureAt(pad: GroundPad, x: number, z: number): StructurePad | undefined {
  for (const structure of pad.structures) {
    if (structure.rings.some((ring) => ringDistance(ring, x, z) === 0)) return structure
  }
  return undefined
}

export function wallDatum(floor: Floor, wall: Wall, pad: GroundPad | null): number | null {
  if (!pad) return null
  if (floor.index === 0) {
    return pad.structures.find((structure) => structure.cornerIds.has(wall.startCornerId))?.datum ?? null
  }
  const start = cornerById(floor.corners, wall.startCornerId)
  const end = cornerById(floor.corners, wall.endCornerId)
  if (!start || !end) return null
  const mid = { x: (start.x + end.x) / 2, z: (start.z + end.z) / 2 }
  return (
    structureAt(pad, mid.x, mid.z)?.datum ??
    structureAt(pad, start.x, start.z)?.datum ??
    structureAt(pad, end.x, end.z)?.datum ??
    null
  )
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

export type LevelPad = { datum: number; rings: Ring[] }

export function levelField(field: Heightfield, structures: LevelPad[], extras: LevelPad[] = []): Heightfield {
  const heights = field.heights.slice()
  const bleed = padBleed(field)
  const fixtureBleed = field.cellSize * Math.SQRT2
  for (let r = 0; r < field.rows; r++) {
    for (let c = 0; c < field.cols; c++) {
      const x = field.originX + c * field.cellSize
      const z = field.originZ + r * field.cellSize
      let best = Infinity
      let datum: number | null = null
      for (const structure of structures) {
        for (const ring of structure.rings) {
          const distance = ringDistance(ring, x, z)
          if (distance < best) {
            best = distance
            datum = structure.datum
          }
        }
      }
      if (datum !== null && best <= bleed) heights[r * field.cols + c] = datum
      // Fitting pads only reshape the ground outside: never lift terrain through a room slab.
      const indoors = structures.some((structure) => structure.rings.some((room) => pointInRing(room, x, z)))
      if (indoors) continue
      for (const pad of extras) {
        for (const ring of pad.rings) {
          if (ringDistance(ring, x, z) <= fixtureBleed) {
            heights[r * field.cols + c] = pad.datum
            break
          }
        }
      }
    }
  }
  return { ...field, heights }
}

export function floorWorldDatum(floorDatumHeight: number, datum: number): number {
  return floorDatumHeight + datum
}

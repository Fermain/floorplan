import { signedPolygonArea } from '../model/geom'
import {
  componentHasRoom,
  cornerComponents,
  topStoreyIndex,
} from '../model/stories'
import { deriveRooms } from '../model/rooms'
import type { Document, Floor } from '../model/types'
import {
  BLOCK_HEIGHT,
  BLOCK_THICKNESS,
  CAVITY,
  DEFAULT_STOREY_HEIGHT,
} from '../plot/fixture'
import { pointInRing, type Ring } from './pad'

export const ROOF_PITCH_DEG = 30
export const ROOF_EAVES_M = 0.3

const OUTER_FACE_M = CAVITY / 2 + BLOCK_THICKNESS
const WALL_HEAD = Math.floor(DEFAULT_STOREY_HEIGHT / BLOCK_HEIGHT) * BLOCK_HEIGHT
const EAVES_OFFSET_M = OUTER_FACE_M + ROOF_EAVES_M

export type RoofFootprint = { outer: Ring }

export type RoofPlane = {
  corners: { x: number; y: number; z: number }[]
}

export type RoofSpec = {
  footprints: RoofFootprint[]
  planes: RoofPlane[]
  eavesY: number
}

export function wallHeadHeight(): number {
  return WALL_HEAD
}

export function roofEavesAboveDatum(floor: Floor): number {
  return floor.walls.some((wall) => wall.skin !== 'logical') ? WALL_HEAD : 0
}

export function roofFootprintsForFloor(floor: Floor, cornerIds?: string[]): RoofFootprint[] {
  const rings = planRings(floor, cornerIds)
  return rings
    .map((ring) => offsetOutward(ring, EAVES_OFFSET_M))
    .filter((ring) => ring.length >= 3)
    .map((outer) => ({ outer }))
}

export function roofsForDocument(
  document: Document,
  eavesWorldY: (floor: Floor, rings: Ring[]) => number,
): RoofSpec[] {
  const roofs: RoofSpec[] = []
  const ground = document.building.floors.find((floor) => floor.index === 0)
  if (!ground) return roofs

  const unitTops = new Map<string, Floor>()
  for (const floor of document.building.floors) {
    if (!floor.unitId) continue
    const prev = unitTops.get(floor.unitId)
    if (!prev || floor.index > prev.index) unitTops.set(floor.unitId, floor)
  }

  for (const [unitId, top] of unitTops) {
    if (topStoreyIndex(document, unitId) !== top.index) continue
    const footprints = roofFootprintsForFloor(top)
    if (footprints.length === 0) continue
    const rings = footprints.map((item) => item.outer)
    const eavesY = eavesWorldY(top, rings)
    roofs.push({
      footprints,
      planes: planesForFootprints(footprints, eavesY),
      eavesY,
    })
  }

  for (const group of cornerComponents(ground)) {
    if (!componentHasRoom(ground, group)) continue
    const unitId = ground.corners.find((corner) => group.includes(corner.id))?.unitId
    if (unitId && unitTops.has(unitId)) continue
    const footprints = roofFootprintsForFloor(ground, group)
    if (footprints.length === 0) continue
    const rings = footprints.map((item) => item.outer)
    const eavesY = eavesWorldY(ground, rings)
    roofs.push({
      footprints,
      planes: planesForFootprints(footprints, eavesY),
      eavesY,
    })
  }

  return roofs
}

export function footprintCovers(footprints: RoofFootprint[], x: number, z: number): boolean {
  return footprints.some((footprint) => pointInRing(footprint.outer, x, z))
}

function planRings(floor: Floor, cornerIds?: string[]): Ring[] {
  const keep = cornerIds ? new Set(cornerIds) : null
  const rooms = deriveRooms(floor)
  const rings: Ring[] = []
  for (const room of rooms) {
    if (keep && !room.cornerIds.some((id) => keep.has(id))) continue
    const ring: Ring = []
    for (const id of room.cornerIds) {
      const corner = floor.corners.find((item) => item.id === id)
      if (!corner) {
        ring.length = 0
        break
      }
      ring.push({ x: corner.x, z: corner.z })
    }
    if (ring.length >= 3) rings.push(ring)
  }
  if (rings.length > 0) return rings
  if (keep) return []
  return (floor.outline ?? []).map((ring) => ring.map((point) => ({ x: point.x, z: point.z })))
}

function planesForFootprints(footprints: RoofFootprint[], eavesY: number): RoofPlane[] {
  const planes: RoofPlane[] = []
  const pitch = (ROOF_PITCH_DEG * Math.PI) / 180
  for (const footprint of footprints) {
    const ring = footprint.outer
    if (ring.length < 3) continue
    let minX = Infinity
    let maxX = -Infinity
    let minZ = Infinity
    let maxZ = -Infinity
    for (const point of ring) {
      minX = Math.min(minX, point.x)
      maxX = Math.max(maxX, point.x)
      minZ = Math.min(minZ, point.z)
      maxZ = Math.max(maxZ, point.z)
    }
    const spanX = maxX - minX
    const spanZ = maxZ - minZ
    if (spanX < 1e-6 || spanZ < 1e-6) continue
    if (spanX >= spanZ) {
      const midZ = (minZ + maxZ) / 2
      const rise = (spanZ / 2) * Math.tan(pitch)
      const ridgeY = eavesY + rise
      planes.push({
        corners: [
          { x: minX, y: eavesY, z: minZ },
          { x: maxX, y: eavesY, z: minZ },
          { x: maxX, y: ridgeY, z: midZ },
          { x: minX, y: ridgeY, z: midZ },
        ],
      })
      planes.push({
        corners: [
          { x: minX, y: ridgeY, z: midZ },
          { x: maxX, y: ridgeY, z: midZ },
          { x: maxX, y: eavesY, z: maxZ },
          { x: minX, y: eavesY, z: maxZ },
        ],
      })
    } else {
      const midX = (minX + maxX) / 2
      const rise = (spanX / 2) * Math.tan(pitch)
      const ridgeY = eavesY + rise
      planes.push({
        corners: [
          { x: minX, y: eavesY, z: minZ },
          { x: midX, y: ridgeY, z: minZ },
          { x: midX, y: ridgeY, z: maxZ },
          { x: minX, y: eavesY, z: maxZ },
        ],
      })
      planes.push({
        corners: [
          { x: midX, y: ridgeY, z: minZ },
          { x: maxX, y: eavesY, z: minZ },
          { x: maxX, y: eavesY, z: maxZ },
          { x: midX, y: ridgeY, z: maxZ },
        ],
      })
    }
  }
  return planes
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

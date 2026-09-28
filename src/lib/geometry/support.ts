import { cornerById } from '../model/geom'
import { BLOCK_THICKNESS } from '../plot/fixture'
import type { Document, Floor, Wall } from '../model/types'

type Segment = { ax: number; az: number; bx: number; bz: number }

const PARALLEL_EPS = 0.02

function wallCenterline(floor: Floor, wall: Wall): Segment | null {
  const a = cornerById(floor.corners, wall.startCornerId)
  const b = cornerById(floor.corners, wall.endCornerId)
  if (!a || !b) return null
  return { ax: a.x, az: a.z, bx: b.x, bz: b.z }
}

function segmentLength(seg: Segment): number {
  return Math.hypot(seg.bx - seg.ax, seg.bz - seg.az)
}

function distPointToSegment(px: number, pz: number, seg: Segment): number {
  const dx = seg.bx - seg.ax
  const dz = seg.bz - seg.az
  const lenSq = dx * dx + dz * dz
  if (lenSq === 0) return Math.hypot(px - seg.ax, pz - seg.az)
  let t = ((px - seg.ax) * dx + (pz - seg.az) * dz) / lenSq
  t = Math.max(0, Math.min(1, t))
  const qx = seg.ax + t * dx
  const qz = seg.az + t * dz
  return Math.hypot(px - qx, pz - qz)
}

function wallBelongsToUnit(floor: Floor, wall: Wall, unitId: string): boolean {
  if (floor.index > 0) return floor.unitId === unitId
  const a = cornerById(floor.corners, wall.startCornerId)
  const b = cornerById(floor.corners, wall.endCornerId)
  return a?.unitId === unitId && b?.unitId === unitId
}

function floorBelow(document: Document, floor: Floor): Floor | undefined {
  if (floor.index === 0 || !floor.unitId) return undefined
  if (floor.index === 1) {
    return document.building.floors.find((item) => item.index === 0)
  }
  return document.building.floors.find(
    (item) => item.unitId === floor.unitId && item.index === floor.index - 1,
  )
}

function centerlineCarriedBy(upper: Segment, lower: Segment, tolerance: number): boolean {
  const upperLen = segmentLength(upper)
  const lowerLen = segmentLength(lower)
  if (upperLen < 1e-9 || lowerLen < 1e-9) return false

  const udx = (upper.bx - upper.ax) / upperLen
  const udz = (upper.bz - upper.az) / upperLen
  const ldx = (lower.bx - lower.ax) / lowerLen
  const ldz = (lower.bz - lower.az) / lowerLen

  if (Math.abs(udx * ldz - udz * ldx) > PARALLEL_EPS) return false

  const midX = (upper.ax + upper.bx) / 2
  const midZ = (upper.az + upper.bz) / 2
  if (distPointToSegment(midX, midZ, lower) > tolerance) return false

  const along = (x: number, z: number) => (x - lower.ax) * ldx + (z - lower.az) * ldz
  const u0 = along(upper.ax, upper.az)
  const u1 = along(upper.bx, upper.bz)
  const lo = Math.min(u0, u1)
  const hi = Math.max(u0, u1)
  const overlap = Math.min(hi, lowerLen) - Math.max(lo, 0)
  return overlap >= tolerance
}

export function wallLandsOnBelow(document: Document, floor: Floor, wall: Wall): boolean {
  if (floor.index === 0) return true
  if (wall.skin === 'logical') return true
  const unitId = floor.unitId
  if (!unitId) return false

  const upper = wallCenterline(floor, wall)
  if (!upper) return false

  const below = floorBelow(document, floor)
  if (!below) return false

  const tolerance = BLOCK_THICKNESS / 2
  for (const lowerWall of below.walls) {
    if (lowerWall.skin === 'logical') continue
    if (!wallBelongsToUnit(below, lowerWall, unitId)) continue
    const lower = wallCenterline(below, lowerWall)
    if (lower && centerlineCarriedBy(upper, lower, tolerance)) return true
  }
  return false
}

export function isUnlandedWall(document: Document, floor: Floor, wall: Wall): boolean {
  if (floor.index === 0 || wall.skin === 'logical') return false
  return !wallLandsOnBelow(document, floor, wall)
}

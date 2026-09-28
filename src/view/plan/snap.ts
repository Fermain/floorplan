import { segmentAllowedInPlot, pointInPlot } from '../../lib/model/plot-check'
import type { Corner, Plot } from '../../lib/model/types'
import { BLOCK_LENGTH } from '../../lib/plot/fixture'

export const CORNER_SNAP_M = 0.15
export const MODULE_SNAP_TOLERANCE_M = 0.05
export const MIN_TURN_DEG = 15
export const ORTHOGONAL_SNAP_DEG = 5

export function nearestCorner(
  corners: Corner[],
  x: number,
  z: number,
  radius = CORNER_SNAP_M,
  exceptId?: string,
): Corner | undefined {
  let best: Corner | undefined
  let bestD = radius
  for (const c of corners) {
    if (c.id === exceptId) continue
    const d = Math.hypot(c.x - x, c.z - z)
    if (d <= bestD) {
      bestD = d
      best = c
    }
  }
  return best
}

export function snapEndToModule(
  plot: Plot,
  startX: number,
  startZ: number,
  endX: number,
  endZ: number,
  endIsExistingCorner: boolean,
): { x: number; z: number } {
  if (endIsExistingCorner) {
    return { x: endX, z: endZ }
  }
  const dx = endX - startX
  const dz = endZ - startZ
  const len = Math.hypot(dx, dz)
  if (len <= 0) {
    return { x: endX, z: endZ }
  }
  const snappedLen = Math.round(len / BLOCK_LENGTH) * BLOCK_LENGTH
  if (snappedLen <= 0 || Math.abs(len - snappedLen) > MODULE_SNAP_TOLERANCE_M) {
    return { x: endX, z: endZ }
  }
  const tx = dx / len
  const tz = dz / len
  const snapped = { x: startX + tx * snappedLen, z: startZ + tz * snappedLen }
  if (!pointInPlot(plot, snapped.x, snapped.z)) {
    return { x: endX, z: endZ }
  }
  if (!segmentAllowedInPlot(plot, startX, startZ, snapped.x, snapped.z)) {
    return { x: endX, z: endZ }
  }
  return snapped
}

export function smallerAngleDeg(ax: number, az: number, bx: number, bz: number): number | null {
  const la = Math.hypot(ax, az)
  const lb = Math.hypot(bx, bz)
  if (la < 1e-9 || lb < 1e-9) return null
  const dot = Math.min(1, Math.max(-1, (ax * bx + az * bz) / (la * lb)))
  return (Math.acos(dot) * 180) / Math.PI
}

export function headingFromNorthDeg(dx: number, dz: number): number | null {
  if (Math.hypot(dx, dz) < 1e-9) return null
  const deg = (Math.atan2(dx, dz) * 180) / Math.PI
  return (deg + 360) % 360
}

export type WallSnap = { x: number; z: number; wallId: string }

export function nearestWallPoint(
  corners: Corner[],
  walls: { id: string; startCornerId: string; endCornerId: string }[],
  x: number,
  z: number,
  radius = CORNER_SNAP_M,
  exceptCornerId?: string,
): WallSnap | undefined {
  let best: WallSnap | undefined
  let bestD = radius
  for (const wall of walls) {
    if (
      exceptCornerId &&
      (wall.startCornerId === exceptCornerId || wall.endCornerId === exceptCornerId)
    ) {
      continue
    }
    const a = corners.find((c) => c.id === wall.startCornerId)
    const b = corners.find((c) => c.id === wall.endCornerId)
    if (!a || !b) continue
    const dx = b.x - a.x
    const dz = b.z - a.z
    const len2 = dx * dx + dz * dz
    if (len2 === 0) continue
    const len = Math.sqrt(len2)
    const t = ((x - a.x) * dx + (z - a.z) * dz) / len2
    if (t * len <= CORNER_SNAP_M || (1 - t) * len <= CORNER_SNAP_M) continue
    const px = a.x + t * dx
    const pz = a.z + t * dz
    const d = Math.hypot(px - x, pz - z)
    if (d <= bestD) {
      bestD = d
      best = { x: px, z: pz, wallId: wall.id }
    }
  }
  return best
}

function segmentStaysInPlot(
  plot: Plot,
  startX: number,
  startZ: number,
  x: number,
  z: number,
): boolean {
  return pointInPlot(plot, x, z) && segmentAllowedInPlot(plot, startX, startZ, x, z)
}

export function snapEndToOrthogonal(
  plot: Plot,
  startX: number,
  startZ: number,
  endX: number,
  endZ: number,
  refDx: number | null,
  refDz: number | null,
  tolerance = ORTHOGONAL_SNAP_DEG,
): { x: number; z: number; applied: boolean; square: boolean } {
  const dx = endX - startX
  const dz = endZ - startZ
  const len = Math.hypot(dx, dz)
  const keep = { x: endX, z: endZ, applied: false, square: false }
  if (len < 1e-9) return keep

  if (refDx === null || refDz === null || Math.hypot(refDx, refDz) < 1e-9) {
    const heading = headingFromNorthDeg(dx, dz)
    if (heading === null) return keep
    const target = (((Math.round(heading / 90) * 90) % 360) + 360) % 360
    let distance = Math.abs(heading - target)
    if (distance > 180) distance = 360 - distance
    if (distance > tolerance) return keep
    const rad = (target * Math.PI) / 180
    const snapped = { x: startX + Math.sin(rad) * len, z: startZ + Math.cos(rad) * len }
    if (!segmentStaysInPlot(plot, startX, startZ, snapped.x, snapped.z)) return keep
    return { ...snapped, applied: true, square: false }
  }

  const a0 = Math.atan2(refDz, refDx)
  const a1 = Math.atan2(dz, dx)
  let delta = a1 - a0
  while (delta > Math.PI) delta -= 2 * Math.PI
  while (delta < -Math.PI) delta += 2 * Math.PI
  const deg = (delta * 180) / Math.PI
  const target = Math.round(deg / 90) * 90
  if (Math.abs(target) < 1 || Math.abs(deg - target) > tolerance) return keep
  const a = a0 + (target * Math.PI) / 180
  const snapped = { x: startX + Math.cos(a) * len, z: startZ + Math.sin(a) * len }
  if (!segmentStaysInPlot(plot, startX, startZ, snapped.x, snapped.z)) return keep
  return { ...snapped, applied: true, square: Math.abs(Math.abs(target) - 90) < 1 }
}

export function snapEndToMinTurn(
  plot: Plot,
  startX: number,
  startZ: number,
  endX: number,
  endZ: number,
  refDx: number,
  refDz: number,
  minDeg = MIN_TURN_DEG,
): { x: number; z: number; applied: boolean } {
  const dx = endX - startX
  const dz = endZ - startZ
  const len = Math.hypot(dx, dz)
  if (len < 1e-9) return { x: endX, z: endZ, applied: false }
  const angle = smallerAngleDeg(refDx, refDz, dx, dz)
  if (angle === null || angle >= minDeg) return { x: endX, z: endZ, applied: false }
  const cross = refDx * dz - refDz * dx
  const side = cross >= 0 ? 1 : -1
  const a = Math.atan2(refDz, refDx) + side * ((minDeg * Math.PI) / 180)
  const snapped = { x: startX + Math.cos(a) * len, z: startZ + Math.sin(a) * len }
  if (!pointInPlot(plot, snapped.x, snapped.z)) return { x: endX, z: endZ, applied: false }
  if (!segmentAllowedInPlot(plot, startX, startZ, snapped.x, snapped.z)) {
    return { x: endX, z: endZ, applied: false }
  }
  return { ...snapped, applied: true }
}

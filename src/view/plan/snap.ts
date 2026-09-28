import { segmentAllowedInPlot, pointInPlot } from '../../lib/model/plot-check'
import type { Corner, Plot } from '../../lib/model/types'
import { BLOCK_LENGTH } from '../../lib/plot/fixture'

export const CORNER_SNAP_M = 0.15
export const MODULE_SNAP_TOLERANCE_M = 0.05

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

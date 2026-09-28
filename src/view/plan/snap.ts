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
): Corner | undefined {
  let best: Corner | undefined
  let bestD = radius
  for (const c of corners) {
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

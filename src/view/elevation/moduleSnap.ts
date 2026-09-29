import { placeOpeningU } from '../../lib/model/openings'
import { BLOCK_HEIGHT, BLOCK_LENGTH } from '../../lib/plot/fixture'

export const HALF_MODULE = BLOCK_LENGTH / 2

export function snapToStep(value: number, step: number): number {
  return Math.round(value / step) * step
}

export function snapOpeningWidth(width: number, minWidth: number): number {
  if (width <= 0) return minWidth
  const snapped = snapToStep(width, HALF_MODULE)
  if (snapped <= 0 || snapped < minWidth - 1e-9) return minWidth
  return snapped
}

export function snapOpeningU(u: number): number {
  return snapToStep(u, HALF_MODULE)
}

export function snapLegalModuleU(
  target: number,
  width: number,
  length: number,
  others: { u: number; width: number }[],
): number | null {
  const snapped = snapOpeningU(target)
  const limit = Math.ceil(length / HALF_MODULE)
  let best: number | null = null
  let bestDist = Infinity
  for (let n = 0; n <= limit; n++) {
    const candidate = n * HALF_MODULE
    if (candidate > length - width + 1e-9) break
    const placed = placeOpeningU(candidate, width, length, others)
    if (placed === null || Math.abs(placed - candidate) > 1e-6) continue
    const dist = Math.abs(candidate - snapped)
    if (dist < bestDist - 1e-9) {
      best = candidate
      bestDist = dist
    }
  }
  return best
}

export function placeSnappedOpeningU(
  requestedU: number,
  width: number,
  length: number,
  others: { u: number; width: number }[],
  minWidth: number,
): { u: number; width: number } | null {
  const nextWidth = snapOpeningWidth(width, minWidth)
  const u = snapLegalModuleU(requestedU, nextWidth, length, others)
  if (u === null) return null
  return { u, width: nextWidth }
}

export function snapOpeningVertical(
  v: number,
  height: number,
  wallHead: number,
): { v: number; height: number } {
  let nextV = snapToStep(v, BLOCK_HEIGHT)
  if (nextV < 0) nextV = 0
  let nextH = snapToStep(height, BLOCK_HEIGHT)
  if (nextH <= 0) nextH = BLOCK_HEIGHT
  if (nextV + nextH > wallHead + 1e-9) {
    nextH = Math.floor((wallHead - nextV) / BLOCK_HEIGHT + 1e-9) * BLOCK_HEIGHT
    if (nextH <= 0) {
      nextH = BLOCK_HEIGHT
      nextV = Math.floor((wallHead - nextH) / BLOCK_HEIGHT + 1e-9) * BLOCK_HEIGHT
      if (nextV < 0) {
        nextV = 0
        nextH = Math.floor(wallHead / BLOCK_HEIGHT + 1e-9) * BLOCK_HEIGHT
      }
    }
  }
  return { v: nextV, height: nextH }
}

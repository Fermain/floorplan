import { placeOpeningU } from '../../lib/model/openings'
import { DEFAULT_WALL_SYSTEM_ID, wallSystem, type WallSystem } from '../../lib/model/systems'

const CLAY = wallSystem(DEFAULT_WALL_SYSTEM_ID)

export const HALF_MODULE = CLAY.moduleLength / 2

export function snapToStep(value: number, step: number): number {
  return Math.round(value / step) * step
}

export function snapOpeningWidth(width: number, minWidth: number, system: WallSystem = CLAY): number {
  if (width <= 0) return minWidth
  const snapped = snapToStep(width, system.moduleLength / 2)
  if (snapped <= 0 || snapped < minWidth - 1e-9) return minWidth
  return snapped
}

export function snapOpeningU(u: number, system: WallSystem = CLAY): number {
  return snapToStep(u, system.moduleLength / 2)
}

export function snapLegalModuleU(
  target: number,
  width: number,
  length: number,
  others: { u: number; width: number }[],
  system: WallSystem = CLAY,
): number | null {
  const half = system.moduleLength / 2
  const snapped = snapOpeningU(target, system)
  const limit = Math.ceil(length / half)
  let best: number | null = null
  let bestDist = Infinity
  for (let n = 0; n <= limit; n++) {
    const candidate = n * half
    if (candidate > length - width + 1e-9) break
    const placed = placeOpeningU(candidate, width, length, others, undefined, system.moduleLength)
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
  system: WallSystem = CLAY,
): { u: number; width: number } | null {
  const nextWidth = snapOpeningWidth(width, minWidth, system)
  const u = snapLegalModuleU(requestedU, nextWidth, length, others, system)
  if (u === null) return null
  return { u, width: nextWidth }
}

export function snapOpeningVertical(
  v: number,
  height: number,
  wallHead: number,
  system: WallSystem = CLAY,
): { v: number; height: number } {
  const course = system.courseHeight
  let nextV = snapToStep(v, course)
  if (nextV < 0) nextV = 0
  let nextH = snapToStep(height, course)
  if (nextH <= 0) nextH = course
  if (nextV + nextH > wallHead + 1e-9) {
    nextH = Math.floor((wallHead - nextV) / course + 1e-9) * course
    if (nextH <= 0) {
      nextH = course
      nextV = Math.floor((wallHead - nextH) / course + 1e-9) * course
      if (nextV < 0) {
        nextV = 0
        nextH = Math.floor(wallHead / course + 1e-9) * course
      }
    }
  }
  return { v: nextV, height: nextH }
}

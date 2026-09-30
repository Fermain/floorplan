import {
  BLOCK_HEIGHT,
  BLOCK_LENGTH,
  DEFAULT_DOOR_HEIGHT,
  DEFAULT_DOOR_WIDTH,
  DEFAULT_EXTERNAL_DOOR_WIDTH,
  DEFAULT_GARAGE_WIDTH,
  DEFAULT_INTERNAL_DOOR_WIDTH,
  DEFAULT_PORTAL_WIDTH,
  DOOR_MIN_WIDTH,
  EXTERNAL_DOOR_MIN_WIDTH,
  GARAGE_MIN_WIDTH,
  INTERNAL_DOOR_MIN_WIDTH,
  PORTAL_MIN_WIDTH,
  WINDOW_MIN_WIDTH,
  OPENING_EDGE_PAD,
  OPENING_MIN_GAP,
  DEFAULT_SILL,
  DEFAULT_WINDOW_HEIGHT,
  DEFAULT_WINDOW_WIDTH,
} from '../plot/fixture'
import { snapToCourse, snapToHalfModule, type WallSystem } from './systems'
import type { Opening, OpeningKind } from './types'

export function isFloorOpening(kind: OpeningKind): boolean {
  return kind !== 'window'
}

export function openingMinWidth(kind: OpeningKind): number {
  if (kind === 'garage') return GARAGE_MIN_WIDTH
  if (kind === 'external-door') return EXTERNAL_DOOR_MIN_WIDTH
  if (kind === 'internal-door') return INTERNAL_DOOR_MIN_WIDTH
  if (kind === 'door') return DOOR_MIN_WIDTH
  if (kind === 'portal') return PORTAL_MIN_WIDTH
  return WINDOW_MIN_WIDTH
}

export function defaultOpeningDimensions(
  kind: OpeningKind,
  system?: WallSystem,
): {
  v: number
  height: number
  width: number
} {
  const base = clayOpeningDimensions(kind)
  if (!system) return base
  if (Math.abs(system.courseHeight - BLOCK_HEIGHT) < 1e-9 && Math.abs(system.moduleLength - BLOCK_LENGTH) < 1e-9) {
    return base
  }
  const v = snapToCourse(system, base.v)
  const head = snapToCourse(system, base.v + base.height, 'ceil')
  return { v, height: head - v, width: snapToHalfModule(system, base.width, 'ceil') }
}

function clayOpeningDimensions(kind: OpeningKind): { v: number; height: number; width: number } {
  if (kind === 'external-door') {
    return { v: 0, height: DEFAULT_DOOR_HEIGHT, width: DEFAULT_EXTERNAL_DOOR_WIDTH }
  }
  if (kind === 'internal-door') {
    return { v: 0, height: DEFAULT_DOOR_HEIGHT, width: DEFAULT_INTERNAL_DOOR_WIDTH }
  }
  if (kind === 'garage') {
    return { v: 0, height: DEFAULT_DOOR_HEIGHT, width: DEFAULT_GARAGE_WIDTH }
  }
  if (kind === 'door') {
    return { v: 0, height: DEFAULT_DOOR_HEIGHT, width: DEFAULT_DOOR_WIDTH }
  }
  if (kind === 'portal') {
    return { v: 0, height: DEFAULT_DOOR_HEIGHT, width: DEFAULT_PORTAL_WIDTH }
  }
  return { v: DEFAULT_SILL, height: DEFAULT_WINDOW_HEIGHT, width: DEFAULT_WINDOW_WIDTH }
}

export function openingWidthLimits(kind: OpeningKind, length: number): { min: number; max: number } {
  return { min: openingMinWidth(kind), max: length - 2 * OPENING_EDGE_PAD }
}

export function doorWidthLimits(length: number): { min: number; max: number } {
  return openingWidthLimits('door', length)
}

export function windowWidthLimits(length: number): { min: number; max: number } {
  return openingWidthLimits('window', length)
}

export function fitOpeningU(centre: number, width: number, length: number, pad = OPENING_EDGE_PAD): number | null {
  return placeOpeningU(centre - width / 2, width, length, [], pad, 0)
}

export function placeOpeningU(
  requestedU: number,
  width: number,
  length: number,
  others: { u: number; width: number }[],
  pad = OPENING_EDGE_PAD,
  gap = OPENING_MIN_GAP,
): number | null {
  const minU = pad
  const maxU = length - pad - width
  if (maxU < minU - 1e-6) return null
  const merged: [number, number][] = []
  const cuts = others
    .map((other) => [other.u - gap - width, other.u + other.width + gap] as [number, number])
    .sort((a, b) => a[0] - b[0])
  for (const cut of cuts) {
    const last = merged[merged.length - 1]
    if (!last || cut[0] > last[1]) merged.push([cut[0], cut[1]])
    else last[1] = Math.max(last[1], cut[1])
  }
  const legal: [number, number][] = []
  let cursor = minU
  for (const [start, end] of merged) {
    if (start > cursor) legal.push([cursor, Math.min(start, maxU)])
    cursor = Math.max(cursor, end)
  }
  if (cursor <= maxU + 1e-6) legal.push([Math.min(cursor, maxU), maxU])
  const usable = legal.filter(([start, end]) => end >= start - 1e-6)
  if (usable.length === 0) return null
  let best = usable[0][0]
  let bestDist = Infinity
  for (const [start, end] of usable) {
    const candidate = Math.min(end, Math.max(start, requestedU))
    const dist = Math.abs(candidate - requestedU)
    if (dist < bestDist - 1e-9) {
      best = candidate
      bestDist = dist
    }
  }
  return best
}

export function maxOpeningWidth(
  centre: number,
  length: number,
  others: { u: number; width: number }[],
  pad = OPENING_EDGE_PAD,
  gap = OPENING_MIN_GAP,
): number {
  let left = pad
  let right = length - pad
  for (const other of others) {
    const end = other.u + other.width
    if (centre < other.u) right = Math.min(right, other.u - gap)
    else if (centre > end) left = Math.max(left, end + gap)
    else return 0
  }
  if (centre < left - 1e-6 || centre > right + 1e-6) return 0
  return Math.max(0, 2 * Math.min(centre - left, right - centre))
}

export function fitDoor(centre: number, width: number, length: number): { u: number; width: number } | null {
  const limits = doorWidthLimits(length)
  if (limits.max < limits.min - 1e-9) return null
  const nextWidth = Math.min(limits.max, Math.max(limits.min, width))
  const u = fitOpeningU(centre, nextWidth, length)
  if (u === null) return null
  return { u, width: nextWidth }
}

export function applyAligned(opening: Opening, system?: WallSystem): Opening {
  const d = defaultOpeningDimensions(opening.kind, system)
  return { ...opening, v: d.v, height: d.height, aligned: true }
}

export function createOpening(
  id: string,
  kind: OpeningKind,
  u: number,
  width?: number,
  system?: WallSystem,
): Opening {
  const d = defaultOpeningDimensions(kind, system)
  return {
    id,
    kind,
    u,
    v: d.v,
    height: d.height,
    width: width ?? d.width,
    aligned: true,
  }
}

import {
  DEFAULT_DOOR_HEIGHT,
  DEFAULT_DOOR_WIDTH,
  DEFAULT_SILL,
  DEFAULT_WINDOW_HEIGHT,
  DEFAULT_WINDOW_WIDTH,
} from '../plot/fixture'
import type { Opening, OpeningKind } from './types'

export function defaultOpeningDimensions(kind: OpeningKind): {
  v: number
  height: number
  width: number
} {
  if (kind === 'door') {
    return { v: 0, height: DEFAULT_DOOR_HEIGHT, width: DEFAULT_DOOR_WIDTH }
  }
  return { v: DEFAULT_SILL, height: DEFAULT_WINDOW_HEIGHT, width: DEFAULT_WINDOW_WIDTH }
}

export function applyAligned(opening: Opening): Opening {
  const d = defaultOpeningDimensions(opening.kind)
  return { ...opening, v: d.v, height: d.height, aligned: true }
}

export function createOpening(
  id: string,
  kind: OpeningKind,
  u: number,
  width?: number,
): Opening {
  const d = defaultOpeningDimensions(kind)
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

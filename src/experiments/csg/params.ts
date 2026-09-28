export const BLOCK_LENGTH_M = 0.44
export const BLOCK_HEIGHT_M = 0.215
export const BLOCK_THICKNESS_M = 0.1
export const CAVITY_M = 0.05

export const BLOCK_COUNT_X = 9
export const WALL_LENGTH_M = BLOCK_COUNT_X * BLOCK_LENGTH_M

export const COURSE_COUNT = 11
export const WALL_HEIGHT_M = COURSE_COUNT * BLOCK_HEIGHT_M

export const LEAF_OFFSET_Z_M = 0.075
export const WALL_DEPTH_M = 2 * BLOCK_THICKNESS_M + CAVITY_M

export const OPENING_COUNT = 10
export const OPENING_WIDTH_M = 0.28
export const OPENING_HEIGHT_M = 1.2
export const OPENING_SILL_M = 0.9

export const OPENING_GAP_M =
  (WALL_LENGTH_M - OPENING_COUNT * OPENING_WIDTH_M) / (OPENING_COUNT + 1)

export function openingCenterX(index: number): number {
  return (
    OPENING_GAP_M +
    OPENING_WIDTH_M / 2 +
    index * (OPENING_WIDTH_M + OPENING_GAP_M)
  )
}

export type OpeningRect = {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

export function openingRects(): OpeningRect[] {
  const rects: OpeningRect[] = []
  for (let i = 0; i < OPENING_COUNT; i++) {
    const cx = openingCenterX(i)
    rects.push({
      minX: cx - OPENING_WIDTH_M / 2,
      maxX: cx + OPENING_WIDTH_M / 2,
      minY: OPENING_SILL_M,
      maxY: OPENING_SILL_M + OPENING_HEIGHT_M,
    })
  }
  return rects
}

export function intervalsOverlap(
  aMin: number,
  aMax: number,
  bMin: number,
  bMax: number,
): boolean {
  return aMin < bMax && bMin < aMax
}

export function blockOverlapsAnyOpening(
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  openings: OpeningRect[],
): boolean {
  for (const o of openings) {
    if (
      intervalsOverlap(minX, maxX, o.minX, o.maxX) &&
      intervalsOverlap(minY, maxY, o.minY, o.maxY)
    ) {
      return true
    }
  }
  return false
}

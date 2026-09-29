import { describe, expect, it } from 'vitest'
import {
  BLOCK_HEIGHT,
  BLOCK_LENGTH,
  WINDOW_MIN_WIDTH,
} from '../../lib/plot/fixture'
import {
  HALF_MODULE,
  placeSnappedOpeningU,
  snapOpeningVertical,
  snapOpeningWidth,
} from './moduleSnap'

describe('placeSnappedOpeningU', () => {
  it('snaps a requested u of 0.20 to a half-module placeOpeningU accepts', () => {
    const length = 8
    const width = snapOpeningWidth(1, WINDOW_MIN_WIDTH)
    const placed = placeSnappedOpeningU(0.2, width, length, [], WINDOW_MIN_WIDTH)
    expect(placed).not.toBeNull()
    expect(placed!.u).toBeCloseTo(BLOCK_LENGTH, 5)
  })

  it('moves a half-brick inside the 150 mm end out to the next whole brick', () => {
    const length = 8
    const width = snapOpeningWidth(0.9, WINDOW_MIN_WIDTH)
    const placed = placeSnappedOpeningU(BLOCK_LENGTH / 2, width, length, [], WINDOW_MIN_WIDTH)
    expect(placed).not.toBeNull()
    expect(placed!.u).toBeCloseTo(BLOCK_LENGTH, 5)
    expect(placed!.u + placed!.width).toBeCloseTo(
      BLOCK_LENGTH + Math.round(placed!.width / (BLOCK_LENGTH / 2)) * (BLOCK_LENGTH / 2),
      5,
    )
  })

  it('snaps width 1.00 to the nearest half-module at or above the minimum', () => {
    const snapped = snapOpeningWidth(1, WINDOW_MIN_WIDTH)
    expect(snapped).toBeGreaterThanOrEqual(WINDOW_MIN_WIDTH - 1e-9)
    expect(snapped).toBeCloseTo(Math.round(1 / HALF_MODULE) * HALF_MODULE, 5)
  })
})

describe('snapOpeningVertical', () => {
  it('snaps v = 1.00 to the nearest course joint', () => {
    const { v } = snapOpeningVertical(1, 1.2, 2.574)
    expect(v).toBeCloseTo(Math.round(1 / BLOCK_HEIGHT) * BLOCK_HEIGHT, 5)
    expect(v).toBeCloseTo(12 * BLOCK_HEIGHT, 5)
  })
})

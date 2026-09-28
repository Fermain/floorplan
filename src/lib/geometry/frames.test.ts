import { describe, expect, it } from 'vitest'
import {
  FRAME_SECTION,
  GLASS_INSET,
  openingFrameLayout,
} from './frames'

describe('openingFrameLayout', () => {
  const opening = { u: 1.5, v: 0.9, width: 0.9, height: 1.2 }

  it('keeps the frame inside the opening rectangle', () => {
    const layout = openingFrameLayout(opening)
    expect(layout).not.toBeNull()
    expect(layout!.outer.u0).toBe(opening.u)
    expect(layout!.outer.u1).toBe(opening.u + opening.width)
    expect(layout!.outer.y0).toBe(opening.v)
    expect(layout!.outer.y1).toBe(opening.v + opening.height)
    for (const member of layout!.members) {
      expect(member.u0).toBeGreaterThanOrEqual(layout!.outer.u0 - 1e-9)
      expect(member.u1).toBeLessThanOrEqual(layout!.outer.u1 + 1e-9)
      expect(member.y0).toBeGreaterThanOrEqual(layout!.outer.y0 - 1e-9)
      expect(member.y1).toBeLessThanOrEqual(layout!.outer.y1 + 1e-9)
    }
    expect(layout!.inner.u0).toBeCloseTo(opening.u + FRAME_SECTION, 5)
    expect(layout!.inner.u1).toBeCloseTo(opening.u + opening.width - FRAME_SECTION, 5)
    expect(layout!.inner.y0).toBeCloseTo(opening.v + FRAME_SECTION, 5)
    expect(layout!.inner.y1).toBeCloseTo(opening.v + opening.height - FRAME_SECTION, 5)
    expect(layout!.inner.u1 - layout!.inner.u0).toBeGreaterThan(0)
    expect(layout!.inner.y1 - layout!.inner.y0).toBeGreaterThan(0)
  })

  it('makes the glass smaller than the frame inner opening', () => {
    const layout = openingFrameLayout(opening)
    expect(layout).not.toBeNull()
    expect(layout!.glass.u0).toBeCloseTo(layout!.inner.u0 + GLASS_INSET, 5)
    expect(layout!.glass.u1).toBeCloseTo(layout!.inner.u1 - GLASS_INSET, 5)
    expect(layout!.glass.y0).toBeCloseTo(layout!.inner.y0 + GLASS_INSET, 5)
    expect(layout!.glass.y1).toBeCloseTo(layout!.inner.y1 - GLASS_INSET, 5)
    expect(layout!.glass.u0).toBeGreaterThan(layout!.inner.u0)
    expect(layout!.glass.u1).toBeLessThan(layout!.inner.u1)
    expect(layout!.glass.y0).toBeGreaterThan(layout!.inner.y0)
    expect(layout!.glass.y1).toBeLessThan(layout!.inner.y1)
  })
})

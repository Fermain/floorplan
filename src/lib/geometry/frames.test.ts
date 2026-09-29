import { describe, expect, it } from 'vitest'
import type { Floor, Wall } from '../model/types'
import { BLOCK_HEIGHT } from '../plot/fixture'
import {
  FRAME_SECTION,
  GLASS_INSET,
  buildOpeningFrameGeometry,
  openingFrameLayout,
} from './frames'

describe('openingFrameLayout', () => {
  const opening = { u: 1.5, v: 0.9, width: 0.9, height: 1.2 }
  const sillJoint = Math.floor((opening.v + 1e-9) / BLOCK_HEIGHT) * BLOCK_HEIGHT

  it('keeps the frame inside the opening rectangle', () => {
    const layout = openingFrameLayout(opening)
    expect(layout).not.toBeNull()
    expect(layout!.outer.u0).toBe(opening.u)
    expect(layout!.outer.u1).toBe(opening.u + opening.width)
    expect(layout!.outer.y0).toBe(sillJoint)
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

  it('drops the outer bottom to the course joint below a window sill', () => {
    const layout = openingFrameLayout(opening)
    expect(layout).not.toBeNull()
    expect(sillJoint).toBeCloseTo(0.83, 5)
    expect(sillJoint).toBeLessThan(opening.v)
    const lowest = Math.min(...layout!.members.map((m) => m.y0))
    expect(lowest).toBeCloseTo(sillJoint, 5)
    expect(layout!.glass.y0).toBeGreaterThan(opening.v)
  })

  it('does not grow a door rail below the floor', () => {
    const door = { u: 1, v: 0, width: 0.9, height: 2.1 }
    const layout = openingFrameLayout(door)
    expect(layout).not.toBeNull()
    expect(layout!.outer.y0).toBe(0)
    for (const member of layout!.members) {
      expect(member.y0).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('buildOpeningFrameGeometry', () => {
  it('stops a door frame at the wall bottom instead of running below it', () => {
    const wall: Wall = {
      id: 'w1',
      startCornerId: 'a',
      endCornerId: 'b',
      skin: 'double',
      openings: [
        {
          id: 'd',
          u: 1,
          v: 0,
          width: 0.9,
          height: 2.1,
          kind: 'door',
          aligned: true,
        },
      ],
    }
    const floor: Floor = {
      id: 'f0',
      index: 0,
      datumHeight: 0,
      corners: [
        { id: 'a', x: 0, z: 0 },
        { id: 'b', x: 4, z: 0 },
      ],
      walls: [wall],
      roomFinishes: {},
    }
    const geometry = buildOpeningFrameGeometry(floor, wall, [
      { u: 0, y: 0.45 },
      { u: 4, y: 0.45 },
    ])
    expect(geometry).not.toBeNull()
    const positions = geometry!.getAttribute('position')
    let minY = Infinity
    for (let i = 0; i < positions.count; i++) minY = Math.min(minY, positions.getY(i))
    expect(minY).toBeGreaterThanOrEqual(0.45 - 1e-6)
  })
})

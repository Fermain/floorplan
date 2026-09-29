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
    expect(layout!.glass[0].u0).toBeCloseTo(layout!.inner.u0 + GLASS_INSET, 5)
    expect(layout!.glass[0].u1).toBeCloseTo(layout!.inner.u1 - GLASS_INSET, 5)
    expect(layout!.glass[0].y0).toBeCloseTo(layout!.inner.y0 + GLASS_INSET, 5)
    expect(layout!.glass[0].y1).toBeCloseTo(layout!.inner.y1 - GLASS_INSET, 5)
    expect(layout!.glass[0].u0).toBeGreaterThan(layout!.inner.u0)
    expect(layout!.glass[0].u1).toBeLessThan(layout!.inner.u1)
    expect(layout!.glass[0].y0).toBeGreaterThan(layout!.inner.y0)
    expect(layout!.glass[0].y1).toBeLessThan(layout!.inner.y1)
  })

  it('drops the outer bottom to the course joint below a window sill', () => {
    const layout = openingFrameLayout(opening)
    expect(layout).not.toBeNull()
    expect(sillJoint).toBeCloseTo(0.83, 5)
    expect(sillJoint).toBeLessThan(opening.v)
    const lowest = Math.min(...layout!.members.map((m) => m.y0))
    expect(lowest).toBeCloseTo(sillJoint, 5)
    expect(layout!.glass[0].y0).toBeGreaterThan(opening.v)
  })

  it('splits a wide window sooner than a door of the same width', () => {
    const wide = { u: 0, v: 0.9, width: 1.3, height: 1.2 }
    const windowLayout = openingFrameLayout({ ...wide, kind: 'window' })
    const doorLayout = openingFrameLayout({ ...wide, v: 0, height: 2.1, kind: 'door' })
    expect(windowLayout).not.toBeNull()
    expect(doorLayout).not.toBeNull()
    expect(windowLayout!.glass).toHaveLength(2)
    expect(doorLayout!.glass).toHaveLength(1)
    expect(windowLayout!.members).toHaveLength(5)
    const pillar = windowLayout!.members[4]
    expect(pillar.u1 - pillar.u0).toBeCloseTo(FRAME_SECTION, 5)
    expect(pillar.y0).toBeCloseTo(windowLayout!.inner.y0, 5)
    expect(pillar.y1).toBeCloseTo(windowLayout!.inner.y1, 5)
    expect(pillar.u0).toBeGreaterThan(windowLayout!.inner.u0)
    expect(pillar.u1).toBeLessThan(windowLayout!.inner.u1)
    expect(windowLayout!.glass[0].u1).toBeLessThanOrEqual(pillar.u0 + 1e-9)
    expect(windowLayout!.glass[1].u0).toBeGreaterThanOrEqual(pillar.u1 - 1e-9)
  })

  it('turns a very wide door into three sliding panels', () => {
    const door = { u: 0, v: 0, width: 2.6, height: 2.1, kind: 'door' as const }
    const layout = openingFrameLayout(door)
    expect(layout).not.toBeNull()
    expect(layout!.glass).toHaveLength(3)
    expect(layout!.members).toHaveLength(6)
    const pillars = layout!.members.slice(4)
    expect(pillars[0].u1).toBeLessThanOrEqual(pillars[1].u0)
    for (const pane of layout!.glass) {
      expect(pane.u1 - pane.u0).toBeGreaterThan(0)
      expect(pane.u1 - pane.u0).toBeLessThanOrEqual(1.2 + 1e-6)
    }
  })

  it('sets a solid door out as four panels, two short over two tall', () => {
    const external = openingFrameLayout({ u: 0, v: 0, width: 1.05, height: 2.1, kind: 'external-door' })
    expect(external).not.toBeNull()
    expect(external!.glass).toHaveLength(0)
    expect(external!.panels).toHaveLength(4)
    const byHeight = [...external!.panels].sort((a, b) => a.y0 - b.y0 || a.u0 - b.u0)
    const lower = byHeight.slice(0, 2)
    const upper = byHeight.slice(2)
    expect(lower[0].y1 - lower[0].y0).toBeCloseTo((upper[0].y1 - upper[0].y0) * 2, 5)
    expect(lower[0].y0 - external!.inner.y0).toBeGreaterThan(external!.inner.y1 - upper[0].y1)
    expect(upper[0].u1).toBeLessThan(upper[1].u0)
    const internal = openingFrameLayout({ u: 0, v: 0, width: 1.05, height: 2.1, kind: 'internal-door' })
    expect(internal!.panels).toHaveLength(8)
    expect(internal!.glass).toHaveLength(0)
    const pair = openingFrameLayout({ u: 0, v: 0, width: 1.8, height: 2.1, kind: 'external-door' })
    expect(pair!.panels).toHaveLength(8)
  })

  it('divides a garage door into horizontal panels', () => {
    const garage = openingFrameLayout({ u: 0, v: 0, width: 2.4, height: 2.1, kind: 'garage' })
    expect(garage).not.toBeNull()
    expect(garage!.glass).toHaveLength(0)
    expect(garage!.panels.length).toBeGreaterThan(1)
    for (const panel of garage!.panels) {
      expect(panel.y1 - panel.y0).toBeLessThanOrEqual(0.5 + 1e-6)
      expect(panel.u1 - panel.u0).toBeCloseTo(garage!.inner.u1 - garage!.inner.u0, 5)
    }
    const rails = garage!.members.slice(4)
    expect(rails.length).toBe(garage!.panels.length - 1)
    for (const rail of rails) {
      expect(rail.y1 - rail.y0).toBeCloseTo(FRAME_SECTION, 5)
      expect(rail.u0).toBeCloseTo(garage!.inner.u0, 5)
    }
  })

  it('gives a portal no frame', () => {
    const portal = openingFrameLayout({ u: 0, v: 0, width: 0.9, height: 2.1, kind: 'portal' })
    expect(portal).not.toBeNull()
    expect(portal!.members).toEqual([])
    expect(portal!.glass).toEqual([])
    expect(portal!.panels).toEqual([])
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

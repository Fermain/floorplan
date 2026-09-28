import { describe, expect, it } from 'vitest'
import type { Floor, Wall } from '../model/types'
import {
  buildLintelGeometry,
  buildWallGeometries,
  collectLintelSpans,
  collectWallBlockSpans,
  geometryTriangleCount,
  wallSolidContains,
} from './walls'

function floorWithWall(wall: Wall, extraCorners: Floor['corners'] = []): Floor {
  const start = extraCorners.find((c) => c.id === wall.startCornerId)
  const end = extraCorners.find((c) => c.id === wall.endCornerId)
  const corners = [...extraCorners]
  if (!start) {
    corners.push({ id: wall.startCornerId, x: 0, z: 0 })
  }
  if (!end) {
    corners.push({ id: wall.endCornerId, x: 4, z: 0 })
  }
  return {
    id: 'f0',
    index: 0,
    datumHeight: 0,
    corners,
    walls: [wall],
    roomFinishes: {},
  }
}

function straightWall(overrides: Partial<Wall> = {}): Wall {
  return {
    id: 'w1',
    startCornerId: 'a',
    endCornerId: 'b',
    skin: 'double',
    openings: [],
    ...overrides,
  }
}

describe('buildWallGeometries', () => {
  it('returns no geometry for a logical wall', () => {
    const wall = straightWall({ skin: 'logical' })
    const floor = floorWithWall(wall)
    expect(buildWallGeometries(floor, wall)).toEqual([])
    expect(collectWallBlockSpans(floor, wall)).toEqual([])
  })

  it('clips an opening out of a double-skin wall', () => {
    const wall = straightWall({
      skin: 'double',
      openings: [
        {
          id: 'o1',
          u: 1.5,
          v: 0.9,
          width: 0.9,
          height: 1.2,
          kind: 'window',
          aligned: true,
        },
      ],
    })
    const floor = floorWithWall(wall)
    const holeU = 1.95
    const holeY = 1.5
    expect(wallSolidContains(floor, wall, holeU, holeY, 0)).toBe(false)
    expect(wallSolidContains(floor, wall, 0.2, 0.1, 0)).toBe(true)

    const withOpening = buildWallGeometries(floor, wall)
    const solid = buildWallGeometries(floor, straightWall({ skin: 'double' }))
    const triOpen = withOpening.reduce((n, g) => n + geometryTriangleCount(g), 0)
    const triSolid = solid.reduce((n, g) => n + geometryTriangleCount(g), 0)
    expect(triOpen).toBeLessThan(triSolid)
    for (const g of [...withOpening, ...solid]) {
      g.dispose()
    }
  })

  it('keeps partial blocks when an opening nicks the middle of one block', () => {
    const wall = straightWall({
      skin: 'single',
      openings: [
        {
          id: 'o1',
          u: 0.17,
          v: 0,
          width: 0.1,
          height: 0.215,
          kind: 'window',
          aligned: false,
        },
      ],
    })
    const floor = floorWithWall(wall, [
      { id: 'a', x: 0, z: 0 },
      { id: 'b', x: 2, z: 0 },
    ])
    const course0 = collectWallBlockSpans(floor, wall).filter(
      (s) => s.course === 0 && s.leaf === 0 && s.u1 <= 0.44 + 1e-6,
    )
    expect(course0).toHaveLength(2)
    const sorted = [...course0].sort((a, b) => a.u0 - b.u0)
    expect(sorted[0].u0).toBeCloseTo(0, 6)
    expect(sorted[0].u1).toBeCloseTo(0.17, 6)
    expect(sorted[1].u0).toBeCloseTo(0.27, 6)
    expect(sorted[1].u1).toBeCloseTo(0.44, 6)
  })

  it('places the lowest course on bottomSamples', () => {
    const wall = straightWall({ skin: 'single' })
    const floor = floorWithWall(wall, [
      { id: 'a', x: 0, z: 0 },
      { id: 'b', x: 4, z: 0 },
    ])
    const samples = [
      { u: 0, y: -0.5 },
      { u: 4, y: -0.5 },
    ]
    const geoms = buildWallGeometries(floor, wall, samples)
    let minY = Infinity
    for (const g of geoms) {
      const pos = g.getAttribute('position')
      for (let i = 0; i < pos.count; i++) {
        minY = Math.min(minY, pos.getY(i))
      }
      g.dispose()
    }
    expect(minY).toBeCloseTo(-0.5, 5)
    const course0 = collectWallBlockSpans(floor, wall, samples).filter((s) => s.course === 0)
    const course1 = collectWallBlockSpans(floor, wall, samples).filter((s) => s.course === 1)
    expect(course0.every((s) => Math.abs(s.y1 - 0.215) < 1e-6)).toBe(true)
    expect(course1.every((s) => Math.abs(s.y0 - 0.215) < 1e-6)).toBe(true)
  })

  it('miters a right-angle corner so the outer leaf extends and the inner leaf shortens', () => {
    const along: Wall = {
      id: 'along',
      startCornerId: 'c',
      endCornerId: 'e',
      skin: 'double',
      openings: [],
    }
    const up: Wall = {
      id: 'up',
      startCornerId: 'c',
      endCornerId: 'n',
      skin: 'double',
      openings: [],
    }
    const floor: Floor = {
      id: 'f0',
      index: 0,
      datumHeight: 0,
      corners: [
        { id: 'c', x: 0, z: 0 },
        { id: 'e', x: 4, z: 0 },
        { id: 'n', x: 0, z: 4 },
      ],
      walls: [along, up],
      roomFinishes: {},
    }
    const outer = collectWallBlockSpans(floor, along)
      .filter((s) => s.leaf === 0 && s.course === 0)
      .sort((a, b) => a.u0 - b.u0)
    const inner = collectWallBlockSpans(floor, along)
      .filter((s) => s.leaf === 1 && s.course === 0)
      .sort((a, b) => a.u0 - b.u0)
    expect(outer[0].u0).toBeCloseTo(-0.075, 3)
    expect(inner[0].u0).toBeCloseTo(0.075, 3)
  })

  it('miters an end-to-start corner so the outer leaf extends and the inner leaf shortens', () => {
    const south: Wall = {
      id: 'south',
      startCornerId: 'sw',
      endCornerId: 'se',
      skin: 'double',
      openings: [],
    }
    const east: Wall = {
      id: 'east',
      startCornerId: 'se',
      endCornerId: 'ne',
      skin: 'double',
      openings: [],
    }
    const floor: Floor = {
      id: 'f0',
      index: 0,
      datumHeight: 0,
      corners: [
        { id: 'sw', x: 0, z: 0 },
        { id: 'se', x: 4, z: 0 },
        { id: 'ne', x: 4, z: 4 },
      ],
      walls: [south, east],
      roomFinishes: {},
    }
    const endU = (leaf: number) =>
      Math.max(
        ...collectWallBlockSpans(floor, south)
          .filter((s) => s.leaf === leaf && s.course === 0)
          .map((s) => s.u1),
      )
    expect(endU(0)).toBeCloseTo(4.075, 3)
    expect(endU(1)).toBeCloseTo(3.925, 3)
  })
})

describe('lintels', () => {
  const windowOpening = {
    id: 'o1',
    u: 1.5,
    v: 0.9,
    width: 0.9,
    height: 1.2,
    kind: 'window' as const,
    aligned: true,
  }

  it('bears one course past the opening on each leaf', () => {
    const wall = straightWall({ openings: [windowOpening] })
    const floor = floorWithWall(wall)
    const spans = collectLintelSpans(floor, wall)
    expect(spans).toHaveLength(2)
    for (const span of spans) {
      expect(span.u0).toBeCloseTo(1.35, 5)
      expect(span.u1).toBeCloseTo(2.55, 5)
      expect(span.y0).toBeCloseTo(2.1, 5)
      expect(span.y1).toBeCloseTo(2.315, 5)
    }
    expect(wallSolidContains(floor, wall, 1.95, 2.2, 0)).toBe(false)
    expect(wallSolidContains(floor, wall, 1.4, 2.2, 0)).toBe(false)
    expect(wallSolidContains(floor, wall, 1.4, 1.5, 0)).toBe(true)
    expect(wallSolidContains(floor, wall, 1.95, 2.34, 0)).toBe(true)
    const lintel = buildLintelGeometry(floor, wall)
    expect(lintel).not.toBeNull()
    expect(geometryTriangleCount(lintel!)).toBeGreaterThan(0)
    lintel?.dispose()
  })

  it('stops the bearing at the middle of a tight gap', () => {
    const wall = straightWall({
      openings: [
        windowOpening,
        { ...windowOpening, id: 'o2', u: 2.5 },
      ],
    })
    const floor = floorWithWall(wall)
    const first = collectLintelSpans(floor, wall).find((span) => span.leaf === 0 && span.u0 < 2)
    const second = collectLintelSpans(floor, wall).find((span) => span.leaf === 0 && span.u0 >= 2)
    expect(first?.u1).toBeCloseTo(2.45, 5)
    expect(second?.u0).toBeCloseTo(2.45, 5)
  })

  it('omits a lintel when the opening reaches the wall head', () => {
    const wall = straightWall({
      openings: [{ ...windowOpening, v: 2.2, height: 0.2 }],
    })
    const floor = floorWithWall(wall)
    expect(collectLintelSpans(floor, wall)).toEqual([])
    expect(buildLintelGeometry(floor, wall)).toBeNull()
  })
})

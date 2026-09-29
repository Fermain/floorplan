import { describe, expect, it } from 'vitest'
import type { Floor, Wall } from '../model/types'
import {
  BLOCK_HEIGHT,
  BLOCK_LENGTH,
  BLOCK_THICKNESS,
  CAVITY,
  DEFAULT_STOREY_HEIGHT,
  FLOOR_TO_FLOOR,
} from '../plot/fixture'
import {
  buildCourseFaceGeometries,
  buildLintelGeometry,
  buildWallGeometries,
  collectLintelSpans,
  collectWallBlockSpans,
  geometryTriangleCount,
  wallSolidContains,
} from './walls'

const OUTER_FACE = CAVITY / 2 + BLOCK_THICKNESS
const LEAF_BUTT = CAVITY / 2

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

describe('buildCourseFaceGeometries', () => {
  it('leaves a mortar joint between courses on each outer face', () => {
    const wall = straightWall()
    const floor = floorWithWall(wall)
    const faces = buildCourseFaceGeometries(floor, wall)
    expect(faces).toHaveLength(2)
    const positions = faces[0].getAttribute('position')
    const ys: number[] = []
    for (let i = 0; i < positions.count; i++) ys.push(positions.getY(i))
    expect(ys.some((y) => Math.abs(y - BLOCK_HEIGHT) < 0.004)).toBe(false)
    expect(ys.some((y) => y > 0.004 && y < BLOCK_HEIGHT - 0.004)).toBe(true)
  })

  it('returns nothing for a logical wall', () => {
    const wall = straightWall({ skin: 'logical' })
    expect(buildCourseFaceGeometries(floorWithWall(wall), wall)).toEqual([])
  })
})

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
          u: 0.08,
          v: 0,
          width: 0.05,
          height: BLOCK_HEIGHT,
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
      (s) => s.course === 0 && s.leaf === 0 && s.u1 <= BLOCK_LENGTH + 1e-6,
    )
    expect(course0).toHaveLength(2)
    const sorted = [...course0].sort((a, b) => a.u0 - b.u0)
    expect(sorted[0].u0).toBeCloseTo(0, 6)
    expect(sorted[0].u1).toBeCloseTo(0.08, 6)
    expect(sorted[1].u0).toBeCloseTo(0.13, 6)
    expect(sorted[1].u1).toBeCloseTo(BLOCK_LENGTH, 6)
  })

  it('half-laps odd courses by half a block length', () => {
    const wall = straightWall({ skin: 'single' })
    const floor = floorWithWall(wall, [
      { id: 'a', x: 0, z: 0 },
      { id: 'b', x: 2, z: 0 },
    ])
    const course0 = collectWallBlockSpans(floor, wall)
      .filter((s) => s.course === 0 && s.leaf === 0)
      .sort((a, b) => a.u0 - b.u0)
    const course1 = collectWallBlockSpans(floor, wall)
      .filter((s) => s.course === 1 && s.leaf === 0)
      .sort((a, b) => a.u0 - b.u0)
    expect(course0[0].u0).toBeCloseTo(0, 6)
    expect(course0[0].u1).toBeCloseTo(BLOCK_LENGTH, 6)
    expect(course1[0].u0).toBeCloseTo(0, 6)
    expect(course1[0].u1).toBeCloseTo(BLOCK_LENGTH / 2, 6)
    expect(course1[1].u0).toBeCloseTo(BLOCK_LENGTH / 2, 6)
    expect(course1[1].u1).toBeCloseTo(BLOCK_LENGTH / 2 + BLOCK_LENGTH, 6)
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
    expect(course0.every((s) => Math.abs(s.y1 - BLOCK_HEIGHT) < 1e-6)).toBe(true)
    expect(course1.every((s) => Math.abs(s.y0 - BLOCK_HEIGHT) < 1e-6)).toBe(true)
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
    const endAt = (wall: Wall, leaf: number, course: number) =>
      Math.min(
        ...collectWallBlockSpans(floor, wall)
          .filter((s) => s.leaf === leaf && s.course === course)
          .map((s) => s.u0),
      )
    expect(endAt(along, 0, 0)).toBeCloseTo(-OUTER_FACE, 3)
    expect(endAt(along, 1, 0)).toBeCloseTo(OUTER_FACE, 3)
    expect(endAt(along, 0, 1)).toBeCloseTo(-LEAF_BUTT, 3)
    expect(endAt(along, 1, 1)).toBeCloseTo(LEAF_BUTT, 3)
    const y = BLOCK_HEIGHT / 2
    expect(wallSolidContains(floor, along, -0.1, y, 0)).toBe(true)
    expect(wallSolidContains(floor, up, -0.1, y, 1)).toBe(false)
    expect(wallSolidContains(floor, up, -0.1, y + BLOCK_HEIGHT, 1)).toBe(true)
    expect(wallSolidContains(floor, along, -0.15, y, 0)).toBe(false)
    expect(wallSolidContains(floor, up, -0.15, y + BLOCK_HEIGHT, 1)).toBe(false)
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
    const endU = (leaf: number, course: number) =>
      Math.max(
        ...collectWallBlockSpans(floor, south)
          .filter((s) => s.leaf === leaf && s.course === course)
          .map((s) => s.u1),
      )
    expect(endU(0, 0)).toBeCloseTo(4 + LEAF_BUTT, 3)
    expect(endU(1, 0)).toBeCloseTo(4 - LEAF_BUTT, 3)
    expect(endU(0, 1)).toBeCloseTo(4 + OUTER_FACE, 3)
    expect(endU(1, 1)).toBeCloseTo(4 - OUTER_FACE, 3)
  })

  it('carries the outer leaf up to the next storey and leaves the inner leaf at the wall head', () => {
    const floor: Floor = {
      id: 'f',
      index: 0,
      datumHeight: 0,
      corners: [
        { id: 'a', x: 0, z: 0 },
        { id: 'b', x: 8, z: 0 },
        { id: 'c', x: 8, z: 6 },
        { id: 'd', x: 0, z: 6 },
      ],
      walls: [
        { id: 's', startCornerId: 'a', endCornerId: 'b', skin: 'double', openings: [] },
        { id: 'e', startCornerId: 'b', endCornerId: 'c', skin: 'double', openings: [] },
        { id: 'n', startCornerId: 'c', endCornerId: 'd', skin: 'double', openings: [] },
        { id: 'w', startCornerId: 'd', endCornerId: 'a', skin: 'double', openings: [] },
      ],
      roomFinishes: {},
    }
    const south = floor.walls[0]
    const wallHead = Math.floor(DEFAULT_STOREY_HEIGHT / BLOCK_HEIGHT) * BLOCK_HEIGHT
    const spans = collectWallBlockSpans(floor, south, undefined, FLOOR_TO_FLOOR)
    const maxY = (leaf: number) => Math.max(...spans.filter((span) => span.leaf === leaf).map((span) => span.y1))
    expect(maxY(0)).toBeCloseTo(FLOOR_TO_FLOOR, 3)
    expect(maxY(1)).toBeCloseTo(wallHead, 3)
    const carried = spans.filter((span) => span.leaf === 0 && span.y0 >= wallHead - 1e-6)
    expect(carried.length).toBeGreaterThan(0)
    for (const span of carried) expect(span.y1 - span.y0).toBeCloseTo(BLOCK_HEIGHT, 6)
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

  it('places one cavity lintel bearing past the opening', () => {
    const wall = straightWall({ openings: [windowOpening] })
    const floor = floorWithWall(wall)
    const spans = collectLintelSpans(floor, wall)
    expect(spans).toHaveLength(1)
    expect(spans[0].u0).toBeCloseTo(1.276, 3)
    expect(spans[0].u1).toBeCloseTo(2.552, 3)
    expect(spans[0].y0).toBeCloseTo(2.1, 5)
    expect(spans[0].y1).toBeCloseTo(2.1 + BLOCK_HEIGHT, 5)
    expect(wallSolidContains(floor, wall, 1.95, 2.14, 0)).toBe(false)
    expect(wallSolidContains(floor, wall, 1.95, 2.14, 1)).toBe(false)
    expect(wallSolidContains(floor, wall, 1.4, 2.14, 0)).toBe(false)
    expect(wallSolidContains(floor, wall, 1.4, 1.5, 0)).toBe(true)
    expect(wallSolidContains(floor, wall, 1.95, 2.2, 0)).toBe(true)
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
    const first = collectLintelSpans(floor, wall).find((span) => span.u0 < 2)
    const second = collectLintelSpans(floor, wall).find((span) => span.u0 >= 2)
    expect(first?.u1).toBeCloseTo(2.45, 5)
    expect(second?.u0).toBeCloseTo(2.45, 5)
  })

  it('omits a lintel when the opening reaches the wall head', () => {
    const wall = straightWall({
      openings: [{ ...windowOpening, v: 2.4, height: 0.2 }],
    })
    const floor = floorWithWall(wall)
    expect(collectLintelSpans(floor, wall)).toEqual([])
    expect(buildLintelGeometry(floor, wall)).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'
import type { Document, Floor, Heightfield, Wall } from '../model/types'
import {
  averageGrade,
  connectedCornerIds,
  groundPad,
  levelField,
  pointInRing,
  SURFACE_BED_THICKNESS_M,
  SURFACE_BED_TOP_ABOVE_DATUM_M,
  wallDatum,
} from './pad'

function linearField(): Heightfield {
  const cols = 9
  const rows = 5
  const heights: number[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) heights.push(c)
  }
  return { originX: 0, originZ: 0, cellSize: 1, cols, rows, heights }
}

function rectFloor(x0: number, z0: number, x1: number, z1: number, id = 'f0'): Floor {
  const corners = [
    { id: `${id}-a`, x: x0, z: z0 },
    { id: `${id}-b`, x: x1, z: z0 },
    { id: `${id}-c`, x: x1, z: z1 },
    { id: `${id}-d`, x: x0, z: z1 },
  ]
  const walls: Wall[] = [
    ['a', 'b'],
    ['b', 'c'],
    ['c', 'd'],
    ['d', 'a'],
  ].map(([from, to]) => ({
    id: `${id}-${from}${to}`,
    startCornerId: `${id}-${from}`,
    endCornerId: `${id}-${to}`,
    skin: 'single',
    openings: [],
  }))
  return { id, index: 0, datumHeight: 0, corners, walls, roomFinishes: {} }
}

function joinedRects(connected: boolean): Floor {
  const low = rectFloor(0, 0, 2, 2, 'a')
  const high = rectFloor(4, 0, 6, 2, 'b')
  const walls = [...low.walls, ...high.walls]
  if (connected) {
    walls.push({
      id: 'link',
      startCornerId: 'a-b',
      endCornerId: 'b-a',
      skin: 'single',
      openings: [],
    })
  }
  return {
    id: 'f0',
    index: 0,
    datumHeight: 0,
    corners: [...low.corners, ...high.corners],
    walls,
    roomFinishes: {},
  }
}

function docWith(floors: Floor[], field = linearField()): Document {
  return {
    plot: { ring: [], northBearingDeg: 0, latitude: 0, longitude: 0 },
    heightfield: field,
    building: { floors },
  }
}

describe('ground pad', () => {
  const ring = [
    { x: 2, z: 1 },
    { x: 6, z: 1 },
    { x: 6, z: 3 },
    { x: 2, z: 3 },
  ]

  it('counts the boundary as inside the footprint', () => {
    expect(pointInRing(ring, 4, 2)).toBe(true)
    expect(pointInRing(ring, 2, 1)).toBe(true)
    expect(pointInRing(ring, 0, 0)).toBe(false)
  })

  it('averages a linear grade at the centroid of one footprint', () => {
    expect(averageGrade(linearField(), [ring])).toBeCloseTo(4, 5)
  })

  it('averages the whole structure, not each room', () => {
    const low = [
      { x: 0, z: 0 },
      { x: 2, z: 0 },
      { x: 2, z: 2 },
      { x: 0, z: 2 },
    ]
    const high = [
      { x: 4, z: 0 },
      { x: 6, z: 0 },
      { x: 6, z: 2 },
      { x: 4, z: 2 },
    ]
    expect(averageGrade(linearField(), [low, high])).toBeCloseTo(3, 5)
  })

  it('levels the ground floor from the enclosed rooms and leaves the slope outside', () => {
    const pad = groundPad(docWith([rectFloor(2, 1, 6, 3)]))
    expect(pad).not.toBeNull()
    if (!pad) return
    expect(pad.structures).toHaveLength(1)
    expect(pad.structures[0].datum).toBeCloseTo(4, 5)
    const leveled = levelField(linearField(), pad.structures)
    expect(leveled.heights[2 * 9 + 4]).toBeCloseTo(4, 5)
    expect(leveled.heights[2 * 9 + 1]).toBeCloseTo(4, 5)
    expect(leveled.heights[1]).toBeCloseTo(4, 5)
    expect(leveled.heights[0]).toBe(0)
  })

  it('levels each unconnected structure on its own grade', () => {
    const floor = joinedRects(false)
    const pad = groundPad(docWith([floor]))
    expect(pad).not.toBeNull()
    if (!pad) return
    expect(pad.structures).toHaveLength(2)
    const datums = pad.structures.map((structure) => structure.datum).sort((a, b) => a - b)
    expect(datums[0]).toBeCloseTo(1, 5)
    expect(datums[1]).toBeCloseTo(5, 5)
    const leveled = levelField(linearField(), pad.structures)
    expect(leveled.heights[1 * 9 + 1]).toBeCloseTo(1, 5)
    expect(leveled.heights[1 * 9 + 5]).toBeCloseTo(5, 5)
    const low = floor.walls.find((wall) => wall.id === 'a-ab')
    const high = floor.walls.find((wall) => wall.id === 'b-ab')
    expect(low && wallDatum(floor, low, pad)).toBeCloseTo(1, 5)
    expect(high && wallDatum(floor, high, pad)).toBeCloseTo(5, 5)
  })

  it('keeps an unconnected building out of the other building’s nodes', () => {
    const floor = joinedRects(false)
    const low = connectedCornerIds(floor, 'a-a')
    expect(low).toEqual(expect.arrayContaining(['a-a', 'a-b', 'a-c', 'a-d']))
    expect(low).toHaveLength(4)
    const joined = connectedCornerIds(joinedRects(true), 'a-a')
    expect(joined).toHaveLength(8)
  })

  it('keeps rooms joined by a wall on one grade', () => {
    const floor = joinedRects(true)
    const pad = groundPad(docWith([floor]))
    expect(pad?.structures).toHaveLength(1)
    expect(pad?.structures[0].datum).toBeCloseTo(3, 5)
    const link = floor.walls.find((wall) => wall.id === 'link')
    expect(link && wallDatum(floor, link, pad)).toBeCloseTo(3, 5)
  })

  it('lifts an upper floor to the structure it stands on', () => {
    const ground = rectFloor(0, 0, 2, 2, 'a')
    const pad = groundPad(docWith([ground]))
    const upper: Floor = {
      id: 'f1',
      index: 1,
      datumHeight: 2.8,
      corners: [
        { id: 'u0', x: 0.2, z: 0.2 },
        { id: 'u1', x: 1.8, z: 0.2 },
      ],
      walls: [
        {
          id: 'uw',
          startCornerId: 'u0',
          endCornerId: 'u1',
          skin: 'single',
          openings: [],
        },
      ],
      roomFinishes: {},
    }
    expect(wallDatum(upper, upper.walls[0], pad)).toBeCloseTo(1, 5)
  })

  it('has no pad until the walls enclose a room', () => {
    const open = rectFloor(2, 1, 6, 3)
    open.walls = open.walls.slice(0, 3)
    expect(groundPad(docWith([open]))).toBeNull()
  })

  it('fills the surface bed from the structure datum up to 150 mm', () => {
    expect(SURFACE_BED_TOP_ABOVE_DATUM_M).toBeCloseTo(0.15, 5)
    expect(SURFACE_BED_THICKNESS_M).toBeCloseTo(SURFACE_BED_TOP_ABOVE_DATUM_M, 5)
    const pad = groundPad(docWith([rectFloor(2, 1, 6, 3)]))
    expect(pad).not.toBeNull()
    if (!pad) return
    const datum = pad.structures[0].datum
    expect(datum + SURFACE_BED_TOP_ABOVE_DATUM_M).toBeCloseTo(datum + 0.15, 5)
    expect(datum + SURFACE_BED_TOP_ABOVE_DATUM_M - SURFACE_BED_THICKNESS_M).toBeCloseTo(datum, 5)
  })
})

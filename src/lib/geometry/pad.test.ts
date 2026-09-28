import { describe, expect, it } from 'vitest'
import type { Document, Floor, Heightfield, Wall } from '../model/types'
import { averageGrade, groundPad, levelField, pointInRing } from './pad'

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
    expect(pad.datum).toBeCloseTo(4, 5)
    const leveled = levelField(linearField(), pad.rings, pad.datum)
    expect(leveled.heights[2 * 9 + 4]).toBeCloseTo(4, 5)
    expect(leveled.heights[0]).toBe(0)
  })

  it('has no pad until the walls enclose a room', () => {
    const open = rectFloor(2, 1, 6, 3)
    open.walls = open.walls.slice(0, 3)
    expect(groundPad(docWith([open]))).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'
import { BLOCK_THICKNESS, CAVITY } from '../plot/fixture'
import { pointInRing } from './pad'
import { deckPolygons, deckThickness } from './deck'
import type { Floor } from '../model/types'

const CAVITY_FACE_M = CAVITY / 2
const OUTER_FACE_M = CAVITY / 2 + BLOCK_THICKNESS

function floor(partial: Partial<Floor> & Pick<Floor, 'corners' | 'walls'>): Floor {
  return {
    id: 'floor',
    index: 1,
    datumHeight: 2.8,
    roomFinishes: {},
    ...partial,
  }
}

function covers(polygons: ReturnType<typeof deckPolygons>, x: number, z: number): boolean {
  return polygons.some(
    (polygon) => pointInRing(polygon.outer, x, z) && !polygon.holes.some((hole) => pointInRing(hole, x, z)),
  )
}

describe('deckPolygons', () => {
  const plate = [
    { x: 4, z: 4 },
    { x: 10, z: 4 },
    { x: 10, z: 10 },
    { x: 4, z: 10 },
  ]

  it('caps deck thickness at 0.255 and otherwise fills the floor zone', () => {
    const thickness = deckThickness()
    expect(thickness).toBeLessThanOrEqual(0.255)
    expect(thickness).toBeGreaterThan(0)
  })

  it('keeps an empty plate inside the cavity face, not over the outer brick', () => {
    const polygons = deckPolygons(floor({ corners: [], walls: [], outline: [plate] }))
    expect(covers(polygons, 7, 7)).toBe(true)
    expect(covers(polygons, 4 + CAVITY_FACE_M + 0.01, 7)).toBe(true)
    expect(covers(polygons, 4 - 0.01, 7)).toBe(false)
    expect(covers(polygons, 4 - OUTER_FACE_M + 0.01, 7)).toBe(false)
    expect(covers(polygons, 2, 2)).toBe(false)
  })

  it('keeps the plate and extends an inner-leaf strip where a wall runs past it', () => {
    const polygons = deckPolygons(
      floor({
        outline: [plate],
        corners: [
          { id: 'a', x: 4, z: 7 },
          { id: 'b', x: 14, z: 7 },
        ],
        walls: [{ id: 'w', startCornerId: 'a', endCornerId: 'b', skin: 'double', openings: [] }],
      }),
    )
    expect(covers(polygons, 7, 7)).toBe(true)
    expect(covers(polygons, 7, 5)).toBe(true)
    expect(covers(polygons, 12, 7)).toBe(true)
    expect(covers(polygons, 12, 7 + BLOCK_THICKNESS / 2 + 0.02)).toBe(false)
    expect(covers(polygons, 12, 7 + OUTER_FACE_M - 0.01)).toBe(false)
    expect(covers(polygons, 14 + BLOCK_THICKNESS / 2 + 0.05, 7)).toBe(false)
  })

  it('fills a closed room to the cavity face and leaves the outer face bare', () => {
    const corners = [
      { id: 'a', x: 4, z: 4 },
      { id: 'b', x: 10, z: 4 },
      { id: 'c', x: 10, z: 10 },
      { id: 'd', x: 4, z: 10 },
    ]
    const walls = [
      { id: 'ab', startCornerId: 'a', endCornerId: 'b', skin: 'double' as const, openings: [] },
      { id: 'bc', startCornerId: 'b', endCornerId: 'c', skin: 'double' as const, openings: [] },
      { id: 'cd', startCornerId: 'c', endCornerId: 'd', skin: 'double' as const, openings: [] },
      { id: 'da', startCornerId: 'd', endCornerId: 'a', skin: 'double' as const, openings: [] },
    ]
    const polygons = deckPolygons(floor({ corners, walls, outline: [plate] }))
    expect(covers(polygons, 7, 7)).toBe(true)
    expect(covers(polygons, 4 + CAVITY_FACE_M + 0.01, 7)).toBe(true)
    expect(covers(polygons, 4 - OUTER_FACE_M + 0.01, 7)).toBe(false)
    expect(covers(polygons, 4 - 0.01, 7)).toBe(false)
  })
})

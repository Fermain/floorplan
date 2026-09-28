import { describe, expect, it } from 'vitest'
import { pointInRing } from './pad'
import { deckPolygons } from './deck'
import type { Floor } from '../model/types'

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

  it('spreads an empty plate out to the outer brick', () => {
    const polygons = deckPolygons(floor({ corners: [], walls: [], outline: [plate] }))
    expect(covers(polygons, 7, 7)).toBe(true)
    expect(covers(polygons, 3.9, 7)).toBe(true)
    expect(covers(polygons, 3.8, 7)).toBe(false)
    expect(covers(polygons, 2, 2)).toBe(false)
  })

  it('follows a wall past the plate and leaves the open plate bare', () => {
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
    expect(covers(polygons, 12, 7)).toBe(true)
    expect(covers(polygons, 7, 7.2)).toBe(false)
    expect(covers(polygons, 7, 5)).toBe(false)
    expect(covers(polygons, 14.2, 7)).toBe(false)
  })

  it('fills a closed room out to the outer face', () => {
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
    expect(covers(polygons, 3.9, 7)).toBe(true)
    expect(covers(polygons, 3.8, 7)).toBe(false)
  })
})

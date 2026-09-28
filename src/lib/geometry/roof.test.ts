import { describe, expect, it } from 'vitest'
import { BLOCK_THICKNESS, CAVITY } from '../plot/fixture'
import type { Floor, Wall } from '../model/types'
import {
  footprintCovers,
  ROOF_EAVES_M,
  ROOF_PITCH_DEG,
  roofFootprintsForFloor,
} from './roof'

const OUTER_FACE_M = CAVITY / 2 + BLOCK_THICKNESS
const EAVES_OFFSET_M = OUTER_FACE_M + ROOF_EAVES_M

function rectFloor(x0: number, z0: number, x1: number, z1: number): Floor {
  const corners = [
    { id: 'a', x: x0, z: z0 },
    { id: 'b', x: x1, z: z0 },
    { id: 'c', x: x1, z: z1 },
    { id: 'd', x: x0, z: z1 },
  ]
  const walls: Wall[] = [
    { id: 'ab', startCornerId: 'a', endCornerId: 'b', skin: 'double', openings: [] },
    { id: 'bc', startCornerId: 'b', endCornerId: 'c', skin: 'double', openings: [] },
    { id: 'cd', startCornerId: 'c', endCornerId: 'd', skin: 'double', openings: [] },
    { id: 'da', startCornerId: 'd', endCornerId: 'a', skin: 'double', openings: [] },
  ]
  return { id: 'f0', index: 0, datumHeight: 0, corners, walls, roomFinishes: {} }
}

describe('roof footprints', () => {
  it('uses a 30 degree pitch and 0.3 m eaves past the outer face', () => {
    expect(ROOF_PITCH_DEG).toBe(30)
    expect(ROOF_EAVES_M).toBeCloseTo(0.3, 5)
  })

  it('covers a rectangular room and not a point well outside the eaves', () => {
    const floor = rectFloor(4, 4, 10, 10)
    const footprints = roofFootprintsForFloor(floor)
    expect(footprintCovers(footprints, 7, 7)).toBe(true)
    expect(footprintCovers(footprints, 4 - EAVES_OFFSET_M + 0.05, 7)).toBe(true)
    expect(footprintCovers(footprints, 4 - EAVES_OFFSET_M - 0.5, 7)).toBe(false)
    expect(footprintCovers(footprints, 0, 0)).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import type { Floor, Wall } from '../model/types'
import { openingNearFreeWallEnd, wallNeedsMovementJoint } from './limits'

function floorWithWall(wall: Wall, len: number): Floor {
  return {
    id: 'f0',
    index: 0,
    datumHeight: 0,
    corners: [
      { id: 'a', x: 0, z: 0 },
      { id: 'b', x: len, z: 0 },
    ],
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

describe('openingNearFreeWallEnd', () => {
  it('flags an opening 0.12 m from the start', () => {
    const wall = straightWall({
      openings: [
        {
          id: 'o1',
          u: 0.12,
          v: 0.9,
          width: 0.9,
          height: 1.2,
          kind: 'window',
          aligned: true,
        },
      ],
    })
    expect(openingNearFreeWallEnd(4, wall.openings)).toBe(true)
  })

  it('passes when an opening is 0.20 m from both ends', () => {
    const wall = straightWall({
      openings: [
        {
          id: 'o1',
          u: 0.2,
          v: 0.9,
          width: 0.9,
          height: 1.2,
          kind: 'window',
          aligned: true,
        },
      ],
    })
    expect(openingNearFreeWallEnd(2.1, wall.openings)).toBe(false)
  })
})

describe('wallNeedsMovementJoint', () => {
  it('flags an 8.1 m solid wall', () => {
    const wall = straightWall({ skin: 'double' })
    const floor = floorWithWall(wall, 8.1)
    expect(wallNeedsMovementJoint(floor, wall)).toBe(true)
  })

  it('passes a 7 m solid wall', () => {
    const wall = straightWall({ skin: 'double' })
    const floor = floorWithWall(wall, 7)
    expect(wallNeedsMovementJoint(floor, wall)).toBe(false)
  })

  it('passes a 10 m logical wall', () => {
    const wall = straightWall({ skin: 'logical' })
    const floor = floorWithWall(wall, 10)
    expect(wallNeedsMovementJoint(floor, wall)).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import type { Floor, Wall } from '../../lib/model/types'
import { worldHitToUv } from './elevation'
import { computeWallElevationFrame, flipFrame } from './wallFrame'

describe('flipped wall frame', () => {
  it('sees the same wall from the other face, measured from the other end', () => {
    const floor = {
      id: 'f',
      index: 0,
      datumHeight: 0,
      corners: [
        { id: 'a', x: 2, z: 1 },
        { id: 'b', x: 8, z: 1 },
      ],
      walls: [],
      roomFinishes: {},
    } as Floor
    const wall = { id: 'w', startCornerId: 'a', endCornerId: 'b', skin: 'double', openings: [] } as Wall
    const frame = computeWallElevationFrame(floor, wall)
    const flipped = flipFrame(frame)
    expect(flipped.axisZ.dot(frame.axisZ)).toBeCloseTo(-1)
    const point = new Vector3(3.5, 1.2, 1)
    const front = worldHitToUv(point, frame)
    const back = worldHitToUv(point, flipped)
    expect(back.u).toBeCloseTo(frame.length - front.u)
    expect(back.v).toBeCloseTo(front.v)
  })
})

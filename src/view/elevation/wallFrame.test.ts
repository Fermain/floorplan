import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import type { Floor, Wall } from '../../lib/model/types'
import { worldHitToUv } from './elevation'
import { computeWallElevationFrame, flipFrame, viewFrameFor, viewReversed } from './wallFrame'

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

describe('the frame a face is seen in', () => {
  it('puts the wall the right way round: seen from outside its face, not as a mirror image', () => {
    // A wall running north along x = 0. Its +1 face looks west, so a viewer standing west of it, facing east,
    // has north on their left: the view reads from the wall's far (north) end on the left to its start.
    const floor = { id: 'f', index: 0, datumHeight: 0, corners: [{ id: 'a', x: 0, z: 0 }, { id: 'b', x: 0, z: 4 }], walls: [], roomFinishes: {} }
    const wall = { id: 'w', startCornerId: 'a', endCornerId: 'b', skin: 'double' as const, openings: [] }
    const frame = computeWallElevationFrame(floor, wall)
    expect(frame.axisZ.x).toBeCloseTo(-1)
    for (const side of [1, -1] as const) {
      const view = viewFrameFor(frame, side)
      // In the drawn world z is turned over, so north is -z. Screen right is up × towards-the-viewer.
      const right = view.axisY.clone().cross(view.axisZ)
      expect(right.distanceTo(view.axisX)).toBeCloseTo(0)
      // The viewer stands on the face's side of the wall.
      expect(Math.sign(view.axisZ.x)).toBe(side === 1 ? -1 : 1)
      // West of the wall looking east, the left of the view is the north end; from the east, the south end.
      expect(view.origin.z).toBeCloseTo(side === 1 ? -4 : 0)
      expect(viewReversed(side)).toBe(side === 1)
    }
  })
})

import { wallLength } from '../model/geom'
import type { Floor, Opening, Wall } from '../model/types'
import { OPENING_EDGE_PAD } from '../plot/fixture'

export const MIN_SOLID_MASONRY_AT_FREE_END_M = OPENING_EDGE_PAD
export const MOVEMENT_JOINT_WALL_LENGTH_M = 8

export function openingNearFreeWallEnd(length: number, openings: Opening[]): boolean {
  for (const opening of openings) {
    const toEnd = length - opening.u - opening.width
    if (opening.u < MIN_SOLID_MASONRY_AT_FREE_END_M || toEnd < MIN_SOLID_MASONRY_AT_FREE_END_M) {
      return true
    }
  }
  return false
}

export function wallNeedsMovementJoint(floor: Floor, wall: Wall): boolean {
  if (wall.skin === 'logical') return false
  const len = wallLength(floor.corners, wall.startCornerId, wall.endCornerId)
  return len > MOVEMENT_JOINT_WALL_LENGTH_M
}

export function storeyHasLongSolidWall(floors: Floor[]): boolean {
  for (const floor of floors) {
    for (const wall of floor.walls) {
      if (wallNeedsMovementJoint(floor, wall)) return true
    }
  }
  return false
}

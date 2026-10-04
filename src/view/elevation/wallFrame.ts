import { DEFAULT_STOREY_HEIGHT } from '../../lib/plot/fixture'
import type { Floor, Wall } from '../../lib/model/types'
import { Vector3 } from 'three'

export type WallElevationFrame = {
  origin: Vector3
  axisX: Vector3
  axisY: Vector3
  axisZ: Vector3
  length: number
  height: number
}

function cornerXZ(floor: Floor, id: string): { x: number; z: number } {
  const c = floor.corners.find((x) => x.id === id)
  if (!c) {
    throw new Error(`missing corner ${id}`)
  }
  return { x: c.x, z: c.z }
}

export function computeWallElevationFrame(
  floor: Floor,
  wall: Wall,
  storeyHeight = DEFAULT_STOREY_HEIGHT,
): WallElevationFrame {
  const start = cornerXZ(floor, wall.startCornerId)
  const end = cornerXZ(floor, wall.endCornerId)
  const dx = end.x - start.x
  const dz = end.z - start.z
  const length = Math.hypot(dx, dz)
  const axisY = new Vector3(0, 1, 0)
  let axisX: Vector3
  if (length < 1e-9) {
    axisX = new Vector3(1, 0, 0)
  } else {
    axisX = new Vector3(dx / length, 0, dz / length)
  }
  const axisZ = new Vector3().crossVectors(axisX, axisY).normalize()
  const origin = new Vector3(start.x, floor.datumHeight, start.z)
  return {
    origin,
    axisX,
    axisY,
    axisZ,
    length,
    height: storeyHeight,
  }
}

export function wallCenterWorld(frame: WallElevationFrame): Vector3 {
  return frame.origin
    .clone()
    .addScaledVector(frame.axisX, frame.length / 2)
    .addScaledVector(frame.axisY, frame.height / 2)
}

// The same wall seen from its other face: anchored at the far end and facing the other way.
export function flipFrame(frame: WallElevationFrame): WallElevationFrame {
  return {
    ...frame,
    origin: frame.origin.clone().addScaledVector(frame.axisX, frame.length),
    axisX: frame.axisX.clone().negate(),
    axisZ: frame.axisZ.clone().negate(),
  }
}

// The frame a face of the wall is seen in. Plan coordinates run x east and z north, which three.js, right-handed
// with y up, would draw as a mirror image; so the scene is drawn with z turned over and this frame is given in
// that world. Seen from outside its face, a wall runs the other way from the way it is drawn on plan seen from
// the far side: on the +1 face the view reads from the wall's far end back to its start, and on the -1 face from
// its start. In both, axisX points to the right of the view and axisZ at the viewer.
export function viewFrameFor(frame: WallElevationFrame, side: 1 | -1): WallElevationFrame {
  const turned = (v: Vector3) => new Vector3(v.x, v.y, -v.z)
  const origin = side === 1 ? frame.origin.clone().addScaledVector(frame.axisX, frame.length) : frame.origin.clone()
  const axisX = side === 1 ? frame.axisX.clone().negate() : frame.axisX.clone()
  const axisZ = side === 1 ? frame.axisZ.clone() : frame.axisZ.clone().negate()
  return { ...frame, origin: turned(origin), axisX: turned(axisX), axisZ: turned(axisZ) }
}

// Whether the view of a face reads from the wall's far end back to its start.
export function viewReversed(side: 1 | -1): boolean {
  return side === 1
}

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

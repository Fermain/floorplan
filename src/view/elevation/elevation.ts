import type { OrthographicCamera } from 'three'
import { Vector3 } from 'three'
import type { WallElevationFrame } from './wallFrame'

export function fitOrthoHalfExtents(
  aspect: number,
  wallLength: number,
  wallHeight: number,
): { halfW: number; halfH: number } {
  const wallAspect = wallLength / wallHeight
  if (aspect >= wallAspect) {
    const halfH = wallHeight / 2
    return { halfW: halfH * aspect, halfH }
  }
  const halfW = wallLength / 2
  return { halfW, halfH: halfW / aspect }
}

export const ELEVATION_MARGIN_U_M = 0.35
export const ELEVATION_MARGIN_V_M = 0.6

export function elevationWindow(
  aspect: number,
  frame: Pick<WallElevationFrame, 'length' | 'height'>,
): { centerU: number; centerV: number; halfW: number; halfH: number } {
  const { halfW, halfH } = fitOrthoHalfExtents(
    aspect,
    frame.length + 2 * ELEVATION_MARGIN_U_M,
    frame.height + 2 * ELEVATION_MARGIN_V_M,
  )
  return { centerU: frame.length / 2, centerV: frame.height / 2, halfW, halfH }
}

export function configureOrthoCamera(
  camera: OrthographicCamera,
  aspect: number,
  frame: WallElevationFrame,
): OrthographicCamera {
  const { origin, axisX, axisY, axisZ } = frame
  const { centerU, centerV, halfW, halfH } = elevationWindow(aspect, frame)
  const center = origin
    .clone()
    .addScaledVector(axisX, centerU)
    .addScaledVector(axisY, centerV)
  const camPos = center.clone().addScaledVector(axisZ, 10)
  camera.position.copy(camPos)
  camera.up.copy(axisY)
  camera.lookAt(center)
  camera.left = -halfW
  camera.right = halfW
  camera.bottom = -halfH
  camera.top = halfH
  camera.near = 0.1
  camera.far = 100
  camera.updateProjectionMatrix()
  camera.updateMatrixWorld()
  return camera
}

export function ndcFromPointer(
  offsetX: number,
  offsetY: number,
  width: number,
  height: number,
): { x: number; y: number } {
  return {
    x: (offsetX / width) * 2 - 1,
    y: -(offsetY / height) * 2 + 1,
  }
}

export function intersectWallPlane(
  camera: OrthographicCamera,
  ndcX: number,
  ndcY: number,
  frame: WallElevationFrame,
  target = new Vector3(),
): Vector3 | null {
  const near = new Vector3(ndcX, ndcY, -1)
  const far = new Vector3(ndcX, ndcY, 1)
  near.unproject(camera)
  far.unproject(camera)
  const dir = far.sub(near)
  const denom = dir.dot(frame.axisZ)
  if (Math.abs(denom) < 1e-9) {
    return null
  }
  const t = frame.origin.clone().sub(near).dot(frame.axisZ) / denom
  return target.copy(near).add(dir.multiplyScalar(t))
}

export function worldHitToUv(
  hit: Vector3,
  frame: WallElevationFrame,
): { u: number; v: number } {
  const delta = hit.clone().sub(frame.origin)
  return {
    u: delta.dot(frame.axisX),
    v: delta.dot(frame.axisY),
  }
}

export function pointerToWallUv(
  camera: OrthographicCamera,
  offsetX: number,
  offsetY: number,
  width: number,
  height: number,
  frame: WallElevationFrame,
): { u: number; v: number } | null {
  const ndc = ndcFromPointer(offsetX, offsetY, width, height)
  const hit = intersectWallPlane(camera, ndc.x, ndc.y, frame)
  if (!hit) {
    return null
  }
  return worldHitToUv(hit, frame)
}

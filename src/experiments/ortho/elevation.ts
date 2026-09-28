import { OrthographicCamera, Vector3 } from 'three'

export const WALL_LENGTH = 4
export const WALL_HEIGHT = 2.4
export const WALL_THICKNESS = 0.1
export const DEFAULT_WINDOW_WIDTH = 0.9
export const DEFAULT_WINDOW_HEIGHT = 1.2

export const wallOrigin = new Vector3(0, 0, 0)
export const wallAxisX = new Vector3(1, 0, 0)
export const wallAxisY = new Vector3(0, 1, 0)
export const wallAxisZ = new Vector3(0, 0, 1)

export function fitOrthoHalfExtents(
  aspect: number,
  wallLength = WALL_LENGTH,
  wallHeight = WALL_HEIGHT,
): { halfW: number; halfH: number } {
  const wallAspect = wallLength / wallHeight
  if (aspect >= wallAspect) {
    const halfH = wallHeight / 2
    return { halfW: halfH * aspect, halfH }
  }
  const halfW = wallLength / 2
  return { halfW, halfH: halfW / aspect }
}

export function configureOrthoCamera(
  camera: OrthographicCamera,
  aspect: number,
  wallLength = WALL_LENGTH,
  wallHeight = WALL_HEIGHT,
): OrthographicCamera {
  const centerU = wallLength / 2
  const centerV = wallHeight / 2
  const { halfW, halfH } = fitOrthoHalfExtents(aspect, wallLength, wallHeight)
  camera.position.set(centerU, centerV, 10)
  camera.up.set(0, 1, 0)
  camera.lookAt(centerU, centerV, 0)
  camera.left = -halfW
  camera.right = halfW
  camera.bottom = -halfH
  camera.top = halfH
  camera.near = 0.1
  camera.far = 100
  camera.updateProjectionMatrix()
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
  planeZ = 0,
  target = new Vector3(),
): Vector3 {
  const near = new Vector3(ndcX, ndcY, -1)
  const far = new Vector3(ndcX, ndcY, 1)
  near.unproject(camera)
  far.unproject(camera)
  const dir = far.sub(near)
  const t = (planeZ - near.z) / dir.z
  return target.copy(near).add(dir.multiplyScalar(t))
}

export function worldHitToUv(hit: Vector3): { u: number; v: number } {
  const delta = hit.clone().sub(wallOrigin)
  return {
    u: delta.dot(wallAxisX),
    v: delta.dot(wallAxisY),
  }
}

export function wallPointToNdc(
  camera: OrthographicCamera,
  u: number,
  v: number,
  target = new Vector3(),
): Vector3 {
  return target.set(u, v, 0).project(camera)
}

export function pointerToWallUv(
  camera: OrthographicCamera,
  offsetX: number,
  offsetY: number,
  width: number,
  height: number,
): { u: number; v: number } {
  const ndc = ndcFromPointer(offsetX, offsetY, width, height)
  const hit = intersectWallPlane(camera, ndc.x, ndc.y)
  return worldHitToUv(hit)
}

export function roundTripMaxError(
  camera: OrthographicCamera,
  u: number,
  v: number,
): number {
  const ndc = wallPointToNdc(camera, u, v)
  const hit = intersectWallPlane(camera, ndc.x, ndc.y)
  const uv = worldHitToUv(hit)
  return Math.max(Math.abs(uv.u - u), Math.abs(uv.v - v))
}

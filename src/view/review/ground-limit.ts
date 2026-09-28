export const CAMERA_GROUND_CLEARANCE_M = 0.2

export function liftAboveGround(
  cameraY: number,
  targetY: number,
  groundAtCamera: number,
  groundAtTarget: number,
  clearance = CAMERA_GROUND_CLEARANCE_M,
): { cameraY: number; targetY: number } {
  let nextCamera = cameraY
  let nextTarget = targetY
  if (nextTarget < groundAtTarget) {
    const lift = groundAtTarget - nextTarget
    nextTarget += lift
    nextCamera += lift
  }
  const floor = groundAtCamera + clearance
  if (nextCamera < floor) nextCamera = floor
  return { cameraY: nextCamera, targetY: nextTarget }
}

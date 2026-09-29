import { cornerById } from '../../lib/model/geom'
import { pointInPlot, segmentAllowedInPlot } from '../../lib/model/plot-check'
import type { Floor, Plot } from '../../lib/model/types'
import {
  alignToNodes,
  headingFromNorthDeg,
  nearestCorner,
  nearestNode,
  nearestWallPoint,
  smallerAngleDeg,
  snapEndToMinTurn,
  snapEndToModule,
  snapEndToOrthogonal,
  CORNER_SNAP_M,
  type SnapTrace,
} from './snap'
import { fmt } from './svg'

export type PlanPoint = { x: number; z: number }

export type ResolvedEnd = {
  x: number
  z: number
  cornerId?: string
  wallSnap: boolean
  nodeSnap: boolean
  minTurn: boolean
  angleSnap: boolean
  traces: SnapTrace[]
}

export function referenceAway(
  floor: Floor,
  cornerId: string | undefined,
  start: PlanPoint,
  dx: number,
  dz: number,
): { dx: number; dz: number } | null {
  if (!cornerId) return null
  let best: { dx: number; dz: number; deg: number } | null = null
  for (const wall of floor.walls) {
    const atStart = wall.startCornerId === cornerId
    const atEnd = wall.endCornerId === cornerId
    if (!atStart && !atEnd) continue
    const other = cornerById(floor.corners, atStart ? wall.endCornerId : wall.startCornerId)
    if (!other) continue
    const wx = other.x - start.x
    const wz = other.z - start.z
    const deg = smallerAngleDeg(wx, wz, dx, dz)
    if (deg === null) continue
    if (!best || deg < best.deg) best = { dx: wx, dz: wz, deg }
  }
  return best ? { dx: best.dx, dz: best.dz } : null
}

export function resolveWallEnd(
  plot: Plot,
  floor: Floor,
  below: PlanPoint[],
  start: PlanPoint,
  startCornerId: string | undefined,
  x: number,
  z: number,
  highlighted: { dx: number; dz: number } | null,
): ResolvedEnd {
  const none = { wallSnap: false, minTurn: false, angleSnap: false, nodeSnap: false, traces: [] as SnapTrace[] }
  const hit = nearestCorner(floor.corners, x, z, CORNER_SNAP_M, startCornerId)
  if (hit) return { x: hit.x, z: hit.z, cornerId: hit.id, ...none }
  const node = nearestNode(below, x, z, CORNER_SNAP_M, start)
  if (node) return { x: node.x, z: node.z, ...none, nodeSnap: true }
  const wallHit = nearestWallPoint(floor.corners, floor.walls, x, z, CORNER_SNAP_M, startCornerId)
  if (wallHit) return { x: wallHit.x, z: wallHit.z, ...none, wallSnap: true }
  let end = { x, z }
  let minTurn = false
  let angleSnap = false
  const ref = referenceAway(floor, startCornerId, start, x - start.x, z - start.z) ?? highlighted
  const ortho = snapEndToOrthogonal(plot, start.x, start.z, end.x, end.z, ref?.dx ?? null, ref?.dz ?? null)
  if (ortho.applied) {
    end = ortho
    angleSnap = true
  } else if (ref) {
    const turned = snapEndToMinTurn(plot, start.x, start.z, end.x, end.z, ref.dx, ref.dz)
    end = turned
    minTurn = turned.applied
  }
  const snapped = snapEndToModule(plot, start.x, start.z, end.x, end.z, false)
  const aligned = alignToNodes(snapped.x, snapped.z, [...floor.corners, ...below], start)
  const onStart = Math.hypot(aligned.x - start.x, aligned.z - start.z) <= 1e-4
  const useAlign =
    aligned.traces.length > 0 &&
    !onStart &&
    pointInPlot(plot, aligned.x, aligned.z) &&
    segmentAllowedInPlot(plot, start.x, start.z, aligned.x, aligned.z)
  const endX = useAlign ? aligned.x : snapped.x
  const endZ = useAlign ? aligned.z : snapped.z
  const landed = floor.corners.find(
    (corner) => corner.id !== startCornerId && Math.hypot(corner.x - endX, corner.z - endZ) <= 1e-4,
  )
  return {
    x: endX,
    z: endZ,
    cornerId: landed?.id,
    wallSnap: false,
    nodeSnap: false,
    minTurn,
    angleSnap,
    traces: useAlign ? aligned.traces : [],
  }
}

export function squarePath(
  cx: number,
  cz: number,
  refDx: number,
  refDz: number,
  dx: number,
  dz: number,
  size: number,
): string {
  const rl = Math.hypot(refDx, refDz)
  const nl = Math.hypot(dx, dz)
  const rx = refDx / rl
  const rz = refDz / rl
  const nx = dx / nl
  const nz = dz / nl
  const ax = cx + rx * size
  const az = cz + rz * size
  const bx = ax + nx * size
  const bz = az + nz * size
  const cx2 = cx + nx * size
  const cz2 = cz + nz * size
  return `M${fmt(ax)} ${fmt(az)} L${fmt(bx)} ${fmt(bz)} L${fmt(cx2)} ${fmt(cz2)}`
}

export function arcPath(cx: number, cz: number, radius: number, a0: number, delta: number): string | null {
  if (Math.abs(delta) < 0.02) return null
  const steps = 12
  let d = ''
  for (let i = 0; i <= steps; i++) {
    const a = a0 + (delta * i) / steps
    const x = cx + radius * Math.cos(a)
    const z = cz + radius * Math.sin(a)
    d += `${i === 0 ? 'M' : 'L'}${fmt(x)} ${fmt(z)} `
  }
  return d.trim()
}

export function angleReadout(
  floor: Floor,
  startCornerId: string | undefined,
  start: PlanPoint,
  dx: number,
  dz: number,
  length: number,
  highlighted: { dx: number; dz: number } | null,
): { label: string; path: string | null; x: number; z: number } | null {
  if (length <= 0.05) return null
  const ref = referenceAway(floor, startCornerId, start, dx, dz) ?? highlighted
  if (ref) {
    const deg = smallerAngleDeg(ref.dx, ref.dz, dx, dz)
    if (deg === null) return null
    const a0 = Math.atan2(ref.dz, ref.dx)
    const a1 = Math.atan2(dz, dx)
    let delta = a1 - a0
    while (delta > Math.PI) delta -= 2 * Math.PI
    while (delta < -Math.PI) delta += 2 * Math.PI
    const mid = a0 + delta / 2
    const square = Math.abs(deg - 90) < 0.05
    return {
      label: `${Math.round(deg)}°`,
      path: square
        ? squarePath(start.x, start.z, ref.dx, ref.dz, dx, dz, 0.5)
        : arcPath(start.x, start.z, 0.75, a0, delta),
      x: start.x + Math.cos(mid) * 1.15,
      z: start.z + Math.sin(mid) * 1.15,
    }
  }
  const heading = headingFromNorthDeg(dx, dz)
  if (heading === null) return null
  const len = Math.hypot(dx, dz)
  return {
    label: `${Math.round(heading)}° from N`,
    path: null,
    x: start.x + (dx / len) * 0.9 + (-dz / len) * 0.55,
    z: start.z + (dz / len) * 0.9 + (dx / len) * 0.55,
  }
}

export function lengthReadout(
  x1: number,
  z1: number,
  x2: number,
  z2: number,
  length: number,
): { x: number; z: number; rotate: number; text: string } | null {
  if (length <= 0.05) return null
  const dx = x2 - x1
  const dz = z2 - z1
  let deg = (Math.atan2(dz, dx) * 180) / Math.PI
  let nx = -dz / length
  let nz = dx / length
  if (deg > 90 || deg <= -90) {
    deg += deg > 0 ? -180 : 180
    nx = -nx
    nz = -nz
  }
  return {
    x: (x1 + x2) / 2 + nx * 0.4,
    z: (z1 + z2) / 2 + nz * 0.4,
    rotate: deg,
    text: `${length.toFixed(2)} m`,
  }
}

import booleanPointInPolygon from '@turf/boolean-point-in-polygon'
import { cornerById } from '../../lib/model/geom'
import { rotateOffset } from '../../lib/model/mutations'
import { deriveRooms } from '../../lib/model/rooms'
import { segmentAllowedInPlot } from '../../lib/model/plot-check'
import type { Floor, Plot } from '../../lib/model/types'
import { ORTHOGONAL_SNAP_DEG } from './snap'
import type { SvgPoint } from '../../lib/export/svg'

export const WALL_HIT_M = 0.12
export const CORNER_MATCH_M = 0.002
export const NODE_HIT_M = 0.35
export const ROTATE_OFFSET_M = 0.95
export const ROTATE_HIT_M = 0.52
export const ROTATE_ICON =
  'M15.55 5.55L11 1v3.07C7.06 4.56 4 7.92 4 12s3.05 7.44 7 7.93v-2.02c-2.84-.48-5-2.94-5-5.91s2.16-5.43 5-5.91V10l4.55-4.45zM19.93 11a7.906 7.906 0 0 0-1.62-3.89l-1.42 1.42c.54.75.88 1.6 1.02 2.47h2.02zM13 17.9v2.02c1.39-.17 2.74-.71 3.9-1.61l-1.44-1.44c-.75.54-1.59.89-2.46 1.03zm3.89-2.42l1.42 1.41c.9-1.16 1.45-2.5 1.62-3.89h-2.02c-.14.87-.48 1.72-1.02 2.48z'

const GRID_STEP_M = 1

export function distToSegment(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  const dx = bx - ax
  const dz = bz - az
  const lenSq = dx * dx + dz * dz
  if (lenSq === 0) return Math.hypot(px - ax, pz - az)
  let t = ((px - ax) * dx + (pz - az) * dz) / lenSq
  t = Math.max(0, Math.min(1, t))
  const qx = ax + t * dx
  const qz = az + t * dz
  return Math.hypot(px - qx, pz - qz)
}

export function pickWall(floor: Floor, x: number, z: number): string | null {
  let bestId: string | null = null
  let bestD = WALL_HIT_M
  for (const wall of floor.walls) {
    const a = cornerById(floor.corners, wall.startCornerId)
    const b = cornerById(floor.corners, wall.endCornerId)
    if (!a || !b) continue
    const d = distToSegment(x, z, a.x, a.z, b.x, b.z)
    if (d < bestD) {
      bestD = d
      bestId = wall.id
    }
  }
  return bestId
}

export function roomPolygonPoints(cornerIds: string[], floor: Floor): SvgPoint[] {
  return cornerIds
    .map((id) => cornerById(floor.corners, id))
    .filter((c): c is NonNullable<typeof c> => c !== undefined)
    .map((c) => [c.x, c.z] as SvgPoint)
}

export function roomAtPoint(floor: Floor, x: number, z: number) {
  const derived = deriveRooms(floor)
  let best: (typeof derived)[0] | null = null
  for (const room of derived) {
    const ring = roomPolygonPoints(room.cornerIds, floor)
    if (ring.length < 3) continue
    const closed = [...ring, ring[0]]
    const poly = {
      type: 'Feature' as const,
      properties: {},
      geometry: {
        type: 'Polygon' as const,
        coordinates: [closed.map(([px, pz]) => [px, pz])],
      },
    }
    const pt = {
      type: 'Feature' as const,
      properties: {},
      geometry: { type: 'Point' as const, coordinates: [x, z] },
    }
    if (!booleanPointInPolygon(pt, poly)) continue
    if (!best || room.signedArea < best.signedArea) {
      best = room
    }
  }
  return best
}

export function cornerIdAt(floor: Floor, x: number, z: number): string | undefined {
  return floor.corners.find((c) => Math.hypot(c.x - x, c.z - z) <= CORNER_MATCH_M)?.id
}

export function snapTurn(angle: number): { angle: number; snapped: boolean } {
  const deg = (angle * 180) / Math.PI
  const target = Math.round(deg / 90) * 90
  if (Math.abs(deg - target) <= ORTHOGONAL_SNAP_DEG) {
    return { angle: (target * Math.PI) / 180, snapped: true }
  }
  return { angle, snapped: false }
}

export function turnLabel(angle: number): number {
  let deg = Math.round((angle * 180) / Math.PI)
  while (deg > 180) deg -= 360
  while (deg <= -180) deg += 360
  return deg
}

export function rotationStaysInPlot(
  plot: Plot,
  floor: Floor,
  cornerIds: string[],
  pivotId: string,
  angle: number,
): boolean {
  const pivot = cornerById(floor.corners, pivotId)
  if (!pivot) return false
  const moving = new Set(cornerIds)
  const at = (id: string) => {
    const corner = cornerById(floor.corners, id)
    if (!corner) return null
    if (!moving.has(id)) return corner
    const next = rotateOffset(corner.x - pivot.x, corner.z - pivot.z, angle)
    return { x: pivot.x + next.x, z: pivot.z + next.z }
  }
  for (const wall of floor.walls) {
    if (!moving.has(wall.startCornerId) && !moving.has(wall.endCornerId)) continue
    const a = at(wall.startCornerId)
    const b = at(wall.endCornerId)
    if (!a || !b || !segmentAllowedInPlot(plot, a.x, a.z, b.x, b.z)) return false
  }
  return true
}

export function translationStaysInPlot(
  plot: Plot,
  floor: Floor,
  cornerIds: string[],
  dx: number,
  dz: number,
): boolean {
  const moving = new Set(cornerIds)
  for (const wall of floor.walls) {
    if (!moving.has(wall.startCornerId) && !moving.has(wall.endCornerId)) continue
    const a = cornerById(floor.corners, wall.startCornerId)
    const b = cornerById(floor.corners, wall.endCornerId)
    if (!a || !b) return false
    const ax = a.x + (moving.has(a.id) ? dx : 0)
    const az = a.z + (moving.has(a.id) ? dz : 0)
    const bx = b.x + (moving.has(b.id) ? dx : 0)
    const bz = b.z + (moving.has(b.id) ? dz : 0)
    if (!segmentAllowedInPlot(plot, ax, az, bx, bz)) return false
  }
  return true
}

export function previewFloor(
  floor: Floor,
  turning: { pivotId: string; cornerIds: string[]; angle: number } | null,
  drag: { cornerIds: string[]; dx: number; dz: number } | null,
): Floor {
  if (turning && Math.abs(turning.angle) > 1e-8) {
    const pivot = cornerById(floor.corners, turning.pivotId)
    if (!pivot) return floor
    const moving = new Set(turning.cornerIds)
    return {
      ...floor,
      corners: floor.corners.map((corner) => {
        if (!moving.has(corner.id)) return corner
        const next = rotateOffset(corner.x - pivot.x, corner.z - pivot.z, turning.angle)
        return { ...corner, x: pivot.x + next.x, z: pivot.z + next.z }
      }),
    }
  }
  if (!drag || (drag.dx === 0 && drag.dz === 0)) return floor
  const moving = new Set(drag.cornerIds)
  return {
    ...floor,
    corners: floor.corners.map((corner) =>
      moving.has(corner.id) ? { ...corner, x: corner.x + drag.dx, z: corner.z + drag.dz } : corner,
    ),
  }
}

export function gridFromSegment(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  box: { minX: number; maxX: number; minZ: number; maxZ: number },
): { x1: number; z1: number; x2: number; z2: number }[] {
  const len = Math.hypot(bx - ax, bz - az)
  if (len < 1e-9) return []
  const dx = (bx - ax) / len
  const dz = (bz - az) / len
  const nx = -dz
  const nz = dx
  const samples = [
    [box.minX, box.minZ],
    [box.maxX, box.minZ],
    [box.maxX, box.maxZ],
    [box.minX, box.maxZ],
  ]
  let minU = Infinity
  let maxU = -Infinity
  let minV = Infinity
  let maxV = -Infinity
  for (const [x, z] of samples) {
    const u = (x - ax) * dx + (z - az) * dz
    const v = (x - ax) * nx + (z - az) * nz
    minU = Math.min(minU, u)
    maxU = Math.max(maxU, u)
    minV = Math.min(minV, v)
    maxV = Math.max(maxV, v)
  }
  const lines: { x1: number; z1: number; x2: number; z2: number }[] = []
  const at = (u: number, v: number) => ({
    x: ax + dx * u + nx * v,
    z: az + dz * u + nz * v,
  })
  for (let v = Math.ceil(minV / GRID_STEP_M) * GRID_STEP_M; v <= maxV; v += GRID_STEP_M) {
    const p = at(minU, v)
    const q = at(maxU, v)
    lines.push({ x1: p.x, z1: p.z, x2: q.x, z2: q.z })
  }
  for (let u = Math.ceil(minU / GRID_STEP_M) * GRID_STEP_M; u <= maxU; u += GRID_STEP_M) {
    const p = at(u, minV)
    const q = at(u, maxV)
    lines.push({ x1: p.x, z1: p.z, x2: q.x, z2: q.z })
  }
  return lines
}

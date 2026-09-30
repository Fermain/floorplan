import lineIntersect from '@turf/line-intersect'
import { EPS, pointsNearlyEqual } from './geom'
import { newId } from './id'
import type { Corner, Floor, Wall } from './types'

function geoLine(x0: number, z0: number, x1: number, z1: number) {
  return {
    type: 'Feature' as const,
    properties: {},
    geometry: {
      type: 'LineString' as const,
      coordinates: [
        [x0, z0],
        [x1, z1],
      ],
    },
  }
}

export type SegmentHit = {
  x: number
  z: number
  tOnNew: number
  wall: Wall
  tOnExisting: number
}

function interiorProjection(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  px: number,
  pz: number,
): { t: number } | null {
  const dx = bx - ax
  const dz = bz - az
  const len2 = dx * dx + dz * dz
  if (len2 === 0) return null
  const t = ((px - ax) * dx + (pz - az) * dz) / len2
  if (t <= EPS || t >= 1 - EPS) return null
  const qx = ax + t * dx
  const qz = az + t * dz
  if (Math.hypot(qx - px, qz - pz) > EPS) return null
  return { t }
}

function paramAlong(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  px: number,
  pz: number,
): number {
  const dx = bx - ax
  const dz = bz - az
  const len2 = dx * dx + dz * dz
  if (len2 === 0) return 0
  return ((px - ax) * dx + (pz - az) * dz) / len2
}

function wallLength(corners: Corner[], startId: string, endId: string): number {
  const a = corners.find((c) => c.id === startId)
  const b = corners.find((c) => c.id === endId)
  if (!a || !b) return 0
  return Math.hypot(a.x - b.x, a.z - b.z)
}

export function findWallCrossings(
  floor: Floor,
  nx0: number,
  nz0: number,
  nx1: number,
  nz1: number,
): SegmentHit[] {
  const newLine = geoLine(nx0, nz0, nx1, nz1)
  const hits: SegmentHit[] = []
  for (const wall of floor.walls) {
    const a = floor.corners.find((c) => c.id === wall.startCornerId)
    const b = floor.corners.find((c) => c.id === wall.endCornerId)
    if (!a || !b) continue
    const existing = geoLine(a.x, a.z, b.x, b.z)
    const result = lineIntersect(newLine, existing)
    for (const f of result.features) {
      const [ix, iz] = f.geometry.coordinates
      const atExistStart = pointsNearlyEqual({ x: a.x, z: a.z }, { x: ix, z: iz })
      const atExistEnd = pointsNearlyEqual({ x: b.x, z: b.z }, { x: ix, z: iz })
      if (atExistStart || atExistEnd) continue
      const tOnNew = paramAlong(nx0, nz0, nx1, nz1, ix, iz)
      const tOnExisting = paramAlong(a.x, a.z, b.x, b.z, ix, iz)
      if (tOnNew < -EPS || tOnNew > 1 + EPS) continue
      if (tOnExisting <= EPS || tOnExisting >= 1 - EPS) continue
      const nearStart = Math.hypot(ix - nx0, iz - nz0) <= EPS
      const nearEnd = Math.hypot(ix - nx1, iz - nz1) <= EPS
      hits.push({
        x: nearStart ? nx0 : nearEnd ? nx1 : ix,
        z: nearStart ? nz0 : nearEnd ? nz1 : iz,
        tOnNew: nearStart ? 0 : nearEnd ? 1 : tOnNew,
        wall,
        tOnExisting,
      })
    }
    for (const [tOnNew, x, z] of [
      [0, nx0, nz0],
      [1, nx1, nz1],
    ] as const) {
      const proj = interiorProjection(a.x, a.z, b.x, b.z, x, z)
      if (!proj) continue
      if (hits.some((h) => h.wall.id === wall.id && Math.hypot(h.x - x, h.z - z) <= EPS)) continue
      hits.push({ x, z, tOnNew, wall, tOnExisting: proj.t })
    }
  }
  hits.sort((a, b) => a.tOnNew - b.tOnNew)
  return hits
}

export function cornersOnSegment(
  corners: Corner[],
  x0: number,
  z0: number,
  x1: number,
  z1: number,
): { corner: Corner; t: number }[] {
  const found: { corner: Corner; t: number }[] = []
  for (const corner of corners) {
    const proj = interiorProjection(x0, z0, x1, z1, corner.x, corner.z)
    if (proj) found.push({ corner, t: proj.t })
  }
  return found.sort((a, b) => a.t - b.t)
}

export function splitWallAt(
  wall: Wall,
  splitDistance: number,
  newCornerId: string,
): { first: Wall; second: Wall } {
  const first: Wall = {
    ...wall,
    id: newId('wall'),
    endCornerId: newCornerId,
    openings: wall.openings
      .filter((o) => o.u < splitDistance - EPS)
      .map((o) => ({ ...o })),
  }
  const second: Wall = {
    ...wall,
    id: newId('wall'),
    startCornerId: newCornerId,
    openings: wall.openings
      .filter((o) => o.u >= splitDistance - EPS)
      .map((o) => ({ ...o, u: o.u - splitDistance })),
  }
  return { first, second }
}

export function applyExistingWallSplits(floor: Floor, hits: SegmentHit[]): Floor {
  if (hits.length === 0) return floor
  let walls = [...floor.walls]
  const corners = [...floor.corners]
  const byWall = new Map<string, SegmentHit[]>()
  for (const h of hits) {
    const list = byWall.get(h.wall.id) ?? []
    list.push(h)
    byWall.set(h.wall.id, list)
  }
  for (const [wallId, wallHits] of byWall) {
    wallHits.sort((a, b) => a.tOnExisting - b.tOnExisting)
    const wall = walls.find((w) => w.id === wallId)
    if (!wall) continue
    const origLen = wallLength(corners, wall.startCornerId, wall.endCornerId)
    walls = walls.filter((w) => w.id !== wallId)
    let current = wall
    let lastT = 0
    for (const h of wallHits) {
      const splitDist = (h.tOnExisting - lastT) * origLen
      let corner = corners.find((c) => Math.hypot(c.x - h.x, c.z - h.z) <= EPS)
      if (!corner) {
        corner = { id: newId('corner'), x: h.x, z: h.z }
        corners.push(corner)
      }
      const split = splitWallAt(current, splitDist, corner.id)
      walls.push(split.first)
      current = split.second
      lastT = h.tOnExisting
    }
    walls.push(current)
  }
  return { ...floor, corners, walls }
}

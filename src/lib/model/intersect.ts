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
      const atNewStart = pointsNearlyEqual({ x: nx0, z: nz0 }, { x: ix, z: iz })
      const atNewEnd = pointsNearlyEqual({ x: nx1, z: nz1 }, { x: ix, z: iz })
      const atExistStart = pointsNearlyEqual({ x: a.x, z: a.z }, { x: ix, z: iz })
      const atExistEnd = pointsNearlyEqual({ x: b.x, z: b.z }, { x: ix, z: iz })
      if (atNewStart || atNewEnd || atExistStart || atExistEnd) continue
      const tOnNew = paramAlong(nx0, nz0, nx1, nz1, ix, iz)
      const tOnExisting = paramAlong(a.x, a.z, b.x, b.z, ix, iz)
      if (tOnNew <= EPS || tOnNew >= 1 - EPS) continue
      if (tOnExisting <= EPS || tOnExisting >= 1 - EPS) continue
      hits.push({ x: ix, z: iz, tOnNew, wall, tOnExisting })
    }
  }
  hits.sort((a, b) => a.tOnNew - b.tOnNew)
  return hits
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
      const corner: Corner = { id: newId('corner'), x: h.x, z: h.z }
      corners.push(corner)
      const split = splitWallAt(current, splitDist, corner.id)
      walls.push(split.first)
      current = split.second
      lastT = h.tOnExisting
    }
    walls.push(current)
  }
  return { ...floor, corners, walls }
}

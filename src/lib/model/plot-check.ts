import booleanPointInPolygon from '@turf/boolean-point-in-polygon'
import lineIntersect from '@turf/line-intersect'
import type { Plot } from './types'
import { EPS, pointsNearlyEqual } from './geom'

function closedRing(plot: Plot): [number, number][] {
  const ring = plot.ring
  if (ring.length === 0) return ring
  const first = ring[0]
  const last = ring[ring.length - 1]
  if (first[0] === last[0] && first[1] === last[1]) {
    return ring
  }
  return [...ring, first]
}

function plotPolygon(plot: Plot) {
  return {
    type: 'Feature' as const,
    properties: {},
    geometry: { type: 'Polygon' as const, coordinates: [closedRing(plot)] },
  }
}

function geoPoint(x: number, z: number) {
  return {
    type: 'Feature' as const,
    properties: {},
    geometry: { type: 'Point' as const, coordinates: [x, z] },
  }
}

function geoLine(a: [number, number], b: [number, number]) {
  return {
    type: 'Feature' as const,
    properties: {},
    geometry: { type: 'LineString' as const, coordinates: [a, b] },
  }
}

export function pointInPlot(plot: Plot, x: number, z: number): boolean {
  return booleanPointInPolygon(geoPoint(x, z), plotPolygon(plot), { ignoreBoundary: false })
}

export function segmentAllowedInPlot(
  plot: Plot,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
): boolean {
  if (!pointInPlot(plot, x0, z0)) {
    return false
  }
  if (!pointInPlot(plot, x1, z1)) {
    return false
  }
  const seg = geoLine([x0, z0], [x1, z1])
  const ring = closedRing(plot)
  for (let i = 0; i < ring.length - 1; i++) {
    const edge = geoLine([ring[i][0], ring[i][1]], [ring[i + 1][0], ring[i + 1][1]])
    const hits = lineIntersect(seg, edge)
    for (const f of hits.features) {
      const [ix, iz] = f.geometry.coordinates
      const atStart = pointsNearlyEqual({ x: x0, z: z0 }, { x: ix, z: iz })
      const atEnd = pointsNearlyEqual({ x: x1, z: z1 }, { x: ix, z: iz })
      if (!atStart && !atEnd) {
        return false
      }
    }
  }
  return true
}

export function wallSegmentInPlot(
  plot: Plot,
  corners: { id: string; x: number; z: number }[],
  startId: string,
  endId: string,
): boolean {
  const a = corners.find((c) => c.id === startId)
  const b = corners.find((c) => c.id === endId)
  if (!a || !b) return false
  if (dist(a, b) <= EPS) return false
  return segmentAllowedInPlot(plot, a.x, a.z, b.x, b.z)
}

function dist(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.z - b.z)
}

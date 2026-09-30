import { leafSigns, wallMeshURange } from '../geometry/walls'
import { cornerById, wallLength } from '../model/geom'
import { leafOffset, systemOf } from '../model/systems'
import type { Document, Floor, Opening, Wall } from '../model/types'

const PLOT_MARGIN_M = 1
const NORTH_ARROW_LENGTH_M = 1.2
const SCALE_BAR_OFFSET_Z_M = 0.6

export type SvgPoint = [number, number]

function planToSvg(x: number, z: number): SvgPoint {
  return [x, z]
}

function mergeIntervals(intervals: [number, number][]): [number, number][] {
  if (intervals.length === 0) return []
  const sorted = [...intervals].sort((a, b) => a[0] - b[0])
  const out: [number, number][] = [sorted[0]]
  for (let i = 1; i < sorted.length; i++) {
    const [a0, a1] = sorted[i]
    const last = out[out.length - 1]
    if (a0 <= last[1]) {
      last[1] = Math.max(last[1], a1)
    } else {
      out.push([a0, a1])
    }
  }
  return out
}

function openingIntervals(length: number, openings: Opening[]): [number, number][] {
  const raw = openings
    .map((o) => [Math.max(0, o.u), Math.min(length, o.u + o.width)] as [number, number])
    .filter(([a, b]) => b > a)
  return mergeIntervals(raw)
}

function solidIntervalsBetween(
  u0: number,
  u1: number,
  length: number,
  openings: Opening[],
): [number, number][] {
  if (u1 - u0 <= 0) return []
  const gaps = openingIntervals(length, openings)
  const solids: [number, number][] = []
  let cursor = u0
  for (const [g0, g1] of gaps) {
    if (g0 > cursor) solids.push([cursor, Math.min(u1, g0)])
    cursor = Math.max(cursor, g1)
  }
  if (cursor < u1) solids.push([cursor, u1])
  return solids.filter(([a, b]) => b - a > 1e-9)
}

function wallFrame(wall: Wall, floor: Floor) {
  const start = cornerById(floor.corners, wall.startCornerId)!
  const end = cornerById(floor.corners, wall.endCornerId)!
  const dx = end.x - start.x
  const dz = end.z - start.z
  const len = Math.hypot(dx, dz)
  const tx = len === 0 ? 0 : dx / len
  const tz = len === 0 ? 0 : dz / len
  const nx = -tz
  const nz = tx
  return { start, tx, tz, nx, nz, len }
}

function leafOffsets(wall: Wall): number[] {
  const offset = leafOffset(systemOf(wall))
  return leafSigns(wall.skin).map((sign) => sign * offset)
}

function skinQuad(
  frame: ReturnType<typeof wallFrame>,
  u0: number,
  u1: number,
  centre: number,
  half: number,
): SvgPoint[] {
  const { start, tx, tz, nx, nz } = frame
  const corners: SvgPoint[] = []
  for (const side of [-half, half]) {
    const nOff = centre + side
    const x = start.x + tx * u0 + nx * nOff
    const z = start.z + tz * u0 + nz * nOff
    corners.push(planToSvg(x, z))
  }
  for (const side of [half, -half]) {
    const nOff = centre + side
    const x = start.x + tx * u1 + nx * nOff
    const z = start.z + tz * u1 + nz * nOff
    corners.push(planToSvg(x, z))
  }
  return corners
}

export function solidWallPolygonsForFloor(floor: Floor): SvgPoint[][] {
  const polygons: SvgPoint[][] = []
  for (const wall of floor.walls) {
    if (wall.skin === 'logical') continue
    const frame = wallFrame(wall, floor)
    if (frame.len <= 0) continue
    const half = systemOf(wall).leafThickness / 2
    for (const centre of leafOffsets(wall)) {
      const leafSign = centre === 0 ? 0 : Math.sign(centre)
      const { uMin, uMax } = wallMeshURange(floor, wall, leafSign)
      const intervals = solidIntervalsBetween(uMin, uMax, frame.len, wall.openings)
      for (const [u0, u1] of intervals) {
        if (u1 - u0 <= 0) continue
        polygons.push(skinQuad(frame, u0, u1, centre, half))
      }
    }
  }
  return polygons
}

function plotBounds(ring: [number, number][], margin: number) {
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (const [x, z] of ring) {
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minZ = Math.min(minZ, z)
    maxZ = Math.max(maxZ, z)
  }
  return {
    minX: minX - margin,
    maxX: maxX + margin,
    minZ: minZ - margin,
    maxZ: maxZ + margin,
  }
}

function formatNum(n: number): string {
  const r = Math.round(n * 1000) / 1000
  return Number.isInteger(r) ? String(r) : String(r)
}

function pointsAttr(points: SvgPoint[]): string {
  return points.map(([x, y]) => `${formatNum(x)},${formatNum(y)}`).join(' ')
}

function polygonElement(points: SvgPoint[]): string {
  return `<polygon points="${pointsAttr(points)}" fill="#333" stroke="none"/>`
}

function logicalWallElement(wall: Wall, floor: Floor): string {
  const start = cornerById(floor.corners, wall.startCornerId)!
  const end = cornerById(floor.corners, wall.endCornerId)!
  const [x1, y1] = planToSvg(start.x, start.z)
  const [x2, y2] = planToSvg(end.x, end.z)
  return `<line x1="${formatNum(x1)}" y1="${formatNum(y1)}" x2="${formatNum(x2)}" y2="${formatNum(y2)}" stroke="#666" stroke-width="0.02" stroke-dasharray="0.2 0.15"/>`
}

function plotRingElement(ring: [number, number][]): string {
  const closed = [...ring, ring[0]]
  return `<polyline points="${pointsAttr(closed.map(([x, z]) => planToSvg(x, z)))}" fill="none" stroke="#000" stroke-width="0.05"/>`
}

function northArrowElement(
  minX: number,
  maxZ: number,
  northBearingDeg: number,
): string {
  const cx = minX + 1.5
  const cy = maxZ - 1.5
  const rad = (northBearingDeg * Math.PI) / 180
  const ex = cx + NORTH_ARROW_LENGTH_M * Math.sin(rad)
  const ey = cy + NORTH_ARROW_LENGTH_M * Math.cos(rad)
  return `<g class="north-arrow"><line x1="${formatNum(cx)}" y1="${formatNum(cy)}" x2="${formatNum(ex)}" y2="${formatNum(ey)}" stroke="#000" stroke-width="0.04"/><text x="${formatNum(ex)}" y="${formatNum(ey)}" font-size="0.5" text-anchor="middle" dominant-baseline="middle">N</text></g>`
}

function scaleBarElement(minX: number, minZ: number): string {
  const y = minZ + SCALE_BAR_OFFSET_Z_M
  const x0 = minX + 1
  const x1 = x0 + 1
  return `<g id="scale-bar" class="scale-bar"><line id="scale-bar-line" x1="${formatNum(x0)}" y1="${formatNum(y)}" x2="${formatNum(x1)}" y2="${formatNum(y)}" stroke="#000" stroke-width="0.06"/><text x="${formatNum((x0 + x1) / 2)}" y="${formatNum(y - 0.35)}" font-size="0.35" text-anchor="middle">1 m</text></g>`
}

export function exportFloorSvg(document: Document, floorId: string): string {
  const floor = document.building.floors.find((f) => f.id === floorId)
  if (!floor) return '<svg xmlns="http://www.w3.org/2000/svg"></svg>'

  const { minX, maxX, minZ, maxZ } = plotBounds(document.plot.ring, PLOT_MARGIN_M)
  const width = maxX - minX
  const height = maxZ - minZ

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${formatNum(minX)} ${formatNum(minZ)} ${formatNum(width)} ${formatNum(height)}">`,
    plotRingElement(document.plot.ring),
  ]

  for (const poly of solidWallPolygonsForFloor(floor)) {
    parts.push(polygonElement(poly))
  }

  for (const wall of floor.walls) {
    if (wall.skin === 'logical') {
      parts.push(logicalWallElement(wall, floor))
    }
  }

  parts.push(northArrowElement(minX, maxZ, document.plot.northBearingDeg))
  parts.push(scaleBarElement(minX, minZ))
  parts.push('</svg>')
  return parts.join('')
}

export function solidWallPolygons(document: Document, floorId: string): SvgPoint[][] {
  const floor = document.building.floors.find((f) => f.id === floorId)
  if (!floor) return []
  return solidWallPolygonsForFloor(floor)
}

export function wallLengthOnFloor(floor: Floor, wallId: string): number {
  const wall = floor.walls.find((w) => w.id === wallId)
  if (!wall) return 0
  return wallLength(floor.corners, wall.startCornerId, wall.endCornerId)
}

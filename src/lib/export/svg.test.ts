import { describe, expect, it } from 'vitest'
import { addCorner, addOpening, addWall } from '../model/mutations'
import { cornerById } from '../model/geom'
import { fixtureDocument } from '../plot/fixture'
import {
  exportFloorSvg,
  solidWallPolygons,
  wallLengthOnFloor,
  type SvgPoint,
} from './svg'

function floorId(doc: ReturnType<typeof fixtureDocument>) {
  return doc.building.floors[0].id
}

function pointInPolygon(point: SvgPoint, polygon: SvgPoint[]): boolean {
  const [x, y] = point
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]
    const [xj, yj] = polygon[j]
    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

function pointInAnyPolygon(point: SvgPoint, polygons: SvgPoint[][]): boolean {
  return polygons.some((p) => pointInPolygon(point, p))
}

function parseScaleBarSpan(svg: string): number | null {
  const lineMatch = svg.match(
    /id="scale-bar-line"[^>]*x1="([^"]+)"[^>]*y1="([^"]+)"[^>]*x2="([^"]+)"[^>]*y2="([^"]+)"/,
  )
  if (!lineMatch) return null
  const x1 = Number(lineMatch[1])
  const y1 = Number(lineMatch[2])
  const x2 = Number(lineMatch[3])
  const y2 = Number(lineMatch[4])
  return Math.hypot(x2 - x1, y2 - y1)
}

describe('exportFloorSvg', () => {
  it('draws logical walls with stroke-dasharray', () => {
    let d = fixtureDocument()
    const fid = floorId(d)
    const r0 = addCorner(d, fid, 4, 5)
    expect(r0.ok).toBe(true)
    if (!r0.ok) return
    d = r0.document
    const r1 = addCorner(d, fid, 10, 5)
    expect(r1.ok).toBe(true)
    if (!r1.ok) return
    d = r1.document
    const corners = d.building.floors[0].corners
    const w = addWall(d, fid, corners[0].id, corners[1].id, 'logical')
    expect(w.ok).toBe(true)
    if (!w.ok) return
    d = w.document

    const svg = exportFloorSvg(d, fid)
    expect(svg).toMatch(/stroke-dasharray/)
  })

  it('leaves opening midpoints uncovered in solid wall polygons', () => {
    let d = fixtureDocument()
    const fid = floorId(d)
    const r0 = addCorner(d, fid, 4, 7)
    expect(r0.ok).toBe(true)
    if (!r0.ok) return
    d = r0.document
    const r1 = addCorner(d, fid, 12, 7)
    expect(r1.ok).toBe(true)
    if (!r1.ok) return
    d = r1.document
    const corners = d.building.floors[0].corners
    const w = addWall(d, fid, corners[0].id, corners[1].id, 'double')
    expect(w.ok).toBe(true)
    if (!w.ok) return
    d = w.document
    const wall = d.building.floors[0].walls[0]
    const openingU = 3
    const o = addOpening(d, fid, wall.id, 'window', openingU)
    expect(o.ok).toBe(true)
    if (!o.ok) return
    d = o.document
    const floor = d.building.floors[0]
    const updatedWall = floor.walls.find((w) => w.id === wall.id)!
    const opening = updatedWall.openings[0]
    const len = wallLengthOnFloor(floor, wall.id)
    const midU = opening.u + opening.width / 2
    expect(midU).toBeGreaterThan(0)
    expect(midU).toBeLessThan(len)

    const start = cornerById(floor.corners, updatedWall.startCornerId)!
    const end = cornerById(floor.corners, updatedWall.endCornerId)!
    const dx = end.x - start.x
    const dz = end.z - start.z
    const nx = -dz / len
    const nz = dx / len
    const leaf = 0.075
    const atU = (u: number): SvgPoint => [
      start.x + (dx * u) / len + nx * leaf,
      start.z + (dz * u) / len + nz * leaf,
    ]

    const polygons = solidWallPolygons(d, fid)
    expect(polygons.length).toBeGreaterThan(0)
    expect(pointInAnyPolygon(atU(midU), polygons)).toBe(false)
    expect(pointInAnyPolygon(atU(1), polygons)).toBe(true)
  })

  it('extends the outer leaf past an end-to-start corner', () => {
    let d = fixtureDocument()
    const fid = floorId(d)
    for (const [x, z] of [
      [4, 4],
      [10, 4],
      [10, 10],
    ] as const) {
      const added = addCorner(d, fid, x, z)
      expect(added.ok).toBe(true)
      if (!added.ok) return
      d = added.document
    }
    const ids = d.building.floors[0].corners.map((c) => c.id)
    const south = addWall(d, fid, ids[0], ids[1], 'double')
    expect(south.ok).toBe(true)
    if (!south.ok) return
    d = south.document
    const east = addWall(d, fid, ids[1], ids[2], 'double')
    expect(east.ok).toBe(true)
    if (!east.ok) return
    d = east.document
    const polygons = solidWallPolygons(d, fid)
    expect(pointInAnyPolygon([10.05, 3.92], polygons)).toBe(true)
    expect(pointInAnyPolygon([9.9, 4.08], polygons)).toBe(true)
    expect(pointInAnyPolygon([10.1, 3.9], polygons)).toBe(true)
    expect(pointInAnyPolygon([10.2, 3.8], polygons)).toBe(false)
  })

  it('scale bar spans one metre in user units', () => {
    const d = fixtureDocument()
    const fid = floorId(d)
    const svg = exportFloorSvg(d, fid)
    const span = parseScaleBarSpan(svg)
    expect(span).not.toBeNull()
    expect(span!).toBeCloseTo(1, 6)
  })

  it('draws fences with posts, swinging gates with arcs, and sliding gates with rings', async () => {
    const { addGate, setFence } = await import('../model/mutations')
    let d = fixtureDocument()
    const fid = floorId(d)
    d = addCorner(d, fid, 2, 1).document
    d = addCorner(d, fid, 14, 1).document
    const corners = d.building.floors[0].corners
    d = addWall(d, fid, corners[0].id, corners[1].id, 'logical').document
    const wallId = d.building.floors[0].walls[0].id
    d = setFence(d, fid, wallId, { type: 'palisade', height: 1.8 }).document
    d = addGate(d, fid, wallId, { u: 1.5, width: 1, opening: 'swing' }).document
    d = addGate(d, fid, wallId, { u: 8.5, width: 2, opening: 'sliding' }).document

    const svg = exportFloorSvg(d, fid)
    // Fence runs with posts (rect), swinging gate arc (polyline), and sliding gate ring (polygon)
    expect(svg).toContain('<rect')
    expect(svg).toContain('<polyline')
    expect(svg).toContain('<polygon')
  })

  it('exports garden beds and paving on the ground floor', async () => {
    const { addBed, addPaving } = await import('../model/mutations')
    let d = fixtureDocument()
    const fid = floorId(d)
    d = addBed(d, [[2, 2], [6, 2], [6, 4], [2, 4]], 0.4, 'brick').document
    d = addBed(d, [[8, 2], [11, 2], [11, 4], [8, 4]], 0, 'timber').document
    d = addPaving(d, [[14, 2], [18, 2], [18, 6], [14, 6]], 'clay-pavers').document

    const svg = exportFloorSvg(d, fid)
    // Raised bed wall & inner soil polygons, flat bed edging polygon, and paving polygon
    expect(svg).toContain('fill="#a65f43"') // brick raised bed wall
    expect(svg).toContain('fill="#34261f"') // soil colour
    expect(svg).toContain('stroke="#825633"') // timber flat edging stroke
    expect(svg).toContain('fill="#a65f43"') // brick paving fill
  })
})

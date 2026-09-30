import { describe, expect, it } from 'vitest'
import { collectLintelSpans, collectWallBlockSpans } from '../geometry/walls'
import { surfaceBedPolygons } from '../geometry/deck'
import { scheduleWall } from '../geometry/schedule'
import { BLOCK_HEIGHT, BLOCK_LENGTH, BLOCK_THICKNESS, CAVITY, fixtureDocument, LEAF_OFFSET, WALL_HEAD } from '../plot/fixture'
import { addCorner, addOpening, addWall, addWallRing, setDefaultWallSystem, setWallSystem } from './mutations'
import { defaultOpeningDimensions } from './openings'
import {
  courseCount,
  leafOffset,
  outerReach,
  systemOf,
  WALL_SYSTEMS,
  wallSystem,
  wallThickness,
} from './systems'
import type { Document, Floor, Wall } from './types'

function freeWall(overrides: Partial<Wall> = {}): { floor: Floor; wall: Wall } {
  const wall: Wall = { id: 'w', startCornerId: 'a', endCornerId: 'b', skin: 'single', openings: [], ...overrides }
  const floor: Floor = {
    id: 'f',
    index: 0,
    datumHeight: 0,
    corners: [
      { id: 'a', x: 0, z: 0 },
      { id: 'b', x: 4, z: 0 },
    ],
    walls: [wall],
    roomFinishes: {},
  }
  return { floor, wall }
}

function twoCorners(d: Document, a: [number, number], b: [number, number]) {
  const fid = d.building.floors[0].id
  d = (addCorner(d, fid, ...a) as { document: Document }).document
  d = (addCorner(d, fid, ...b) as { document: Document }).document
  const [start, end] = d.building.floors[0].corners
  return { d, fid, start, end }
}

describe('wall systems', () => {
  it('keeps the clay cavity wall identical to the fixture constants', () => {
    const clay = wallSystem('clay-cavity')
    expect(clay.moduleLength).toBe(BLOCK_LENGTH)
    expect(clay.courseHeight).toBe(BLOCK_HEIGHT)
    expect(clay.leafThickness).toBe(BLOCK_THICKNESS)
    expect(clay.cavity).toBe(CAVITY)
    expect(leafOffset(clay)).toBeCloseTo(LEAF_OFFSET, 9)
    expect(wallThickness(clay)).toBeCloseTo(0.262, 9)
  })

  it('gives every single-leaf system no cavity and no leaf offset', () => {
    for (const system of WALL_SYSTEMS.filter((item) => item.leaves === 1)) {
      expect(system.cavity).toBe(0)
      expect(leafOffset(system)).toBe(0)
      expect(outerReach(system)).toBeCloseTo(system.leafThickness / 2, 9)
    }
  })

  it('reads a wall with no system from its skin, so older projects still open', () => {
    expect(systemOf({ skin: 'double' }).id).toBe('clay-cavity')
    expect(systemOf({ skin: 'single' }).id).toBe('clay-single')
    expect(systemOf({ skin: 'single', systemId: 'block-140' }).id).toBe('block-140')
  })

  it('lays whole courses of block up to the wall head and cuts the last one', () => {
    const { floor, wall } = freeWall({ systemId: 'block-140' })
    const spans = collectWallBlockSpans(floor, wall)
    const system = wallSystem('block-140')
    const courses = courseCount(system, WALL_HEAD)
    expect(courses).toBe(13)
    expect(Math.max(...spans.map((span) => span.y1))).toBeCloseTo(WALL_HEAD, 9)
    const top = spans.filter((span) => span.course === courses - 1)
    expect(top.length).toBeGreaterThan(0)
    for (const span of top) expect(span.y1 - span.y0).toBeCloseTo(WALL_HEAD - 12 * 0.2, 9)
    for (const span of spans) expect(span.u1 - span.u0).toBeLessThanOrEqual(0.4 + 1e-9)
    expect(new Set(spans.map((span) => span.leaf))).toEqual(new Set([0]))
  })

  it('counts whole blocks and cut blocks on a free-standing block wall', () => {
    const { floor, wall } = freeWall({ systemId: 'block-140' })
    const schedule = scheduleWall(floor, wall)
    expect(schedule.wholeBricks).toBe(120)
    expect(schedule.cutBricks).toBe(10)
  })

  it('sets default openings on the courses of the wall they sit in', () => {
    const block = defaultOpeningDimensions('window', wallSystem('block-140'))
    expect(block.v).toBeCloseTo(1, 9)
    expect(block.v + block.height).toBeCloseTo(2.2, 9)
    expect(block.width / 0.2).toBeCloseTo(Math.round(block.width / 0.2), 9)
    const clay = defaultOpeningDimensions('window', wallSystem('clay-cavity'))
    expect(clay).toEqual(defaultOpeningDimensions('window'))
  })

  it('spans a block lintel one course deep', () => {
    const doc = { ...fixtureDocument(), building: { floors: [freeWall({ systemId: 'block-140' }).floor] } }
    const placed = addOpening(doc, 'f', 'w', 'window', 1.6)
    expect(placed.ok).toBe(true)
    const floor = placed.document.building.floors[0]
    const [lintel] = collectLintelSpans(floor, floor.walls[0])
    expect(lintel.y1 - lintel.y0).toBeCloseTo(0.2, 9)
    expect(lintel.y0).toBeCloseTo(2.2, 9)
  })
})

describe('wall system mutations', () => {
  it('draws a wall in the chosen system with the matching skin', () => {
    const { d, fid, start, end } = twoCorners(fixtureDocument(), [4, 4], [8, 4])
    const r = addWall(d, fid, start.id, end.id, 'double', 'block-140')
    expect(r.ok).toBe(true)
    const [wall] = r.document.building.floors[0].walls
    expect(wall.systemId).toBe('block-140')
    expect(wall.skin).toBe('single')
  })

  it('leaves a logical wall without a system', () => {
    const { d, fid, start, end } = twoCorners(fixtureDocument(), [4, 4], [8, 4])
    const r = addWall(d, fid, start.id, end.id, 'logical', 'block-140')
    const [wall] = r.document.building.floors[0].walls
    expect(wall.systemId).toBeUndefined()
    expect(wall.skin).toBe('logical')
  })

  it('closes a rectangle in the chosen system', () => {
    const d = fixtureDocument()
    const r = addWallRing(
      d,
      d.building.floors[0].id,
      [
        { x: 4, z: 4 },
        { x: 8, z: 4 },
        { x: 8, z: 8 },
        { x: 4, z: 8 },
      ],
      'double',
      'maxi-140',
    )
    expect(r.ok).toBe(true)
    expect(r.document.building.floors[0].walls.every((wall) => wall.systemId === 'maxi-140')).toBe(true)
  })

  it('moves aligned openings onto the new courses when a wall changes system', () => {
    const { d, fid, start, end } = twoCorners(fixtureDocument(), [4, 4], [8, 4])
    let doc = addWall(d, fid, start.id, end.id, 'double').document
    const wallId = doc.building.floors[0].walls[0].id
    doc = addOpening(doc, fid, wallId, 'window', 1.5).document
    const r = setWallSystem(doc, fid, wallId, 'block-140')
    expect(r.ok).toBe(true)
    const wall = r.document.building.floors[0].walls[0]
    expect(wall.skin).toBe('single')
    expect(wall.openings[0].v).toBeCloseTo(1, 9)
    expect(wall.openings[0].v + wall.openings[0].height).toBeCloseTo(2.2, 9)
  })

  it('refuses a system on a logical wall', () => {
    const { d, fid, start, end } = twoCorners(fixtureDocument(), [4, 4], [8, 4])
    const doc = addWall(d, fid, start.id, end.id, 'logical').document
    const r = setWallSystem(doc, fid, doc.building.floors[0].walls[0].id, 'block-140')
    expect(r.ok).toBe(false)
  })

  it('remembers the system new walls are drawn in', () => {
    const r = setDefaultWallSystem(fixtureDocument(), 'block-90')
    expect(r.document.building.wallSystemId).toBe('block-90')
  })
})

describe('surface bed', () => {
  it('stops just inside the outer face of each wall it meets', () => {
    const d = fixtureDocument()
    const ring = addWallRing(
      d,
      d.building.floors[0].id,
      [
        { x: 4, z: 4 },
        { x: 8, z: 4 },
        { x: 8, z: 8 },
        { x: 4, z: 8 },
      ],
      'double',
      'block-140',
    )
    const floor = ring.document.building.floors[0]
    const rings = [floor.corners.map((corner) => ({ x: corner.x, z: corner.z }))]
    const [bed] = surfaceBedPolygons(rings, floor)
    const xs = bed.outer.map((point) => point.x)
    expect(Math.min(...xs)).toBeCloseTo(4 - (0.07 - 0.02), 6)
    expect(Math.max(...xs)).toBeCloseTo(8 + (0.07 - 0.02), 6)
  })
})

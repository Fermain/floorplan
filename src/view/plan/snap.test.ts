import { describe, expect, it } from 'vitest'
import { BLOCK_LENGTH, fixturePlot } from '../../lib/plot/fixture'
import { nearestCorner, snapEndToModule, CORNER_SNAP_M, smallerAngleDeg, headingFromNorthDeg, nearestWallPoint, snapEndToMinTurn, snapEndToOrthogonal, alignToNodes, alignTranslation, nearestPlotEdge, nearestRingEdge, nearestNode } from './snap'
import type { Corner } from '../../lib/model/types'

const plot = fixturePlot()

describe('nearestCorner', () => {
  const corners: Corner[] = [
    { id: 'a', x: 0, z: 0 },
    { id: 'b', x: 5, z: 5 },
  ]

  it('returns corner within radius', () => {
    expect(nearestCorner(corners, 0.1, 0.1)?.id).toBe('a')
  })

  it('returns undefined when none within radius', () => {
    expect(nearestCorner(corners, 5, 0, CORNER_SNAP_M)).toBeUndefined()
  })
})

describe('snapEndToModule', () => {
  it('snaps length to block module inside plot', () => {
    const startX = 2
    const startZ = 2
    const endX = 2 + BLOCK_LENGTH * 3 + 0.03
    const endZ = 2
    const out = snapEndToModule(plot, startX, startZ, endX, endZ, false)
    expect(out.x).toBeCloseTo(startX + BLOCK_LENGTH * 3, 5)
    expect(out.z).toBeCloseTo(startZ, 5)
  })

  it('does not snap when end is an existing corner', () => {
    const out = snapEndToModule(plot, 2, 2, 5.01, 2, true)
    expect(out.x).toBe(5.01)
  })

  it('keeps unsnapped point when snapped end leaves plot', () => {
    const startX = 1
    const startZ = 19
    const endX = startX
    const endZ = startZ + BLOCK_LENGTH * 14 + 0.03
    const out = snapEndToModule(plot, startX, startZ, endX, endZ, false)
    expect(out.z).toBeCloseTo(endZ, 5)
  })

  it('ignores an excluded corner', () => {
    const corners: Corner[] = [
      { id: 'a', x: 0, z: 0 },
      { id: 'b', x: 0.1, z: 0 },
    ]
    expect(nearestCorner(corners, 0, 0, CORNER_SNAP_M, 'a')?.id).toBe('b')
  })
})

describe('angles', () => {
  it('reports the smaller angle between two directions', () => {
    expect(smallerAngleDeg(1, 0, 0, 1)).toBeCloseTo(90, 5)
    expect(smallerAngleDeg(1, 0, -1, 0)).toBeCloseTo(180, 5)
  })

  it('measures heading clockwise from north', () => {
    expect(headingFromNorthDeg(0, 1)).toBeCloseTo(0, 5)
    expect(headingFromNorthDeg(1, 0)).toBeCloseTo(90, 5)
  })
})

describe('nearestWallPoint', () => {
  const corners: Corner[] = [
    { id: 'a', x: 2, z: 6 },
    { id: 'b', x: 14, z: 6 },
  ]
  const walls = [{ id: 'w', startCornerId: 'a', endCornerId: 'b' }]

  it('snaps to the middle of a wall', () => {
    const hit = nearestWallPoint(corners, walls, 8, 6.1)
    expect(hit?.x).toBeCloseTo(8, 5)
    expect(hit?.z).toBeCloseTo(6, 5)
    expect(hit?.wallId).toBe('w')
  })

  it('does not snap onto the wall that leaves the excluded corner', () => {
    expect(nearestWallPoint(corners, walls, 8, 6.1, undefined, 'a')).toBeUndefined()
  })
})

describe('snapEndToOrthogonal', () => {
  it('pulls a near miss onto 90 and marks it square', () => {
    const deg = (87 * Math.PI) / 180
    const hit = snapEndToOrthogonal(plot, 4, 4, 4 + Math.cos(deg), 4 + Math.sin(deg), 1, 0)
    expect(hit.applied).toBe(true)
    expect(hit.square).toBe(true)
    expect(smallerAngleDeg(1, 0, hit.x - 4, hit.z - 4)).toBeCloseTo(90, 5)
  })

  it('pulls a near miss onto a straight continuation without a square', () => {
    const deg = (177 * Math.PI) / 180
    const hit = snapEndToOrthogonal(plot, 4, 4, 4 + Math.cos(deg), 4 + Math.sin(deg), 1, 0)
    expect(hit.applied).toBe(true)
    expect(hit.square).toBe(false)
    expect(smallerAngleDeg(1, 0, hit.x - 4, hit.z - 4)).toBeCloseTo(180, 4)
  })

  it('leaves a clear miss of 90 alone', () => {
    const deg = (80 * Math.PI) / 180
    const hit = snapEndToOrthogonal(plot, 4, 4, 4 + Math.cos(deg), 4 + Math.sin(deg), 1, 0)
    expect(hit.applied).toBe(false)
  })

  it('catches a five-degree miss', () => {
    const deg = (85 * Math.PI) / 180
    const hit = snapEndToOrthogonal(plot, 4, 4, 4 + Math.cos(deg), 4 + Math.sin(deg), 1, 0)
    expect(hit.applied).toBe(true)
    expect(hit.square).toBe(true)
  })

  it('snaps a free wall to the nearest multiple of 90 from north', () => {
    const heading = (87 * Math.PI) / 180
    const hit = snapEndToOrthogonal(plot, 4, 4, 4 + Math.sin(heading), 4 + Math.cos(heading), null, null)
    expect(hit.applied).toBe(true)
    expect(hit.square).toBe(false)
    expect(headingFromNorthDeg(hit.x - 4, hit.z - 4)).toBeCloseTo(90, 5)
  })
})

describe('alignToNodes', () => {
  it('snaps onto a nearby corner axis and reports the trace', () => {
    const hit = alignToNodes(5.2, 8, [{ x: 5, z: 2 }], { x: 5, z: 10 })
    expect(hit.x).toBe(5)
    expect(hit.z).toBe(8)
    expect(hit.traces).toHaveLength(1)
    expect(hit.traces[0]).toMatchObject({ x1: 5, z1: 2 })
  })

  it('leaves a clear miss alone', () => {
    const hit = alignToNodes(6, 8, [{ x: 5, z: 2 }], { x: 5, z: 10 })
    expect(hit).toMatchObject({ x: 6, z: 8, traces: [] })
  })

  it('locks a near perpendicular onto 90 degrees and leaves a diagonal alone', () => {
    const start = { x: 0, z: 0 }
    const node = { x: 5, z: 0 }
    const square = alignToNodes(0.2, 4, [node], start)
    expect(square.x).toBeCloseTo(0, 5)
    expect(square.z).toBeCloseTo(4, 5)
    expect(smallerAngleDeg(node.x - start.x, node.z - start.z, square.x - start.x, square.z - start.z)).toBeCloseTo(90, 5)
    expect(square.traces).toHaveLength(1)
    const diagonal = alignToNodes(5.1, 5, [node], start)
    expect(diagonal).toMatchObject({ x: 5.1, z: 5, traces: [] })
  })

  it('slides a moving corner onto a fixed corner', () => {
    const hit = alignTranslation(1.8, 0.2, [{ x: 4, z: 4 }], [{ x: 6, z: 9 }])
    expect(hit.dx).toBeCloseTo(2, 5)
    expect(hit.dz).toBe(0.2)
    expect(hit.traces).toHaveLength(1)
  })
})

describe('nearestNode', () => {
  const nodes = [
    { x: 4, z: 4 },
    { x: 10, z: 4 },
  ]

  it('lands on the nearest node below and skips the one under the start', () => {
    expect(nearestNode(nodes, 4.1, 4.05)).toEqual({ x: 4, z: 4 })
    expect(nearestNode(nodes, 4.1, 4.05, CORNER_SNAP_M, { x: 4, z: 4 })).toBeUndefined()
    expect(nearestNode(nodes, 6, 6)).toBeUndefined()
  })
})

describe('nearestPlotEdge', () => {
  const ring: [number, number][] = [
    [0, 0],
    [10, 0],
    [10, 8],
    [0, 8],
  ]

  it('picks the closest boundary and ignores a far click', () => {
    expect(nearestPlotEdge(ring, 4, 0.2)).toBe(0)
    expect(nearestPlotEdge(ring, 5, 4)).toBeUndefined()
  })
})

describe('nearestRingEdge', () => {
  const outer = [
    { x: 0, z: 0 },
    { x: 10, z: 0 },
    { x: 10, z: 8 },
    { x: 0, z: 8 },
  ]
  const inner = [
    { x: 4, z: 4 },
    { x: 7, z: 4 },
    { x: 7, z: 6 },
    { x: 4, z: 6 },
  ]

  it('picks the dashed edge under the pointer', () => {
    const hit = nearestRingEdge([outer, inner], 5.5, 4.1)
    expect(hit?.ring).toBe(1)
    expect(hit?.edge).toBe(0)
    expect(hit?.distance).toBeCloseTo(0.1, 5)
    expect(nearestRingEdge([outer, inner], 5, 2)).toBeUndefined()
  })
})

describe('snapEndToMinTurn', () => {
  it('lifts a shallow turn up to the minimum and leaves a square turn alone', () => {
    const shallow = snapEndToMinTurn(plot, 4, 4, 4 + Math.cos((8 * Math.PI) / 180), 4 + Math.sin((8 * Math.PI) / 180), 1, 0)
    expect(shallow.applied).toBe(true)
    expect(smallerAngleDeg(1, 0, shallow.x - 4, shallow.z - 4)).toBeCloseTo(15, 5)
    const square = snapEndToMinTurn(plot, 4, 4, 4, 8, 1, 0)
    expect(square.applied).toBe(false)
    expect(square).toMatchObject({ x: 4, z: 8 })
  })
})

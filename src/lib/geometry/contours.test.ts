import { describe, expect, it } from 'vitest'
import type { Heightfield } from '../model/types'
import { fixtureHeightfield } from '../plot/fixture'
import { buildContourLines, contourInterval, contourPlanPaths, isMajorContour } from './contours'

function segmentsNear(
  positions: Float32Array,
  level: number,
): [number, number, number, number][] {
  const segs: [number, number, number, number][] = []
  for (let i = 0; i < positions.length; i += 6) {
    const y0 = positions[i + 1]
    const y1 = positions[i + 4]
    if (Math.abs(y0 - level) > 1e-6 || Math.abs(y1 - level) > 1e-6) continue
    segs.push([positions[i], positions[i + 2], positions[i + 3], positions[i + 5]])
  }
  return segs
}

describe('contour lines', () => {
  it('picks a quarter-metre interval on the fixture slope', () => {
    const field = fixtureHeightfield()
    let min = Infinity
    let max = -Infinity
    for (const h of field.heights) {
      min = Math.min(min, h)
      max = Math.max(max, h)
    }
    expect(contourInterval(min, max)).toBe(0.25)
    expect(isMajorContour(1, 0.25)).toBe(true)
    expect(isMajorContour(0.25, 0.25)).toBe(false)
  })

  it('draws the 0.5 m line straight across a linear ramp', () => {
    const field: Heightfield = {
      originX: 0,
      originZ: 0,
      cellSize: 1,
      cols: 2,
      rows: 2,
      heights: [0, 0, 1, 1],
    }
    const lines = buildContourLines(field)
    const segs = segmentsNear(lines.minor, 0.5)
    expect(segs).toHaveLength(2)
    for (const [x0, z0, x1, z1] of segs) {
      expect(z0).toBeCloseTo(0.5, 5)
      expect(z1).toBeCloseTo(0.5, 5)
      expect(Math.min(x0, x1)).toBeGreaterThanOrEqual(-1e-6)
      expect(Math.max(x0, x1)).toBeLessThanOrEqual(1 + 1e-6)
    }
    const xs = segs.flatMap(([x0, , x1]) => [x0, x1]).sort((a, b) => a - b)
    expect(xs[0]).toBeCloseTo(0, 5)
    expect(xs[xs.length - 1]).toBeCloseTo(1, 5)
  })

  it('lifts the line off the surface along the face normal', () => {
    const field: Heightfield = {
      originX: 0,
      originZ: 0,
      cellSize: 1,
      cols: 2,
      rows: 2,
      heights: [0, 0, 1, 1],
    }
    const lines = buildContourLines(field, 0.03)
    let lifted = false
    for (let i = 1; i < lines.minor.length; i += 3) {
      if (lines.minor[i] > 0.5 && lines.minor[i] < 0.5 + 0.03) lifted = true
    }
    expect(lifted).toBe(true)
  })

  it('draws minor and major lines on the fixture', () => {
    const lines = buildContourLines(fixtureHeightfield())
    expect(lines.interval).toBe(0.25)
    expect(lines.minor.length).toBeGreaterThan(0)
    expect(lines.major.length).toBeGreaterThan(0)
    for (let i = 1; i < lines.major.length; i += 3) {
      const y = lines.major[i]
      expect(Math.abs(y - Math.round(y))).toBeLessThan(1e-6)
    }
  })

  it('projects the same lines onto the plan', () => {
    const field: Heightfield = {
      originX: 0,
      originZ: 0,
      cellSize: 1,
      cols: 2,
      rows: 2,
      heights: [0, 0, 1, 1],
    }
    const overlay = contourPlanPaths(field)
    expect(overlay.minor).toContain('M0 0.5L0.5 0.5')
    expect(overlay.minor).toContain('M0.5 0.5L1 0.5')
    expect(contourPlanPaths(fixtureHeightfield()).major.length).toBeGreaterThan(0)
  })

  it('draws nothing on a flat field', () => {
    const field: Heightfield = {
      originX: 0,
      originZ: 0,
      cellSize: 1,
      cols: 3,
      rows: 3,
      heights: Array(9).fill(4),
    }
    const lines = buildContourLines(field)
    expect(lines.interval).toBeNull()
    expect(lines.minor.length).toBe(0)
    expect(lines.major.length).toBe(0)
  })
})

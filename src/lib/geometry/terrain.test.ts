import { describe, expect, it } from 'vitest'
import { fixtureHeightfield } from '../plot/fixture'
import { bilinearHeight, bottomSamplesAlong } from './terrain'

const TOLERANCE_M = 0.001
const field = fixtureHeightfield()

function xzAtU(
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  u: number,
): { x: number; z: number } {
  const len = Math.hypot(x1 - x0, z1 - z0)
  const t = len === 0 ? 0 : u / len
  return { x: x0 + (x1 - x0) * t, z: z0 + (z1 - z0) * t }
}

function maxSampleGap(
  x0: number,
  z0: number,
  x1: number,
  z1: number,
): number {
  const samples = bottomSamplesAlong(field, x0, z0, x1, z1)
  let maxGap = 0
  for (const s of samples) {
    const { x, z } = xzAtU(x0, z0, x1, z1, s.u)
    maxGap = Math.max(maxGap, Math.abs(s.y - bilinearHeight(field, x, z)))
  }
  return maxGap
}

describe('terrain kernel', () => {
  it('bilinear sample on a grid point equals that height sample', () => {
    const c = 7
    const r = 11
    const x = field.originX + c * field.cellSize
    const z = field.originZ + r * field.cellSize
    const expected = field.heights[r * field.cols + c]
    expect(bilinearHeight(field, x, z)).toBe(expected)
  })

  it('bottomSamplesAlong on diagonal (0,2)-(16,14) tracks bilinear grade', () => {
    const x0 = 0
    const z0 = 2
    const x1 = 16
    const z1 = 14
    const samples = bottomSamplesAlong(field, x0, z0, x1, z1)
    const maxGap = maxSampleGap(x0, z0, x1, z1)
    expect(maxGap).toBeLessThan(TOLERANCE_M)
    expect(samples.some((s) => s.y < 1)).toBe(true)
    for (let i = 0; i < samples.length - 1; i++) {
      expect(samples[i + 1].u - samples[i].u).toBeLessThanOrEqual(0.25 + 1e-9)
    }
    const len = Math.hypot(x1 - x0, z1 - z0)
    expect(samples[samples.length - 1].u).toBeCloseTo(len, 9)
  })

  it('bottomSamplesAlong on crest (8,8)-(22,20) rises through storey datum', () => {
    const x0 = 8
    const z0 = 8
    const x1 = 22
    const z1 = 20
    const samples = bottomSamplesAlong(field, x0, z0, x1, z1)
    const maxGap = maxSampleGap(x0, z0, x1, z1)
    expect(maxGap).toBeLessThan(TOLERANCE_M)
    expect(samples.some((s) => s.y > 2.4)).toBe(true)
  })
})

import type { BufferGeometry } from 'three'
import { describe, expect, it } from 'vitest'
import { bilinearHeight, topYForBottom } from './heightfield'
import { buildDoubleSkinWall } from './mesh'

const TOLERANCE_M = 0.001

function vertexGaps(geometries: BufferGeometry[]): {
  maxGap: number
  minBottom: number
  maxBottom: number
  bottomCount: number
} {
  let maxGap = 0
  let minBottom = Infinity
  let maxBottom = -Infinity
  let bottomCount = 0
  for (const geometry of geometries) {
    const position = geometry.getAttribute('position')
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i)
      const y = position.getY(i)
      const z = position.getZ(i)
      const bottom = bilinearHeight(x, z)
      const top = topYForBottom(bottom)
      const bottomGap = Math.abs(y - bottom)
      const topGap = Math.abs(y - top)
      maxGap = Math.max(maxGap, Math.min(bottomGap, topGap))
      if (bottomGap <= topGap) {
        bottomCount += 1
        minBottom = Math.min(minBottom, y)
        maxBottom = Math.max(maxBottom, y)
      }
    }
  }
  return { maxGap, minBottom, maxBottom, bottomCount }
}

describe('terrain drape at grid-point samples with bilinear grade', () => {
  it('double-skin mesh on diagonal (0,2)-(16,14) meets the field within 1 mm', () => {
    const wall = buildDoubleSkinWall(0, 2, 16, 14)
    const gaps = vertexGaps(wall.leafGeometries)
    expect(gaps.bottomCount).toBeGreaterThan(4)
    expect(gaps.maxGap).toBeLessThan(TOLERANCE_M)
    expect(gaps.minBottom).toBeLessThan(1)
  })

  it('double-skin mesh on crest line (8,8)-(22,20) rises through the storey datum', () => {
    const wall = buildDoubleSkinWall(8, 8, 22, 20)
    const gaps = vertexGaps(wall.leafGeometries)
    expect(gaps.bottomCount).toBeGreaterThan(4)
    expect(gaps.maxGap).toBeLessThan(TOLERANCE_M)
    expect(gaps.maxBottom).toBeGreaterThan(2.4)
  })
})

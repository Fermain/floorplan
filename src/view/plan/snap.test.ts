import { describe, expect, it } from 'vitest'
import { fixturePlot } from '../../lib/plot/fixture'
import { nearestCorner, snapEndToModule, CORNER_SNAP_M } from './snap'
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
    const endX = 2 + 0.44 * 3 + 0.03
    const endZ = 2
    const out = snapEndToModule(plot, startX, startZ, endX, endZ, false)
    expect(out.x).toBeCloseTo(startX + 0.44 * 3, 5)
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
    const endZ = startZ + 0.44 * 14 + 0.03
    const out = snapEndToModule(plot, startX, startZ, endX, endZ, false)
    expect(out.z).toBeCloseTo(endZ, 5)
  })
})

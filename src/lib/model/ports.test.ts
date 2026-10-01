import { describe, expect, it } from 'vitest'
import { fixtureSpec } from './fixtures'
import { PORTS } from './ports'
import type { FixtureKind } from './types'

describe('plumbing connections', () => {
  it('sit behind their fitting, below head height, with hot left of cold', () => {
    for (const [kind, ports] of Object.entries(PORTS) as [FixtureKind, NonNullable<(typeof PORTS)[FixtureKind]>][]) {
      const half = fixtureSpec(kind).width / 2
      for (const port of ports) {
        expect(Math.abs(port.along), kind).toBeLessThanOrEqual(half)
        expect(port.y, kind).toBeGreaterThan(0)
        expect(port.y, kind).toBeLessThan(2)
      }
      const hot = ports.find((port) => port.kind === 'hot')
      const cold = ports.find((port) => port.kind === 'cold')
      if (hot && cold) expect(hot.along, kind).toBeLessThan(cold.along)
    }
  })
})

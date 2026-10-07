import { describe, expect, it } from 'vitest'
import { EXAMPLES } from '../examples'
import { addWallRing } from '../model/mutations'
import { fixtureDocument } from '../plot/fixture'
import { siteField } from './fixtures'
import { groundPad, ringDistance } from './pad'
import { buildServiceParts, runLength, serviceRuns } from './serviceRuns'
import { bilinearHeight } from './terrain'

describe('service runs', () => {
  it('are none for a house with no fittings', () => {
    const d = fixtureDocument()
    const doc = addWallRing(d, d.building.floors[0].id, [{ x: 4, z: 4 }, { x: 12, z: 4 }, { x: 12, z: 10 }, { x: 4, z: 10 }], 'double').document
    expect(serviceRuns(doc)).toEqual([])
    expect(buildServiceParts([])).toEqual([])
  })

  it('cover every trade in the examples, each run going somewhere and staying finite', async () => {
    for (const example of EXAMPLES) {
      const doc = await example.load()
      const runs = serviceRuns(doc)
      expect(runs.length, example.id).toBeGreaterThan(0)
      for (const run of runs) {
        expect(run.points.length, example.id).toBeGreaterThan(1)
        expect(run.points.flat().every(Number.isFinite), example.id).toBe(true)
        expect(runLength(run), example.id).toBeGreaterThan(0)
      }
      const kinds = new Set(runs.map((run) => run.kind))
      for (const kind of ['drain', 'cold', 'lights', 'plugs'] as const) expect(kinds.has(kind), `${example.id} ${kind}`).toBe(true)
      const parts = buildServiceParts(runs)
      expect(parts.map((part) => part.kind).sort()).toEqual([...kinds].sort())
      for (const part of parts) part.geometry.dispose()
    }
  })

  it('go underground between buildings, never through the air', async () => {
    for (const id of ['multi-generation', 'verulam']) {
      const doc = await EXAMPLES.find((example) => example.id === id)!.load()
      const rings = (groundPad(doc)?.structures ?? []).flatMap((structure) => structure.rings)
      const field = siteField(doc)
      // Well clear of every building, each point of each run is at or below the ground.
      const open = serviceRuns(doc).flatMap((run) => run.points.filter(([x, , z]) => rings.every((ring) => ringDistance(ring, x, z) > 2)))
      expect(open.length, id).toBeGreaterThan(0)
      for (const [x, y, z] of open) expect(y, `${id} at ${x.toFixed(1)}, ${z.toFixed(1)}`).toBeLessThanOrEqual(bilinearHeight(field, x, z) + 0.01)
    }
  })

  it('run the drain below the floor and the cables above the ceiling', async () => {
    const doc = await EXAMPLES.find((example) => example.id === 'multi-generation')!.load()
    const runs = serviceRuns(doc)
    const heights = (kind: string) => runs.filter((run) => run.kind === kind).flatMap((run) => run.points.map((point) => point[1]))
    // The drains end lower than they start; the lighting runs higher than any tap.
    expect(Math.min(...heights('drain'))).toBeLessThan(Math.min(...heights('lights')))
    expect(Math.max(...heights('lights'))).toBeGreaterThan(Math.max(...heights('drain')))
    expect(runs.some((run) => run.kind === 'hot')).toBe(true)
  })
})

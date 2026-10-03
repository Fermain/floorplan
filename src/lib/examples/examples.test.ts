import { describe, expect, it } from 'vitest'
import { electricalIssues } from '../geometry/electrical'
import { finishIssues } from '../geometry/finishes'
import { gasLayout } from '../geometry/gas'
import { gutterLayout } from '../geometry/gutters'
import { plumbingLayout } from '../geometry/plumbing'
import { powerLayout } from '../geometry/power'
import type { Document } from '../model/types'
import { isDocument } from '../state/projects'
import { EXAMPLES } from '.'

function warnings(doc: Document): string[] {
  return [...plumbingLayout(doc).issues, ...electricalIssues(doc), ...gasLayout(doc).issues, ...finishIssues(doc)].map((issue) => issue.text)
}

const byId = async (id: string) => EXAMPLES.find((example) => example.id === id)!.load()

describe('example projects', () => {
  it('each loads as a project, with nothing for the checks to warn about', async () => {
    for (const example of EXAMPLES) {
      const doc = await example.load()
      expect(isDocument(doc), example.id).toBe(true)
      expect(warnings(doc), example.id).toEqual([])
    }
  })

  it('the off-grid house runs on its own sun, rain and gas', async () => {
    const doc = await byId('eco-off-grid')
    const power = powerLayout(doc)
    expect(power.panels).toBe(20)
    expect(power.faces[0].facing).toBeGreaterThan(0.95)
    expect(power.batteryModules).toBeGreaterThan(0)
    expect(gutterLayout(doc).downpipes.filter((pipe) => pipe.tank)).toHaveLength(2)
    expect(plumbingLayout(doc).septic).not.toBeNull()
    expect(gasLayout(doc).runs.length).toBeGreaterThan(0)
  })

  it('the granny flat sits under the main house, with a stair between them', async () => {
    const doc = await byId('granny-flat')
    const [ground, upper] = [0, 1].map((index) => doc.building.floors.find((floor) => floor.index === index)!)
    expect(ground.stairs).toHaveLength(1)
    expect((ground.spaces ?? []).some((space) => space.name.startsWith('Flat'))).toBe(true)
    expect((upper.spaces ?? []).filter((space) => space.type === 'bedroom')).toHaveLength(2)
    const twice = doc.plot.ring.reduce((sum, [x, z], i) => {
      const [nx, nz] = doc.plot.ring[(i + 1) % doc.plot.ring.length]
      return sum + x * nz - nx * z
    }, 0)
    expect(Math.abs(twice) / 2).toBeCloseTo(2025, 0)
  })

  it('the city house fits its narrow stand', async () => {
    const doc = await byId('tight-urban')
    const xs = doc.building.floors.flatMap((floor) => floor.corners.map((corner) => corner.x))
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0.5)
    expect(Math.max(...xs)).toBeLessThanOrEqual(7)
    expect(doc.building.floors.filter((floor) => floor.walls.length > 0)).toHaveLength(2)
  })
})

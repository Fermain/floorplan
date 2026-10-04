import { describe, expect, it } from 'vitest'
import { electricalIssues } from '../geometry/electrical'
import { counterIssues } from '../geometry/counters'
import { finishIssues } from '../geometry/finishes'
import { gasLayout } from '../geometry/gas'
import { gutterLayout } from '../geometry/gutters'
import { plumbingLayout } from '../geometry/plumbing'
import { powerLayout } from '../geometry/power'
import { buildingChecks } from '../geometry/sans'
import { layoutSpaces } from '../geometry/spaces'
import type { Document } from '../model/types'
import { isDocument } from '../state/projects'
import { EXAMPLES } from '.'

function warnings(doc: Document): string[] {
  return [...plumbingLayout(doc).issues, ...electricalIssues(doc), ...gasLayout(doc).issues, ...finishIssues(doc), ...counterIssues(doc)].map((issue) => issue.text)
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

  it('the multi generation farmhouse has three dwellings, a garage and two carports, with a roof over each building', async () => {
    const doc = await byId('multi-generation')
    const ground = doc.building.floors.find((floor) => floor.index === 0)!
    expect(doc.building.floors.filter((floor) => floor.roof)).toHaveLength(4)
    expect(doc.carports).toHaveLength(2)
    expect((ground.spaces ?? []).filter((space) => space.type === 'kitchen')).toHaveLength(3)
    expect((ground.spaces ?? []).filter((space) => space.type === 'garage')).toHaveLength(1)
    expect(buildingChecks(doc).rooms.every((room) => room.ok)).toBe(true)
    expect(powerLayout(doc).panels).toBe(16)
    expect(doc.paving).toHaveLength(5)
    expect(ground.walls.some((wall) => wall.finish)).toBe(true)
  })

  it('the Verulam stand is 2,023 m², with the main house a terrace above the cottage', async () => {
    const doc = await byId('verulam')
    const [wide, deep] = doc.plot.ring[2]
    expect(wide * deep).toBeCloseTo(2023, -1)
    const ground = doc.building.floors.find((floor) => floor.index === 0)!
    const field = doc.heightfield
    const level = (x: number, z: number) => field.heights[Math.round(z - field.originZ) * field.cols + Math.round(x - field.originX)]
    // The cottage's lawn and the main house's terrace, with the bank between them.
    expect(level(14, 26)).toBeCloseTo(3.6, 1)
    expect(level(28, 37)).toBeCloseTo(6.4, 1)
    expect(doc.plot.roads ?? []).toEqual([])
    expect((ground.spaces ?? []).map((space) => space.name)).toEqual(expect.arrayContaining(['Kitchenette', 'Living', 'Bedroom', 'En suite', 'Deck', 'Lounge', 'Kitchen', 'Bedroom 1', 'Bedroom 2', 'Guest room', 'Bathroom', 'Corridor', 'Storage', 'Patio']))
    expect(doc.carports?.map((carport) => [carport.bays, carport.roof])).toEqual([[2, 'shade-cloth'], [2, 'shade-cloth']])
    expect(doc.building.floors.filter((floor) => floor.roof)).toHaveLength(2)
    // One long eave down each side of the main house's gable: a downpipe at each end, not one at every room.
    const mainRoof = doc.building.floors.filter((floor) => floor.roof?.form === 'gable').at(-1)!
    expect(gutterLayout(doc).downpipes.filter((pipe) => pipe.roofFloorId === mainRoof.id).length).toBeLessThanOrEqual(6)
    expect(buildingChecks(doc).rooms.every((room) => room.ok)).toBe(true)
    // The boundary fence does not close, so it makes no room, and nothing else is left over.
    expect(layoutSpaces(ground).loose).toEqual([])
    // Every wall stays on the stand.
    for (const corner of ground.corners) {
      expect(corner.x).toBeGreaterThan(0)
      expect(corner.x).toBeLessThan(wide)
      expect(corner.z).toBeGreaterThan(0)
      expect(corner.z).toBeLessThan(deep)
    }
  })

  it('the city house fits its narrow stand', async () => {
    const doc = await byId('tight-urban')
    const xs = doc.building.floors.flatMap((floor) => floor.corners.map((corner) => corner.x))
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0.5)
    expect(Math.max(...xs)).toBeLessThanOrEqual(7)
    expect(doc.building.floors.filter((floor) => floor.walls.length > 0)).toHaveLength(2)
  })
})

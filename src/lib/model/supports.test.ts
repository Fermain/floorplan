import { describe, expect, it } from 'vitest'
import { fixtureDocument } from '../plot/fixture'
import { buildPillarParts } from '../geometry/pillars'
import { takeoff } from '../cost/quantities'
import { addWallRing, setSupport } from './mutations'
import { wallSystem } from './systems'
import {
  defaultSupport,
  evenPositions,
  floorSupports,
  pierCourses,
  pierUnitsPerCourse,
  SUPPORT_HEIGHT_M,
  SUPPORTS,
} from './supports'
import type { Document, WallSkin } from './types'

function ring(skin: WallSkin): Document {
  const d = fixtureDocument()
  const r = addWallRing(
    d,
    d.building.floors[0].id,
    [
      { x: 4, z: 4 },
      { x: 10, z: 4 },
      { x: 10, z: 8 },
      { x: 4, z: 8 },
    ],
    skin,
  )
  expect(r.ok).toBe(true)
  return r.document
}

function supported(type: Parameters<typeof defaultSupport>[0]): Document {
  let d = ring('logical')
  const floor = d.building.floors[0]
  for (const wall of floor.walls) d = setSupport(d, floor.id, wall.id, defaultSupport(type)).document
  return d
}

describe('supports', () => {
  it('spaces supports evenly with one at each end', () => {
    expect(evenPositions(6, 2.4)).toEqual([0, 2, 4, 6])
    expect(evenPositions(2, 3)).toEqual([0, 2])
  })

  it('stands one support at each corner where supported walls meet', () => {
    const d = supported('column')
    const spots = floorSupports(d.building.floors[0])
    // 6 m sides take 3 bays, 4 m sides take 2: 3 + 2 + 3 + 2 bays round a closed ring.
    expect(spots).toHaveLength(10)
  })

  it('only goes on logical walls, with a known type and sensible spacing', () => {
    const built = ring('double')
    const floor = built.building.floors[0]
    expect(setSupport(built, floor.id, floor.walls[0].id, defaultSupport('steel')).ok).toBe(false)
    const d = ring('logical')
    const id = d.building.floors[0].walls[0].id
    expect(setSupport(d, floor.id, id, { type: 'marble' as never, spacing: 2 }).ok).toBe(false)
    expect(setSupport(d, floor.id, id, { type: 'steel', spacing: 0.2 }).ok).toBe(false)
    const set = setSupport(d, floor.id, id, { type: 'steel', spacing: 2 })
    expect(set.ok).toBe(true)
    const cleared = setSupport(set.document, floor.id, id, null)
    expect('support' in cleared.document.building.floors[0].walls[0]).toBe(false)
  })

  it('builds every type from its base up to the wall head', () => {
    for (const spec of SUPPORTS) {
      const parts = buildPillarParts(spec.id, [{ x: 1, z: 2, dir: { x: 0, z: 1 } }], wallSystem('block-140'), 3)
      expect(parts.length).toBeGreaterThan(0)
      let top = -Infinity
      for (const part of parts) {
        part.geometry.computeBoundingBox()
        const box = part.geometry.boundingBox!
        expect(box.min.y).toBeGreaterThanOrEqual(3 - 1e-6)
        top = Math.max(top, box.max.y)
        part.geometry.dispose()
      }
      expect(top).toBeCloseTo(3 + SUPPORT_HEIGHT_M, 3)
    }
  })

  it('prices supports each, lays piers in the project block, and pads them on the ground', () => {
    const columns = takeoff(supported('column'))
    expect(columns.find((line) => line.id === 'support:column')?.quantity).toBe(10)
    expect(columns.find((line) => line.id === 'support-bases')?.quantity).toBeGreaterThan(0)

    const piers = supported('pier')
    const system = wallSystem(piers.building.wallSystemId)
    const units = takeoff(piers).find((line) => line.id === `unit:${system.unitKey}`)
    const count = floorSupports(piers.building.floors[0]).length
    expect(count).toBe(8)
    expect(units?.quantity).toBe(Math.ceil(count * pierCourses(system) * pierUnitsPerCourse(system) * 1.05))
  })
})

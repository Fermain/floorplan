import { describe, expect, it } from 'vitest'
import { addWallRing } from '../model/mutations'
import type { Document } from '../model/types'
import { fixtureDocument } from '../plot/fixture'
import { groundLine, GROUND_LINE_RUN_M } from './groundLine'

// A house from (4, 4) to (12, 10) on ground that climbs 100 mm a metre to the east.
function house(): Document {
  const d = fixtureDocument()
  const field = d.heightfield
  const heights = field.heights.map((_, i) => (field.originX + (i % field.cols) * field.cellSize) * 0.1)
  const sloped = { ...d, heightfield: { ...field, heights } }
  return addWallRing(sloped, sloped.building.floors[0].id, [{ x: 4, z: 4 }, { x: 12, z: 4 }, { x: 12, z: 10 }, { x: 4, z: 10 }], 'double').document
}

describe('the ground line along a wall', () => {
  it('is level under the house, where the pad has been cut into the slope and filled over it', () => {
    const doc = house()
    const floor = doc.building.floors[0]
    const south = floor.walls.find((wall) => [wall.startCornerId, wall.endCornerId].every((id) => floor.corners.find((corner) => corner.id === id)!.z === 4))!
    const line = groundLine(doc, floor, south)!
    expect(line.finished[0][0]).toBeCloseTo(-GROUND_LINE_RUN_M)
    expect(line.finished.at(-1)![0]).toBeCloseTo(8 + GROUND_LINE_RUN_M)
    // Along the wall the finished ground is the level the wall stands on.
    expect(line.lowest).toBeCloseTo(0, 6)
    expect(line.highest).toBeCloseTo(0, 6)
    // The natural ground climbs 800 mm along it, so one end was cut and the other filled.
    const along = line.natural.filter(([u]) => u >= 0 && u <= 8).map(([, v]) => v)
    expect(Math.max(...along) - Math.min(...along)).toBeCloseTo(0.8, 1)
    expect(line.cut).toBeGreaterThan(0.1)
    expect(line.fill).toBeGreaterThan(0.1)
    expect(line.cut + line.fill).toBeCloseTo(0.8, 1)
  })

  it('is not drawn for a wall upstairs', () => {
    const doc = house()
    expect(groundLine(doc, { ...doc.building.floors[0], index: 1 }, doc.building.floors[0].walls[0])).toBeNull()
  })
})

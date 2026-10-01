import { describe, expect, it } from 'vitest'
import { fixtureDocument } from '../plot/fixture'
import { addOpening, addWallRing } from '../model/mutations'
import { fixtureFootprint } from '../model/fixtures'
import type { Document, Floor } from '../model/types'
import { floorCells, cellAt } from './spaces'
import { pointInRing } from './pad'
import { suggestRoomFixtures } from './suggest'

function house(): Document {
  let d = fixtureDocument()
  const id = d.building.floors[0].id
  d = addWallRing(d, id, [{ x: 4, z: 4 }, { x: 10, z: 4 }, { x: 10, z: 8 }, { x: 4, z: 8 }], 'double').document
  d = addWallRing(d, id, [{ x: 7, z: 4 }, { x: 10, z: 4 }, { x: 10, z: 8 }, { x: 7, z: 8 }], 'double').document
  return d
}

function wallBetween(floor: Floor, x0: number, z0: number, x1: number, z1: number) {
  return floor.walls.find((wall) => {
    const a = floor.corners.find((c) => c.id === wall.startCornerId)!
    const b = floor.corners.find((c) => c.id === wall.endCornerId)!
    return (a.x === x0 && a.z === z0 && b.x === x1 && b.z === z1) || (a.x === x1 && a.z === z1 && b.x === x0 && b.z === z0)
  })!
}

describe('suggested fittings', () => {
  it('lights, switches and sockets a bedroom, and keeps everything inside it', () => {
    let doc = house()
    const floor = doc.building.floors[0]
    doc = addOpening(doc, floor.id, wallBetween(floor, 7, 4, 7, 8).id, 'internal-door', 1, 0.8).document
    const ground = doc.building.floors[0]
    const cells = floorCells(ground)
    const bedroom = cellAt(cells, 5, 6)!
    const drafts = suggestRoomFixtures(doc, ground, bedroom, 'bedroom', cells)
    const kinds = drafts.map((d) => d.kind).sort()
    expect(kinds).toEqual(['light', 'socket', 'socket', 'switch'])
    for (const draft of drafts.filter((d) => d.kind !== 'light')) {
      expect(fixtureFootprint(draft).every((p) => pointInRing(bedroom.net, p.x, p.z))).toBe(true)
    }
  })

  it('fits out a bathroom with a geyser and an extractor when it has no window', () => {
    const doc = house()
    const ground = doc.building.floors[0]
    const cells = floorCells(ground)
    const bath = cellAt(cells, 8.5, 6)!
    const kinds = suggestRoomFixtures(doc, ground, bath, 'bathroom', cells).map((d) => d.kind)
    for (const kind of ['light', 'wc', 'basin', 'geyser', 'extractor'] as const) expect(kinds).toContain(kind)
    expect(kinds.includes('bath') || kinds.includes('shower')).toBe(true)
  })
})

describe('suggestions around what is already there', () => {
  it('keeps fittings off the stretch of wall a stair runs along', async () => {
    const { addStair, addStorey } = await import('../model/mutations')
    let doc = house()
    const ground = doc.building.floors[0]
    doc = addStorey(doc, ground.id, ground.corners[0].id).document
    const placed = addStair(doc, doc.building.floors[0].id, 4.6, 4.2, 0, 1, 0.9)
    expect(placed.ok).toBe(true)
    doc = placed.document
    const floor = doc.building.floors[0]
    const cells = floorCells(floor)
    const room = cellAt(cells, 5, 6)!
    const stair = floor.stairs![0]
    const drafts = suggestRoomFixtures(doc, floor, room, 'living', cells).filter((d) => d.kind === 'socket')
    expect(drafts.length).toBeGreaterThan(0)
    for (const draft of drafts) {
      const alongStair = Math.abs(draft.x - stair.x) < 0.6 && draft.z > stair.z - 0.1 && draft.z < stair.z + 3.4
      expect(alongStair).toBe(false)
    }
  })
})

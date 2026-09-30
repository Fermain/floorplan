import { describe, expect, it } from 'vitest'
import { addStair, addStorey, addWallRing, removeStair, updateStair } from '../model/mutations'
import type { Document } from '../model/types'
import { FLOOR_TO_FLOOR, fixtureDocument } from '../plot/fixture'
import { deckPolygons } from './deck'
import { SURFACE_BED_TOP_ABOVE_DATUM_M } from './pad'
import { MAX_RISER_M, MIN_GOING_M, stairConcreteM3, stairLayout, stairVoids } from './stairs'

function house(storeys: boolean): Document {
  const d = fixtureDocument()
  const fid = d.building.floors[0].id
  let doc = addWallRing(
    d,
    fid,
    [
      { x: 2, z: 4 },
      { x: 12, z: 4 },
      { x: 12, z: 10 },
      { x: 2, z: 10 },
    ],
    'double',
  ).document
  if (storeys) {
    const corner = doc.building.floors[0].corners[0].id
    const added = addStorey(doc, fid, corner)
    expect(added.ok).toBe(true)
    doc = added.document
  }
  return doc
}

describe('stairs', () => {
  it('splits the climb from the ground floor into equal risers no higher than 200 mm', () => {
    const layout = stairLayout({ id: 's', x: 0, z: 0, dx: 1, dz: 0, width: 0.9 }, 0)
    expect(layout.rise).toBeCloseTo(FLOOR_TO_FLOOR - SURFACE_BED_TOP_ABOVE_DATUM_M, 9)
    expect(layout.riser).toBeLessThanOrEqual(MAX_RISER_M)
    expect(layout.riser * layout.risers).toBeCloseTo(layout.rise, 9)
    expect(layout.risers).toBe(14)
    expect(layout.treads).toBe(13)
    expect(layout.going).toBe(MIN_GOING_M)
    expect(layout.length).toBeCloseTo(13 * 0.25, 9)
    expect(layout.steps.at(-1)!.top).toBeCloseTo(FLOOR_TO_FLOOR - layout.riser, 9)
  })

  it('climbs a full storey height between upper floors', () => {
    const layout = stairLayout({ id: 's', x: 0, z: 0, dx: 0, dz: 1, width: 0.9 }, 1)
    expect(layout.rise).toBeCloseTo(FLOOR_TO_FLOOR, 9)
    expect(layout.risers).toBe(15)
  })

  it('needs a storey above it', () => {
    const doc = house(false)
    const r = addStair(doc, doc.building.floors[0].id, 3, 7, 1, 0)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('add a storey above the stair first')
  })

  it('must fit inside a room', () => {
    const doc = house(true)
    const r = addStair(doc, doc.building.floors[0].id, 10, 7, 1, 0)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('stair must fit inside one room')
  })

  it('cuts a void in the slab above it', () => {
    let doc = house(true)
    const ground = doc.building.floors[0]
    const placed = addStair(doc, ground.id, 3, 7, 1, 0)
    expect(placed.ok).toBe(true)
    doc = placed.document
    const upper = doc.building.floors.find((floor) => floor.index === 1)!
    const voids = stairVoids(doc, upper)
    expect(voids).toHaveLength(1)
    const [deck] = deckPolygons(upper, voids)
    expect(deck.holes).toHaveLength(1)
  })

  it('refuses to widen a stair past the walls, and removes it', () => {
    let doc = house(true)
    const fid = doc.building.floors[0].id
    const placed = addStair(doc, fid, 3, 4.7, 1, 0)
    expect(placed.ok).toBe(true)
    doc = placed.document
    const id = doc.building.floors[0].stairs![0].id
    expect(updateStair(doc, fid, id, { width: 2 }).ok).toBe(false)
    expect(updateStair(doc, fid, id, { width: 1 }).ok).toBe(true)
    doc = removeStair(doc, fid, id).document
    expect(doc.building.floors[0].stairs).toEqual([])
  })

  it('estimates a waisted concrete flight', () => {
    const volume = stairConcreteM3({ id: 's', x: 0, z: 0, dx: 1, dz: 0, width: 1 }, 0)
    expect(volume).toBeGreaterThan(0.6)
    expect(volume).toBeLessThan(1)
  })
})

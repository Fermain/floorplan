import { describe, expect, it } from 'vitest'
import { roofFacesForFloor } from '../geometry/roof'
import { fixtureDocument } from '../plot/fixture'
import { addCorner, addStorey, addWall, addWallRing, nameCell, setRoof, updateSpace } from './mutations'
import { roomsUnder } from './stories'
import type { Document } from './types'

const ground = (doc: Document) => doc.building.floors.find((floor) => floor.index === 0)!
const top = (doc: Document) => doc.building.floors.find((floor) => floor.index === 1)!

// A house from (4, 4) to (12, 10) with a deck from x = 9 to 12 marked off by a wall, under one hipped roof.
function house(): Document {
  let d = fixtureDocument()
  const fid = ground(d).id
  d = addWallRing(d, fid, [{ x: 4, z: 4 }, { x: 12, z: 4 }, { x: 12, z: 10 }, { x: 4, z: 10 }], 'double').document
  const ids: string[] = []
  for (const [x, z] of [[9, 4], [9, 10]]) {
    d = addCorner(d, fid, x, z).document
    ids.push(ground(d).corners.at(-1)!.id)
  }
  d = addWall(d, fid, ids[0], ids[1], 'single').document
  d = nameCell(d, fid, 6, 7, 'Living', 'living').document
  d = nameCell(d, fid, 10.5, 7, 'Deck', 'other').document
  d = addStorey(d, fid, ground(d).corners[0].id).document
  return setRoof(d, top(d).id, { pitchDeg: 20, eaves: 0.3, form: 'hip', covering: 'concrete-tile' }).document
}

const reach = (doc: Document) => {
  const xs = roofFacesForFloor(top(doc), top(doc).roof!).flat().map((vertex) => vertex.x)
  return [Math.min(...xs), Math.max(...xs)]
}

describe('a room open to the sky', () => {
  it('is left out from under the roof, and comes back under it when it is closed again', () => {
    let doc = house()
    expect(top(doc).outline).toHaveLength(2)
    expect(reach(doc)[1]).toBeGreaterThan(12)
    const deck = ground(doc).spaces!.find((space) => space.name === 'Deck')!
    doc = updateSpace(doc, ground(doc).id, deck.id, { open: true }).document
    expect(top(doc).outline).toHaveLength(1)
    // The roof now stops over the wall at x = 9, a little past it for the eaves.
    expect(reach(doc)[1]).toBeLessThan(10)
    expect(reach(doc)[0]).toBeLessThan(4)
    doc = updateSpace(doc, ground(doc).id, deck.id, { open: false }).document
    expect(top(doc).outline).toHaveLength(2)
  })

  it('is still listed among the rooms under the roof, so it can be closed again from there', () => {
    let doc = house()
    const deck = ground(doc).spaces!.find((space) => space.name === 'Deck')!
    doc = updateSpace(doc, ground(doc).id, deck.id, { open: true }).document
    expect(roomsUnder(doc, top(doc)).map((room) => room.space.name).sort()).toEqual(['Deck', 'Living'])
  })
})

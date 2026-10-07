import { describe, expect, it } from 'vitest'
import { roofFacesForFloor } from '../geometry/roof'
import { fixtureDocument } from '../plot/fixture'
import { addCorner, addStorey, addWall, addWallRing, nameCell, setRoof, updateSpace } from './mutations'
import { layAngle } from '../geometry/spaces'
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

  it('is what a deck is from the start: boarded, and left out from under the roof', () => {
    let doc = house()
    const fid = ground(doc).id
    const other = ground(doc).spaces!.find((space) => space.name === 'Deck')!
    expect(other.open).toBeUndefined()
    // Turned into a deck, the room is opened and boarded; turned back, it stays as it was left.
    doc = updateSpace(doc, fid, other.id, { type: 'deck' }).document
    expect(ground(doc).spaces!.find((space) => space.id === other.id)).toMatchObject({ type: 'deck', open: true, finish: 'timber' })
    expect(top(doc).outline).toHaveLength(1)
    // Named as a deck in the first place, it starts that way.
    const fresh = nameCell(house(), fid, 10.5, 7, 'Back deck', 'deck').document
    expect(ground(fresh).spaces!.find((space) => space.name === 'Back deck')).toMatchObject({ open: true, finish: 'timber' })
    // A deck can still be roofed over by unticking it.
    doc = updateSpace(doc, fid, other.id, { open: false }).document
    expect(top(doc).outline).toHaveLength(2)
  })

  it('lays its boards along its longest wall', () => {
    expect(layAngle([{ x: 0, z: 0 }, { x: 6, z: 0 }, { x: 6, z: 3 }, { x: 0, z: 3 }])).toBeCloseTo(0, 6)
    expect(layAngle([{ x: 0, z: 0 }, { x: 3, z: 0 }, { x: 3, z: 6 }, { x: 0, z: 6 }])).toBeCloseTo(Math.PI / 2, 6)
    // Turned 30 degrees, and the same whichever way round the outline is drawn.
    const turn = (x: number, z: number) => ({ x: x * Math.cos(Math.PI / 6) - z * Math.sin(Math.PI / 6), z: x * Math.sin(Math.PI / 6) + z * Math.cos(Math.PI / 6) })
    const ring = [turn(0, 0), turn(6, 0), turn(6, 3), turn(0, 3)]
    expect(layAngle(ring)).toBeCloseTo(Math.PI / 6, 6)
    expect(layAngle([...ring].reverse())).toBeCloseTo(Math.PI / 6, 6)
  })

  it('is still listed among the rooms under the roof, so it can be closed again from there', () => {
    let doc = house()
    const deck = ground(doc).spaces!.find((space) => space.name === 'Deck')!
    doc = updateSpace(doc, ground(doc).id, deck.id, { open: true }).document
    expect(roomsUnder(doc, top(doc)).map((room) => room.space.name).sort()).toEqual(['Deck', 'Living'])
  })
})

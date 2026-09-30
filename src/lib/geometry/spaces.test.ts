import { describe, expect, it } from 'vitest'
import { addCorner, addWall, addWallRing, joinCell, leaveCell, moveCorners, nameCell, updateSpace } from '../model/mutations'
import type { Document } from '../model/types'
import { fixtureDocument } from '../plot/fixture'
import { layoutSpaces } from './spaces'

function house(systemId: 'clay-cavity' | 'block-140' = 'clay-cavity'): Document {
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
    'double',
    systemId,
  )
  expect(r.ok).toBe(true)
  return r.document
}

function divided(doc: Document): Document {
  const floor = doc.building.floors[0]
  const west = (z: number) => floor.corners.find((c) => c.x === 4 && c.z === z)!.id
  const r = addWallRing(
    doc,
    floor.id,
    [
      { x: 7, z: 4 },
      { x: 7, z: 8 },
      { x: 4, z: 8, cornerId: west(8) },
      { x: 4, z: 4, cornerId: west(4) },
    ],
    'logical',
  )
  expect(r.ok).toBe(true)
  return r.document
}

describe('rooms', () => {
  it('measures the floor inside the walls, not to their centre lines', () => {
    let doc = house()
    const fid = doc.building.floors[0].id
    doc = nameCell(doc, fid, 5, 5, 'Living', 'living').document
    const [living] = layoutSpaces(doc.building.floors[0]).spaces
    const inner = (6 - 2 * 0.131) * (4 - 2 * 0.131)
    expect(living.area).toBeCloseTo(inner, 6)
  })

  it('follows the wall system, so a thinner wall gives more floor', () => {
    let doc = house('block-140')
    doc = nameCell(doc, doc.building.floors[0].id, 5, 5, 'Living', 'living').document
    const [living] = layoutSpaces(doc.building.floors[0]).spaces
    expect(living.area).toBeCloseTo((6 - 0.14) * (4 - 0.14), 6)
  })

  it('joins two parts split by a logical wall into one room', () => {
    let doc = divided(house())
    const fid = doc.building.floors[0].id
    expect(layoutSpaces(doc.building.floors[0]).loose).toHaveLength(2)
    doc = nameCell(doc, fid, 5, 5, 'Open plan', 'living').document
    const id = doc.building.floors[0].spaces![0].id
    doc = joinCell(doc, fid, id, 9, 5).document
    const layout = layoutSpaces(doc.building.floors[0])
    expect(layout.spaces).toHaveLength(1)
    expect(layout.spaces[0].cells).toHaveLength(2)
    expect(layout.loose).toHaveLength(0)
    const whole = (6 - 2 * 0.131) * (4 - 2 * 0.131)
    expect(layout.spaces[0].area).toBeCloseTo(whole, 6)
  })

  it('moves a part from one room to another rather than sharing it', () => {
    let doc = divided(house())
    const fid = doc.building.floors[0].id
    doc = nameCell(doc, fid, 5, 5, 'Kitchen', 'kitchen').document
    doc = nameCell(doc, fid, 9, 5, 'Lounge', 'living').document
    const kitchen = doc.building.floors[0].spaces!.find((s) => s.name === 'Kitchen')!
    doc = joinCell(doc, fid, kitchen.id, 9, 6).document
    const layout = layoutSpaces(doc.building.floors[0])
    expect(layout.spaces.map((s) => s.space.name)).toEqual(['Kitchen'])
    expect(layout.spaces[0].cells).toHaveLength(2)
  })

  it('lets a part leave its room, and forgets a room with no parts', () => {
    let doc = house()
    const fid = doc.building.floors[0].id
    doc = nameCell(doc, fid, 5, 5, 'Store', 'store').document
    doc = leaveCell(doc, fid, 6, 6).document
    expect(doc.building.floors[0].spaces).toEqual([])
    expect(layoutSpaces(doc.building.floors[0]).loose).toHaveLength(1)
  })

  it('keeps its room when the walls around it move', () => {
    let doc = house()
    const fid = doc.building.floors[0].id
    doc = nameCell(doc, fid, 5, 5, 'Bedroom 1', 'bedroom').document
    const east = doc.building.floors[0].corners.filter((c) => c.x === 10).map((c) => c.id)
    doc = moveCorners(doc, fid, east, 1, 0).document
    const [bedroom] = layoutSpaces(doc.building.floors[0]).spaces
    expect(bedroom.space.name).toBe('Bedroom 1')
    expect(bedroom.area).toBeCloseTo((7 - 2 * 0.131) * (4 - 2 * 0.131), 6)
  })

  it('renames and retypes a room, and refuses a blank name', () => {
    let doc = house()
    const fid = doc.building.floors[0].id
    doc = nameCell(doc, fid, 5, 5, 'Room', 'other').document
    const id = doc.building.floors[0].spaces![0].id
    doc = updateSpace(doc, fid, id, { name: ' Main bedroom ', type: 'bedroom', finish: 'timber' }).document
    expect(doc.building.floors[0].spaces![0]).toMatchObject({ name: 'Main bedroom', type: 'bedroom', finish: 'timber' })
    expect(updateSpace(doc, fid, id, { name: '  ' }).ok).toBe(false)
  })

  it('refuses to name a spot outside every room', () => {
    const doc = house()
    expect(nameCell(doc, doc.building.floors[0].id, 1, 1, 'Yard', 'other').ok).toBe(false)
  })

  it('does not find a room inside a wall that is not closed', () => {
    let doc = fixtureDocument()
    const fid = doc.building.floors[0].id
    doc = addCorner(doc, fid, 4, 4).document
    doc = addCorner(doc, fid, 8, 4).document
    const [a, b] = doc.building.floors[0].corners
    doc = addWall(doc, fid, a.id, b.id, 'double').document
    expect(layoutSpaces(doc.building.floors[0])).toEqual({ spaces: [], loose: [] })
    expect(nameCell(doc, fid, 6, 5, 'Nowhere', 'other').ok).toBe(false)
  })
})

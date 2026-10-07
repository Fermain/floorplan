import { describe, expect, it } from 'vitest'
import { fixtureDocument } from '../plot/fixture'
import { wallLength } from './geom'
import { addCorner, addOpening, addWall, addWallRing, cornerRemoval, removeCorner } from './mutations'
import type { Document } from './types'

const floorOf = (doc: Document) => doc.building.floors[0]
const at = (doc: Document, x: number, z: number) => floorOf(doc).corners.find((corner) => Math.hypot(corner.x - x, corner.z - z) < 1e-6)

// One wall from point to point, joining corners that are already there.
function line(doc: Document, a: [number, number], b: [number, number], skin: 'single' | 'logical' = 'single'): Document {
  const fid = floorOf(doc).id
  const ids: string[] = []
  for (const [x, z] of [a, b]) {
    const near = at(doc, x, z)
    if (near) ids.push(near.id)
    else {
      doc = addCorner(doc, fid, x, z).document
      ids.push(floorOf(doc).corners.at(-1)!.id)
    }
  }
  const added = addWall(doc, fid, ids[0], ids[1], skin)
  if (!added.ok) throw new Error(added.reason)
  return added.document
}

// A room from (4, 4) to (12, 10).
function room(): Document {
  const d = fixtureDocument()
  return addWallRing(d, floorOf(d).id, [{ x: 4, z: 4 }, { x: 12, z: 4 }, { x: 12, z: 10 }, { x: 4, z: 10 }], 'double').document
}

describe('deleting a corner', () => {
  it('takes a dangling wall with it', () => {
    let doc = line(room(), [12, 7], [15, 7])
    const end = at(doc, 15, 7)!
    expect(cornerRemoval(floorOf(doc), end.id)).toMatchObject({ kind: 'end' })
    const walls = floorOf(doc).walls.length
    doc = removeCorner(doc, floorOf(doc).id, end.id).document
    expect(floorOf(doc).walls).toHaveLength(walls - 1)
    expect(at(doc, 15, 7)).toBeUndefined()
    // The corner it sprang from stays, as the room's walls still meet there.
    expect(at(doc, 12, 7)).toBeDefined()
  })

  it('joins two walls of one kind in a straight line into one, keeping their openings where they stood', () => {
    // Two walls in a line from (13, 12) through (16, 12) to (19, 12), the second drawn back towards the first.
    let doc = line(room(), [13, 12], [16, 12])
    doc = line(doc, [19, 12], [16, 12])
    const fid = floorOf(doc).id
    const [first, second] = floorOf(doc).walls.slice(-2)
    doc = addOpening(doc, fid, first.id, 'window', 1, 1).document
    doc = addOpening(doc, fid, second.id, 'window', 0.5, 1).document
    const middle = at(doc, 16, 12)!
    expect(cornerRemoval(floorOf(doc), middle.id)).toMatchObject({ kind: 'join' })
    const count = floorOf(doc).walls.length
    const joined = removeCorner(doc, fid, middle.id)
    expect(joined.ok).toBe(true)
    doc = joined.document
    expect(floorOf(doc).walls).toHaveLength(count - 1)
    expect(at(doc, 16, 12)).toBeUndefined()
    const wall = floorOf(doc).walls.find((item) => item.id === first.id)!
    expect(wallLength(floorOf(doc).corners, wall.startCornerId, wall.endCornerId)).toBeCloseTo(6, 6)
    // The first window is still 1 m from x = 13; the second, 0.5 m in from x = 19, is now 4.5 m along.
    expect(wall.openings.map((opening) => opening.u).sort((a, b) => a - b)).toEqual([1, 4.5])
  })

  it('does not join walls of different kinds, or walls that meet at an angle: those all go', () => {
    let doc = line(room(), [13, 12], [16, 12])
    doc = line(doc, [16, 12], [19, 12], 'logical')
    let middle = at(doc, 16, 12)!
    expect(cornerRemoval(floorOf(doc), middle.id)).toMatchObject({ kind: 'junction' })
    const before = floorOf(doc).walls.length
    doc = removeCorner(doc, floorOf(doc).id, middle.id).document
    expect(floorOf(doc).walls).toHaveLength(before - 2)
    // A corner of the room: two walls at a right angle.
    const corner = at(doc, 4, 4)!
    expect(cornerRemoval(floorOf(doc), corner.id)).toMatchObject({ kind: 'junction', wallIds: expect.arrayContaining([expect.any(String)]) })
    doc = removeCorner(doc, floorOf(doc).id, corner.id).document
    expect(floorOf(doc).walls).toHaveLength(2)
    expect(at(doc, 4, 4)).toBeUndefined()
    middle = at(doc, 12, 10)!
    expect(removeCorner(doc, floorOf(doc).id, 'nothing').ok).toBe(false)
    expect(middle).toBeDefined()
  })

  it('takes every wall at a junction of three', () => {
    let doc = line(room(), [12, 7], [15, 7])
    const tee = at(doc, 12, 7)!
    const removal = cornerRemoval(floorOf(doc), tee.id)!
    expect(removal.kind).toBe('junction')
    expect(removal.wallIds).toHaveLength(3)
    const before = floorOf(doc).walls.length
    doc = removeCorner(doc, floorOf(doc).id, tee.id).document
    expect(floorOf(doc).walls).toHaveLength(before - 3)
  })
})

import { describe, expect, it } from 'vitest'
import { fixtureDocument } from '../plot/fixture'
import { addCorner, addWall } from './mutations'
import { deriveRooms } from './rooms'

describe('rooms from walls', () => {
  it('makes no room of a run of walls that does not close', () => {
    // A fence along three sides of a yard, with the fourth left open.
    let doc = fixtureDocument()
    const fid = doc.building.floors[0].id
    const points = [[2, 2], [2, 12], [12, 12], [12, 2.5]]
    for (const [x, z] of points) doc = addCorner(doc, fid, x, z).document
    const ids = doc.building.floors[0].corners.map((corner) => corner.id)
    for (let i = 0; i < ids.length - 1; i++) {
      const added = addWall(doc, fid, ids[i], ids[i + 1], 'logical')
      expect(added.ok).toBe(true)
      doc = added.document
    }
    expect(deriveRooms(doc.building.floors[0])).toEqual([])
  })
})

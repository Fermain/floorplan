import { describe, expect, it } from 'vitest'
import { alterationTakeoff, takeoff, totalCost } from '../cost/quantities'
import { addCorner, addFixture, addOpening, addWall, addWallRing, clearBaseline, markAsBuilt, removeFixture, removeOpening, removeWall, revertToBuilt } from '../model/mutations'
import type { Document } from '../model/types'
import { fixtureDocument } from '../plot/fixture'
import { alterations } from './alterations'

// A house from (4, 4) to (12, 10) with a wall across it at x = 8, a window in its south wall, marked as built.
function built(): Document {
  let d = fixtureDocument()
  const fid = d.building.floors[0].id
  d = addWallRing(d, fid, [{ x: 4, z: 4 }, { x: 12, z: 4 }, { x: 12, z: 10 }, { x: 4, z: 10 }], 'double').document
  d = line(d, { x: 8, z: 4 }, { x: 8, z: 10 })
  const south = wallBetween(d, { x: 4, z: 4 }, { x: 8, z: 4 })
  d = addOpening(d, fid, south.id, 'window', 1, 1.2).document
  d = addFixture(d, fid, { kind: 'basin', x: 4.4, z: 7, dx: 1, dz: 0, y: 0 } as never).document
  const marked = markAsBuilt(d, 1000)
  if (!marked.ok) throw new Error(marked.reason)
  return marked.document
}

// One wall from point to point, joining corners that are already there.
function line(doc: Document, a: { x: number; z: number }, b: { x: number; z: number }): Document {
  const fid = doc.building.floors[0].id
  const ids: string[] = []
  for (const p of [a, b]) {
    const near = doc.building.floors[0].corners.find((corner) => Math.hypot(corner.x - p.x, corner.z - p.z) < 1e-6)
    if (near) ids.push(near.id)
    else {
      doc = addCorner(doc, fid, p.x, p.z).document
      ids.push(doc.building.floors[0].corners.at(-1)!.id)
    }
  }
  const added = addWall(doc, fid, ids[0], ids[1], 'single')
  if (!added.ok) throw new Error(added.reason)
  return added.document
}

function wallBetween(doc: Document, a: { x: number; z: number }, b: { x: number; z: number }) {
  const floor = doc.building.floors[0]
  const at = (id: string) => floor.corners.find((corner) => corner.id === id)!
  const near = (p: { x: number; z: number }, q: { x: number; z: number }) => Math.hypot(p.x - q.x, p.z - q.z) < 1e-6
  const wall = floor.walls.find((item) => (near(at(item.startCornerId), a) && near(at(item.endCornerId), b)) || (near(at(item.startCornerId), b) && near(at(item.endCornerId), a)))
  if (!wall) throw new Error('no such wall')
  return wall
}

describe('alterations to a house marked as built', () => {
  it('are none until something is changed, and none at all for a house not marked', () => {
    const doc = built()
    const changes = alterations(doc)!
    expect(changes.any).toBe(false)
    expect(changes.kept).toBeCloseTo(8 + 6 + 8 + 6 + 6, 6)
    expect(alterationTakeoff(doc)).toEqual([])
    expect(alterations(clearBaseline(doc).document)).toBeNull()
    expect(alterationTakeoff(clearBaseline(doc).document)).toBeNull()
    expect(markAsBuilt(fixtureDocument(), 1).ok).toBe(false)
  })

  it('tell a wall that has come down from one that has gone up', () => {
    let doc = built()
    const fid = doc.building.floors[0].id
    doc = removeWall(doc, fid, wallBetween(doc, { x: 8, z: 4 }, { x: 8, z: 10 }).id).document
    let changes = alterations(doc)!
    expect(changes.demolishedLength).toBeCloseTo(6, 6)
    expect(changes.builtLength).toBeCloseTo(0, 6)
    // A new wall across the other way: the walls it joins are split where it meets them, and are still the old walls.
    doc = line(doc, { x: 4, z: 7 }, { x: 12, z: 7 })
    changes = alterations(doc)!
    expect(changes.builtLength).toBeCloseTo(8, 6)
    expect(changes.demolishedLength).toBeCloseTo(6, 6)
    expect(changes.kept).toBeCloseTo(28, 6)
    expect(changes.built).toHaveLength(1)
    expect(changes.demolished[0]).toMatchObject({ floorIndex: 0, a: { x: 8, z: 4 }, b: { x: 8, z: 10 } })
  })

  it('follow openings cut into standing walls and openings closed up, and fittings in and out', () => {
    let doc = built()
    const fid = doc.building.floors[0].id
    const south = wallBetween(doc, { x: 4, z: 4 }, { x: 8, z: 4 })
    doc = removeOpening(doc, fid, south.id, south.openings[0].id).document
    doc = addOpening(doc, fid, wallBetween(doc, { x: 8, z: 4 }, { x: 12, z: 4 }).id, 'door', 1, 0.9).document
    const basin = doc.building.floors[0].fixtures![0]
    doc = removeFixture(doc, fid, basin.id).document
    doc = addFixture(doc, fid, { kind: 'wc', x: 11.6, z: 7, dx: -1, dz: 0, y: 0 } as never).document
    const changes = alterations(doc)!
    expect(changes.closed.map((opening) => opening.kind)).toEqual(['window'])
    expect(changes.cut.map((opening) => opening.kind)).toEqual(['door'])
    expect(changes.fittingsRemoved.map((fixture) => fixture.kind)).toEqual(['basin'])
    expect(changes.fittingsAdded.map((fixture) => fixture.kind)).toEqual(['wc'])
    expect(changes.builtLength + changes.demolishedLength).toBeCloseTo(0, 6)
  })

  it('are priced as the difference, with the breaking out, and far below the whole house', () => {
    let doc = built()
    const fid = doc.building.floors[0].id
    doc = removeWall(doc, fid, wallBetween(doc, { x: 8, z: 4 }, { x: 8, z: 10 }).id).document
    doc = line(doc, { x: 4, z: 7 }, { x: 12, z: 7 })
    const lines = alterationTakeoff(doc)!
    const ids = lines.map((line) => line.id)
    expect(ids).toContain('demolish-wall')
    expect(lines.find((line) => line.id === 'demolish-wall')!.quantity).toBeGreaterThan(14)
    // Eight metres of new single wall needs new bricks, though the house has only two metres more wall than it had.
    const bricks = lines.filter((line) => line.group === 'Masonry').reduce((sum, line) => sum + line.quantity, 0)
    const whole = takeoff(doc).filter((line) => line.group === 'Masonry').reduce((sum, line) => sum + line.quantity, 0)
    expect(bricks).toBeGreaterThan(0)
    expect(bricks).toBeLessThan(whole / 2)
    expect(totalCost(lines)).toBeLessThan(totalCost(takeoff(doc)) / 2)
    expect(totalCost(lines)).toBeGreaterThan(0)
  })

  it('ask for no bricks or mortar when a wall only comes down', () => {
    let doc = built()
    doc = removeWall(doc, doc.building.floors[0].id, wallBetween(doc, { x: 8, z: 4 }, { x: 8, z: 10 }).id).document
    const lines = alterationTakeoff(doc)!
    expect(lines.filter((line) => line.group === 'Masonry' || line.group === 'Mortar')).toEqual([])
    expect(lines.map((line) => line.id)).toContain('demolish-wall')
  })

  it('can be put back to the house as built, which stays marked', () => {
    let doc = built()
    const fid = doc.building.floors[0].id
    doc = removeWall(doc, fid, wallBetween(doc, { x: 8, z: 4 }, { x: 8, z: 10 }).id).document
    const back = revertToBuilt(doc)
    expect(back.ok).toBe(true)
    expect(alterations(back.document)!.any).toBe(false)
    expect(back.document.baseline?.at).toBe(1000)
    // Marking again takes the house as it is now.
    expect(alterations(markAsBuilt(doc, 2000).document)!.any).toBe(false)
  })
})

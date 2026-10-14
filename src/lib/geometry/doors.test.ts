import { describe, expect, it } from 'vitest'
import { addOpening, addWallRing, setDoorSwing } from '../model/mutations'
import type { Document } from '../model/types'
import { fixtureDocument } from '../plot/fixture'
import { doorSwings } from './doors'

// A room from (4, 4) to (10, 9), in cavity brick, with a door in its south wall.
function withDoor(kind: 'internal-door' | 'external-door', width?: number): { doc: Document; wallId: string; openingId: string } {
  const d = fixtureDocument()
  const fid = d.building.floors[0].id
  let doc = addWallRing(d, fid, [{ x: 4, z: 4 }, { x: 10, z: 4 }, { x: 10, z: 9 }, { x: 4, z: 9 }], 'double').document
  const south = doc.building.floors[0].walls.find((wall) => {
    const corners = doc.building.floors[0].corners
    const a = corners.find((c) => c.id === wall.startCornerId)!
    const b = corners.find((c) => c.id === wall.endCornerId)!
    return Math.abs(a.z - 4) < 1e-9 && Math.abs(b.z - 4) < 1e-9
  })!
  const added = addOpening(doc, fid, south.id, kind, 2, width)
  expect(added.ok).toBe(true)
  doc = added.document
  const openingId = doc.building.floors[0].walls.find((wall) => wall.id === south.id)!.openings[0].id
  return { doc, wallId: south.id, openingId }
}

const floorOf = (doc: Document) => doc.building.floors[0]

describe('door swings', () => {
  it('open an outside door inward, its leaf square to the wall and its arc a quarter circle round the hinge', () => {
    const { doc } = withDoor('external-door')
    const [swing] = doorSwings(floorOf(doc))
    const [pivot, open] = swing.leaf
    // Inward: the room is north of the south wall, at greater z.
    expect(open.z).toBeGreaterThan(pivot.z)
    expect(open.x).toBeCloseTo(pivot.x, 6)
    const radius = Math.hypot(open.x - pivot.x, open.z - pivot.z)
    for (const point of swing.arc) expect(Math.hypot(point.x - pivot.x, point.z - pivot.z)).toBeCloseTo(radius, 6)
    // The arc ends closed, lying along the face.
    expect(swing.arc.at(-1)!.z).toBeCloseTo(pivot.z, 6)
    expect(swing.arc[0].z).toBeCloseTo(open.z, 6)
  })

  it('are hung from the other end, and open the other way, when set to', () => {
    const { doc, wallId, openingId } = withDoor('external-door')
    const fid = floorOf(doc).id
    const [before] = doorSwings(floorOf(doc))
    const flipped = setDoorSwing(doc, fid, wallId, openingId, { hinge: 'end', swing: -1 * (before.leaf[1].z > before.leaf[0].z ? 1 : -1) as 1 | -1 })
    expect(flipped.ok).toBe(true)
    const [after] = doorSwings(floorOf(flipped.document))
    expect(after.leaf[1].z).toBeLessThan(after.leaf[0].z)
    expect(Math.abs(after.leaf[0].x - before.leaf[0].x)).toBeGreaterThan(0.5)
  })

  it('draw a wide door as a pair of leaves meeting in the middle', () => {
    const { doc } = withDoor('external-door', 1.8)
    const swings = doorSwings(floorOf(doc))
    expect(swings).toHaveLength(2)
    const tips = swings.map((swing) => swing.arc.at(-1)!.x)
    expect(tips[0]).toBeCloseTo(tips[1], 6)
  })

  it('are only set on hinged doors', () => {
    const { doc, wallId } = withDoor('internal-door')
    const fid = floorOf(doc).id
    const window = addOpening(doc, fid, wallId, 'window', 4.5).document
    const opening = floorOf(window).walls.find((wall) => wall.id === wallId)!.openings.find((item) => item.kind === 'window')!
    expect(setDoorSwing(window, fid, wallId, opening.id, { hinge: 'end' }).ok).toBe(false)
  })

  it('opens into the more private room between two rooms by default', async () => {
    const { defaultDoorSwing } = await import('./doors')
    // Passage on side 1, Bedroom on side -1
    expect(defaultDoorSwing({ outside: false, roomType: 'passage' }, { outside: false, roomType: 'bedroom' })).toBe(-1)
    // Bedroom on side 1, Passage on side -1
    expect(defaultDoorSwing({ outside: false, roomType: 'bedroom' }, { outside: false, roomType: 'passage' })).toBe(1)
    // Living on side 1, Bathroom on side -1
    expect(defaultDoorSwing({ outside: false, roomType: 'living' }, { outside: false, roomType: 'bathroom' })).toBe(-1)
  })
})

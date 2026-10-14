import { describe, expect, it } from 'vitest'
import { takeoff } from '../cost/quantities'
import { addCorner, addGate, addWall, removeGate, setFence, updateGate } from '../model/mutations'
import type { Document } from '../model/types'
import { fixtureDocument } from '../plot/fixture'
import { fencePlan } from './gates'

// A palisade fence 12 m long along z = 1, from x = 2 to x = 14.
function fenced(): { doc: Document; floorId: string; wallId: string } {
  let doc = fixtureDocument()
  const floorId = doc.building.floors[0].id
  doc = addCorner(doc, floorId, 2, 1).document
  doc = addCorner(doc, floorId, 14, 1).document
  const [a, b] = doc.building.floors[0].corners.slice(-2)
  doc = addWall(doc, floorId, a.id, b.id, 'logical').document
  const wallId = doc.building.floors[0].walls.at(-1)!.id
  doc = setFence(doc, floorId, wallId, { type: 'palisade', height: 1.8 }).document
  return { doc, floorId, wallId }
}
const wallOf = (doc: Document, wallId: string) => doc.building.floors[0].walls.find((wall) => wall.id === wallId)!
const fenceLine = (doc: Document) => takeoff(doc).find((line) => line.id === 'fence:palisade')!

describe('gates', () => {
  it('are set into a fence with room for a post each side, and not over each other', () => {
    const { doc, floorId, wallId } = fenced()
    const one = addGate(doc, floorId, wallId, { u: 4, width: 1, opening: 'swing' })
    expect(one.ok).toBe(true)
    expect(addGate(one.document, floorId, wallId, { u: 4.5, width: 1, opening: 'swing' }).ok).toBe(false)
    expect(addGate(one.document, floorId, wallId, { u: 0.05, width: 1, opening: 'swing' }).ok).toBe(false)
    expect(addGate(one.document, floorId, wallId, { u: 11.5, width: 1, opening: 'swing' }).ok).toBe(false)
    expect(addGate(one.document, floorId, wallId, { u: 7, width: 3.6, opening: 'sliding' }).ok).toBe(true)
    const id = wallOf(one.document, wallId).fence!.gates![0].id
    expect(updateGate(one.document, floorId, wallId, id, { width: 0.2 }).ok).toBe(false)
    expect(removeGate(one.document, floorId, wallId, id).document.building.floors[0].walls.find((wall) => wall.id === wallId)!.fence!.gates).toBeUndefined()
  })

  it('leave a gap in the fence, priced on their own', () => {
    const { doc, floorId, wallId } = fenced()
    const before = fenceLine(doc)
    const gated = addGate(doc, floorId, wallId, { u: 4, width: 3.6, opening: 'swing' }).document
    expect(fenceLine(gated).quantity).toBeLessThan(before.quantity)
    const gate = takeoff(gated).find((line) => line.id === 'gate:swing-pair')!
    expect(gate.quantity).toBe(1)
    expect(gate.amount).toBeGreaterThan(0)
  })

  it('swing open toward the middle of the plot, a wide one as a pair, and a sliding one runs back beside the fence', () => {
    const { doc, floorId, wallId } = fenced()
    let gated = addGate(doc, floorId, wallId, { u: 2, width: 1, opening: 'swing' }).document
    gated = addGate(gated, floorId, wallId, { u: 4, width: 3.6, opening: 'swing' }).document
    gated = addGate(gated, floorId, wallId, { u: 8.5, width: 2, opening: 'sliding' }).document
    const floor = gated.building.floors[0]
    const plan = fencePlan(floor, wallOf(gated, wallId), { x: 8, z: 10 })!
    expect(plan.runs).toHaveLength(4)
    expect(plan.swings).toHaveLength(3)
    // Toward the middle of the plot, at greater z.
    for (const swing of plan.swings) expect(swing.leaf[1].z).toBeGreaterThan(swing.leaf[0].z)
    expect(plan.slides).toHaveLength(1)
    // Hung from the start, the sliding gate runs back toward the start of the line, beside the fence.
    expect(Math.min(...plan.slides[0].ring.map((p) => p.x))).toBeCloseTo(2 + 8.5 - 2, 6)
  })
})

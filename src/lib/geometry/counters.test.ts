import { describe, expect, it } from 'vitest'
import { takeoff } from '../cost/quantities'
import { counterRing } from '../model/counters'
import { addCounter, addWallRing, removeCounter, updateCounter } from '../model/mutations'
import type { Counter, Document } from '../model/types'
import { fixtureDocument } from '../plot/fixture'
import { buildCounterParts, counterAlongFace, counterAt, counterBetween, counterFace, counterTotals } from './counters'

// A room from (4, 4) to (10, 9), in cavity brick 262 mm thick.
function room(): Document {
  const d = fixtureDocument()
  return addWallRing(d, d.building.floors[0].id, [{ x: 4, z: 4 }, { x: 10, z: 4 }, { x: 10, z: 9 }, { x: 4, z: 9 }], 'double').document
}
const floorOf = (doc: Document) => doc.building.floors[0]
const base: Omit<Counter, 'id'> = { x: 4.2, z: 4.2, dx: 1, dz: 0, length: 3, depth: 0.6, kind: 'base', top: 'laminate' }

describe('counters', () => {
  it('are added, changed and removed, and refused when too short, too deep or of a kind that does not exist', () => {
    let doc = room()
    const fid = floorOf(doc).id
    const added = addCounter(doc, fid, base)
    expect(added.ok).toBe(true)
    doc = added.document
    const id = floorOf(doc).counters![0].id
    expect(updateCounter(doc, fid, id, { top: 'granite', wallUnits: true }).document.building.floors[0].counters![0]).toMatchObject({ top: 'granite', wallUnits: true })
    expect(updateCounter(doc, fid, id, { length: 0.1 }).ok).toBe(false)
    expect(updateCounter(doc, fid, id, { depth: 2 }).ok).toBe(false)
    expect(updateCounter(doc, fid, id, { kind: 'shelf' as never }).ok).toBe(false)
    // An island cannot carry wall cupboards, so turning a counter into one drops them.
    const walled = updateCounter(doc, fid, id, { wallUnits: true }).document
    expect(updateCounter(walled, fid, id, { kind: 'island' }).document.building.floors[0].counters![0].wallUnits).toBeUndefined()
    expect(removeCounter(doc, fid, id).document.building.floors[0].counters).toBeUndefined()
  })

  it('stand against the inside face of the wall the pointer is nearest, with the room on their left', () => {
    const floor = floorOf(room())
    // Just inside the south wall, whose centre line is z = 4.
    const face = counterFace(floor, { x: 6, z: 4.3 }, 0.45)!
    expect(face.point.z).toBeGreaterThan(4.1)
    expect(face.point.z).toBeLessThan(4.2)
    const run = counterAlongFace(face, { x: 8.52, z: 5 }, 0.6)
    expect(run.length).toBeCloseTo(2.5, 6)
    const ring = counterRing(run)
    // Its front edge is further into the room than its back edge.
    expect(Math.max(...ring.map((p) => p.z))).toBeCloseTo(face.point.z + 0.6, 6)
    // Drawn the other way along the wall, it is the same counter.
    const back = counterAlongFace(face, { x: 3.5, z: 5 }, 0.6)
    expect(Math.max(...counterRing(back).map((p) => p.z))).toBeCloseTo(face.point.z + 0.6, 6)
    expect(back.length).toBeLessThanOrEqual(2 + 1e-9)
    expect(counterFace(floor, { x: 7, z: 6.5 }, 0.45)).toBeNull()
  })

  it('stand free as an island drawn corner to corner', () => {
    const island = counterBetween({ x: 6, z: 6 }, { x: 8.02, z: 6.9 }, { x: 1, z: 0 })
    expect(island).toMatchObject({ length: 2, depth: 0.9 })
    const ring = counterRing(island)
    expect(Math.min(...ring.map((p) => p.x))).toBeCloseTo(6)
    expect(Math.min(...ring.map((p) => p.z))).toBeCloseTo(6)
    // Drawn from the far corner back, it covers the same ground.
    const again = counterRing(counterBetween({ x: 8, z: 6.9 }, { x: 6, z: 6 }, { x: 1, z: 0 }))
    expect(Math.min(...again.map((p) => p.x))).toBeCloseTo(6)
    expect(Math.max(...again.map((p) => p.z))).toBeCloseTo(6.9)
  })

  it('are picked by a point on them', () => {
    const doc = addCounter(room(), floorOf(room()).id, base).document
    expect(counterAt(floorOf(doc), { x: 5, z: 4.5 })?.kind).toBe('base')
    expect(counterAt(floorOf(doc), { x: 5, z: 6 })).toBeNull()
  })

  it('are built as a plinth, cupboards and a worktop 900 mm up, with wall cupboards over them if asked', () => {
    const parts = buildCounterParts([{ ...base, id: 'c', wallUnits: true }], 1)
    let top = -Infinity
    for (const part of parts) {
      const position = part.geometry.getAttribute('position')
      for (let i = 0; i < position.count; i++) top = Math.max(top, position.getY(i))
      part.geometry.dispose()
    }
    expect(top).toBeCloseTo(1 + 2.15, 6)
    const plain = buildCounterParts([{ ...base, id: 'c' }], 1)
    let height = -Infinity
    for (const part of plain) {
      const position = part.geometry.getAttribute('position')
      for (let i = 0; i < position.count; i++) height = Math.max(height, position.getY(i))
      part.geometry.dispose()
    }
    expect(height).toBeCloseTo(1.9, 6)
  })

  it('are priced by the metre of cupboard, the area of worktop and the metre of wall cupboard', () => {
    let doc = room()
    const fid = floorOf(doc).id
    doc = addCounter(doc, fid, { ...base, wallUnits: true }).document
    doc = addCounter(doc, fid, { x: 6, z: 6, dx: 1, dz: 0, length: 2, depth: 0.9, kind: 'island', top: 'granite' }).document
    const totals = counterTotals(doc)
    expect(totals.units).toEqual({ base: 3, island: 2, bar: 0 })
    expect(totals.wallUnits).toBe(3)
    expect(totals.tops.granite).toBeCloseTo(2 * 0.94, 6)
    const lines = takeoff(doc).filter((line) => line.group === 'Joinery')
    expect(lines.map((line) => line.id).sort()).toEqual(['counter-wall-units', 'counter:base', 'counter:island', 'worktop:granite', 'worktop:laminate'])
    expect(takeoff(room()).some((line) => line.group === 'Joinery')).toBe(false)
  })
})

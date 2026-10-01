import { describe, expect, it } from 'vitest'
import { fixtureDocument } from '../plot/fixture'
import { addStorey, addWallRing, setRoof, setWallGutter } from '../model/mutations'
import type { Document, RoofForm } from '../model/types'
import { buildGutterParts, gutterLayout, gutterLengths } from './gutters'
import { takeoff } from '../cost/quantities'

function roofed(form: RoofForm): Document {
  let d = fixtureDocument()
  const id = d.building.floors[0].id
  d = addWallRing(d, id, [{ x: 4, z: 4 }, { x: 12, z: 4 }, { x: 12, z: 10 }, { x: 4, z: 10 }], 'double').document
  const ground = d.building.floors[0]
  d = addStorey(d, ground.id, ground.corners[0].id).document
  const plate = d.building.floors.find((floor) => floor.index === 1)!
  return setRoof(d, plate.id, { pitchDeg: form === 'mono' ? 10 : 30, eaves: 0.5, form, covering: 'ibr' }).document
}

const plate = (doc: Document) => doc.building.floors.find((floor) => floor.index === 1)!

function total(doc: Document) {
  return gutterLayout(doc).pieces.filter((piece) => piece.on).reduce((sum, p) => sum + Math.hypot(p.b.x - p.a.x, p.b.z - p.a.z), 0)
}

describe('gutters', () => {
  it('runs round every eave of a hip roof, and only the low sides of gable and mono roofs', () => {
    const hip = total(roofed('hip'))
    const gable = total(roofed('gable'))
    const mono = total(roofed('mono'))
    expect(hip).toBeGreaterThan(2 * (8 + 6))
    expect(gable).toBeLessThan(hip)
    expect(gable).toBeGreaterThan(2 * 8)
    expect(mono).toBeLessThan(gable)
    expect(mono).toBeGreaterThan(6)
  })

  it('belongs to the wall beneath it and can be taken away there', () => {
    let doc = roofed('hip')
    const pieces = gutterLayout(doc).pieces
    expect(pieces.every((piece) => piece.wallId !== null)).toBe(true)
    const wallId = pieces[0].wallId!
    doc = setWallGutter(doc, plate(doc).id, wallId, false).document
    const after = gutterLayout(doc).pieces
    expect(after.filter((piece) => piece.wallId === wallId).every((piece) => !piece.on)).toBe(true)
    expect(after.filter((piece) => piece.wallId !== wallId).every((piece) => piece.on)).toBe(true)
    doc = setWallGutter(doc, plate(doc).id, wallId, true).document
    expect(plate(doc).roof!.noGutter).toBeUndefined()
  })

  it('puts downpipes at the ends of runs, builds the parts and prices them', () => {
    const doc = roofed('gable')
    const layout = gutterLayout(doc)
    expect(layout.downpipes.length).toBeGreaterThanOrEqual(2)
    const parts = buildGutterParts(layout, plate(doc).id, 'square-metal', () => -3)
    expect(parts).toHaveLength(1)
    const lengths = gutterLengths(layout, doc)
    expect(lengths.gutter['round-pvc']).toBeCloseTo(total(doc), 6)
    expect(lengths.pipes['round-pvc']).toBe(layout.downpipes.length)
    const ids = takeoff(doc).map((line) => line.id)
    expect(ids).toContain('gutter:round-pvc')
    expect(ids).toContain('downpipe:round-pvc')
    expect(setRoof(doc, plate(doc).id, { ...plate(doc).roof!, gutter: 'copper' as never }).ok).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import { takeoff } from '../cost/quantities'
import { addRetainingWall, removeRetainingWall, updateRetainingWall } from '../model/mutations'
import type { Document, RetainingWall } from '../model/types'
import { fixtureDocument } from '../plot/fixture'
import { buildRetainingParts, groundOf, measureRetaining, retainingAt, retainingIssues, retainingSamples, retainingTotals } from './retaining'

// A bank across the plot: the ground steps up by `rise` over a metre either side of x = 8.
function banked(rise: number): Document {
  const d = fixtureDocument()
  const field = d.heightfield
  const heights = field.heights.map((_, i) => {
    const x = field.originX + (i % field.cols) * field.cellSize
    return Math.max(0, Math.min(1, (x - 7) / 2)) * rise
  })
  return { ...d, heightfield: { ...field, heights } }
}

const along: Omit<RetainingWall, 'id'> = { type: 'blocks', points: [[8, 6], [8, 12]] }

describe('retaining walls', () => {
  it('are drawn, changed and removed, and refused off the plot, too short or of no known kind', () => {
    let doc = banked(0.8)
    const drawn = addRetainingWall(doc, along)
    expect(drawn.ok).toBe(true)
    doc = drawn.document
    const id = doc.retaining![0].id
    expect(updateRetainingWall(doc, id, { type: 'concrete' }).document.retaining![0].type).toBe('concrete')
    expect(updateRetainingWall(doc, id, { type: 'gabion' as never }).ok).toBe(false)
    expect(addRetainingWall(doc, { ...along, points: [[8, 6]] }).ok).toBe(false)
    expect(addRetainingWall(doc, { ...along, points: [[8, 6], [8, 6.2]] }).ok).toBe(false)
    expect(addRetainingWall(doc, { ...along, points: [[8, 6], [80, 6]] }).ok).toBe(false)
    expect(removeRetainingWall(doc, id).document.retaining).toBeUndefined()
  })

  it('hold back the difference between the ground on either side, and face downhill', () => {
    const step = (x: number) => (x > 8 ? 0.9 : 0)
    const samples = retainingSamples(along, step)
    expect(samples).toHaveLength(13)
    expect(samples.every((sample) => sample.low === 0 && sample.high === 0.9)).toBe(true)
    expect(samples.every((sample) => sample.down.x < 0)).toBe(true)
    const measure = measureRetaining(along, step)
    expect(measure.length).toBeCloseTo(6)
    expect(measure.highest).toBeCloseTo(0.9)
    expect(measure.face).toBeCloseTo(5.4)
    // A wall along level ground holds nothing.
    expect(measureRetaining(along, () => 2).highest).toBe(0)
    // Round a corner, the bend is sampled once.
    expect(retainingSamples({ points: [[8, 6], [8, 8], [10, 8]] }, step)).toHaveLength(9)
  })

  it('read the ground as it lies, and leave it as it lies', () => {
    const doc = addRetainingWall(banked(0.8), along).document
    expect(doc.heightfield).toEqual(banked(0.8).heightfield)
    expect(measureRetaining(doc.retaining![0], groundOf(doc)).highest).toBeCloseTo(0.8, 1)
    expect(retainingIssues(doc)).toEqual([])
  })

  it('are flagged for an engineer when they hold back more than a metre', () => {
    const doc = addRetainingWall(banked(1.6), along).document
    const issues = retainingIssues(doc)
    expect(issues).toHaveLength(1)
    expect(issues[0].id).toBe(`retaining:${doc.retaining![0].id}`)
    expect(issues[0].text).toContain('engineer')
  })

  it('are picked from near their line, and built for Review', () => {
    const doc = addRetainingWall(banked(0.8), along).document
    expect(retainingAt(doc, { x: 8.2, z: 9 }, 0.3)?.id).toBe(doc.retaining![0].id)
    expect(retainingAt(doc, { x: 9, z: 9 }, 0.3)).toBeNull()
    expect(retainingAt(doc, { x: 8, z: 13 }, 0.3)).toBeNull()
    const parts = buildRetainingParts(doc, groundOf(doc))
    expect(parts).toHaveLength(1)
    const ys = Array.from(parts[0].geometry.getAttribute('position').array).filter((_, i) => i % 3 === 1)
    expect(Math.max(...ys)).toBeCloseTo(0.85, 1)
    expect(Math.min(...ys)).toBeLessThan(0)
  })

  it('are priced by their face, with a drain behind them', () => {
    const doc = addRetainingWall(banked(0.8), along).document
    const totals = retainingTotals(doc)
    expect(totals.length).toBeCloseTo(6)
    // The face that shows, and 300 mm bedded below it.
    expect(totals.face.blocks).toBeCloseTo(0.8 * 6 + 0.3 * 6, 0)
    const lines = takeoff(doc).filter((line) => line.group === 'Retaining walls')
    expect(lines.map((line) => line.id)).toEqual(['retaining:blocks', 'retaining-drain'])
    expect(lines[1].quantity).toBe(6)
    expect(takeoff(banked(0.8)).some((line) => line.group === 'Retaining walls')).toBe(false)
  })
})

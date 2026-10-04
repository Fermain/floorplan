import { describe, expect, it } from 'vitest'
import { takeoff } from '../cost/quantities'
import { addRetainingWall, removeRetainingWall, updateRetainingWall } from '../model/mutations'
import type { Document, RetainingWall } from '../model/types'
import { fixtureDocument } from '../plot/fixture'
import { buildRetainingParts, groundOf, measureRetaining, pinchedGround, RETAINING_BLOCK, retainingAt, retainingIssues, retainingSamples, retainingTotals } from './retaining'

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
  })

  it('are built in level courses, so the top steps rather than following the ground', () => {
    // Ground that climbs along the wall as well as across it.
    const ground = (x: number, z: number) => (x > 8 ? 1 : 0) * (0.4 + (z - 6) * 0.1)
    const doc = addRetainingWall(banked(0.8), along).document
    for (const type of ['blocks', 'masonry', 'concrete'] as const) {
      const built = buildRetainingParts(updateRetainingWall(doc, doc.retaining![0].id, { type }).document, ground)
      // Blocks come with the soil in their tops as a part of its own.
      expect(built).toHaveLength(type === 'blocks' ? 2 : 1)
      const ys = Array.from(built[0].geometry.getAttribute('position').array).filter((_, i) => i % 3 === 1)
      const tops = [...new Set(ys.filter((y) => y > 0.1).map((y) => Math.round(y * 1000) / 1000))]
      expect(tops.length).toBeGreaterThan(1)
      expect(tops.every((y) => Math.abs(y / RETAINING_BLOCK.height - Math.round(y / RETAINING_BLOCK.height)) < 1e-6)).toBe(true)
      expect(Math.max(...ys)).toBeCloseTo(1, 1)
      expect(Math.min(...ys)).toBeLessThan(0)
    }
  })

  it('lean back up the bank when built of blocks, a course at a time', () => {
    const doc = addRetainingWall(banked(0.8), along).document
    const xs = Array.from(buildRetainingParts(doc, (x) => (x > 8 ? 0.8 : 0))[0].geometry.getAttribute('position').array).filter((_, i) => i % 3 === 0)
    // Five courses from one bedded under the ground to the top: four steps of 50 mm up the bank, which is to the east.
    expect(Math.max(...xs)).toBeCloseTo(8 + RETAINING_BLOCK.depth / 2 + 4 * RETAINING_BLOCK.setback, 2)
    expect(Math.min(...xs)).toBeCloseTo(8 - RETAINING_BLOCK.depth / 2, 2)
  })

  it('draw the ground in to the top and the foot of the wall, and nowhere else', () => {
    const doc = addRetainingWall({ ...banked(0.8), retaining: undefined }, { ...along, type: 'concrete' }).document
    const slope = (x: number) => Math.max(0, Math.min(1, (x - 7) / 2)) * 0.8
    const lies = (x: number) => slope(x)
    const ground = pinchedGround(doc, lies)
    // Level with the top just behind the wall and with its foot just in front, halfway along.
    expect(ground(8.05, 9)).toBeCloseTo(0.8, 1)
    expect(ground(7.95, 9)).toBeCloseTo(0, 1)
    // A metre out, past either end and at the very end, the ground is as it lies.
    expect(ground(9.2, 9)).toBeCloseTo(slope(9.2))
    expect(ground(6.8, 9)).toBeCloseTo(slope(6.8))
    expect(ground(8.05, 12.5)).toBeCloseTo(slope(8.05))
    expect(ground(8.05, 12)).toBeCloseTo(slope(8.05))
    // With no wall there is nothing to draw in.
    expect(pinchedGround(banked(0.8), lies)).toBe(lies)
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

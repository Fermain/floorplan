import { describe, expect, it } from 'vitest'
import { addOpening, addWall, addCorner, setProjectDefaults } from '../model/mutations'
import { defaultOpeningDimensions } from '../model/openings'
import { wallSystem } from '../model/systems'
import { isDocument } from '../state/projects'
import { documentFromSample, plotFacts, SAMPLE_PLOTS } from './samples'

describe('sample plots', () => {
  it('cover every plot with ground levels', () => {
    for (const sample of SAMPLE_PLOTS) {
      const { heightfield: field, plot } = sample
      const maxX = field.originX + (field.cols - 1) * field.cellSize
      const maxZ = field.originZ + (field.rows - 1) * field.cellSize
      for (const [x, z] of plot.ring) {
        expect(x).toBeGreaterThanOrEqual(field.originX)
        expect(z).toBeGreaterThanOrEqual(field.originZ)
        expect(x).toBeLessThanOrEqual(maxX)
        expect(z).toBeLessThanOrEqual(maxZ)
      }
      expect(field.heights).toHaveLength(field.cols * field.rows)
    }
  })

  it('face the way their names say', () => {
    const facing = (id: string) => {
      const sample = SAMPLE_PLOTS.find((item) => item.id === id)!
      return plotFacts(sample.plot, sample.heightfield).facing
    }
    expect(facing('gentle-north')).toBe('north')
    expect(facing('steep-north')).toBe('north')
    expect(facing('south-slope')).toBe('south')
    expect(facing('corner')).toBe('east')
    expect(facing('level-suburban')).toBeNull()
  })

  it('fall about as steeply as described', () => {
    const steep = SAMPLE_PLOTS.find((item) => item.id === 'steep-north')!
    const facts = plotFacts(steep.plot, steep.heightfield)
    expect(facts.area).toBeCloseTo(18 * 28, 6)
    expect(facts.fall).toBeGreaterThan(28 / 6)
  })

  it('make a project the store accepts', () => {
    for (const sample of SAMPLE_PLOTS) {
      const doc = documentFromSample(sample.id, 'block-140', { sill: 1 })
      expect(isDocument(doc)).toBe(true)
      expect(doc.building.wallSystemId).toBe('block-140')
      expect(doc.building.defaults).toEqual({ sill: 1 })
    }
  })
})

describe('project defaults', () => {
  it('size new windows from the defaults, on the courses of the wall', () => {
    const clay = defaultOpeningDimensions('window', wallSystem('clay-cavity'), { sill: 1, windowHeight: 1.2 })
    expect((clay.v / 0.083) % 1).toBeCloseTo(0, 6)
    expect(clay.v).toBeCloseTo(12 * 0.083, 6)
    const block = defaultOpeningDimensions('window', wallSystem('block-140'), { sill: 1, windowWidth: 1.5 })
    expect(block.v).toBeCloseTo(1, 9)
    expect(block.width).toBeCloseTo(1.6, 9)
  })

  it('places a new window with the project defaults', () => {
    let doc = documentFromSample('level-suburban', 'block-140', { sill: 0.6, windowHeight: 1.4 })
    const fid = doc.building.floors[0].id
    doc = addCorner(doc, fid, 2, 2).document
    doc = addCorner(doc, fid, 8, 2).document
    const [a, b] = doc.building.floors[0].corners
    doc = addWall(doc, fid, a.id, b.id, 'double', 'block-140').document
    const wallId = doc.building.floors[0].walls[0].id
    doc = addOpening(doc, fid, wallId, 'window', 2).document
    const [opening] = doc.building.floors[0].walls[0].openings
    expect(opening.v).toBeCloseTo(0.6, 9)
    expect(opening.v + opening.height).toBeCloseTo(2, 9)
  })

  it('refuses a window whose head would pass the wall head', () => {
    const doc = documentFromSample('level-suburban', 'clay-cavity', {})
    expect(setProjectDefaults(doc, { sill: 1.5, windowHeight: 1.5 }).ok).toBe(false)
    expect(setProjectDefaults(doc, { sill: 0.9, windowHeight: 1.2 }).ok).toBe(true)
  })
})

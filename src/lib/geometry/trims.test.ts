import { describe, expect, it } from 'vitest'
import { fixtureDocument } from '../plot/fixture'
import { addOpening, addWallRing, setFaceTrim, setProjectDefaults } from '../model/mutations'
import type { Document, Floor } from '../model/types'
import { takeoff } from '../cost/quantities'
import { buildTrimParts, trimLengths, trimRuns } from './trims'

function house(): Document {
  let d = fixtureDocument()
  const id = d.building.floors[0].id
  d = addWallRing(d, id, [{ x: 4, z: 4 }, { x: 10, z: 4 }, { x: 10, z: 8 }, { x: 4, z: 8 }], 'double').document
  d = addWallRing(d, id, [{ x: 7, z: 4 }, { x: 10, z: 4 }, { x: 10, z: 8 }, { x: 7, z: 8 }], 'double').document
  return d
}

function partition(floor: Floor) {
  return floor.walls.find((wall) => {
    const a = floor.corners.find((c) => c.id === wall.startCornerId)!
    const b = floor.corners.find((c) => c.id === wall.endCornerId)!
    return a.x === 7 && b.x === 7
  })!
}

describe('skirting and cornice', () => {
  it('runs round every room face, inside only, rounded by default', () => {
    const doc = house()
    const runs = trimRuns(doc, doc.building.floors[0])
    expect(runs).toHaveLength(8)
    expect(runs.every((run) => run.skirting === 'rounded' && run.cornice === 'rounded')).toBe(true)
    const lengths = trimLengths(doc)
    expect(lengths.cornice.rounded).toBeGreaterThan(2 * (2 * 2.5 + 2 * 3.5))
  })

  it('stops the skirting at doorways but carries the cornice past', () => {
    let doc = house()
    const before = trimLengths(doc)
    doc = addOpening(doc, doc.building.floors[0].id, partition(doc.building.floors[0]).id, 'internal-door', 1.5, 0.8).document
    const after = trimLengths(doc)
    expect(before.skirting.rounded - after.skirting.rounded).toBeCloseTo(1.6, 2)
    expect(after.cornice.rounded).toBeCloseTo(before.cornice.rounded, 6)
  })

  it('takes a face off or changes it, and follows a new project default', () => {
    let doc = house()
    const floor = doc.building.floors[0]
    const wall = partition(floor)
    doc = setFaceTrim(doc, floor.id, wall.id, 1, { skirting: 'none', cornice: 'coral' }).document
    let runs = trimRuns(doc, doc.building.floors[0]).filter((run) => run.wall.id === wall.id)
    expect(runs.find((run) => run.side === 1)).toMatchObject({ skirting: 'none', cornice: 'coral' })
    expect(runs.find((run) => run.side === -1)).toMatchObject({ skirting: 'rounded', cornice: 'rounded' })
    doc = setFaceTrim(doc, floor.id, wall.id, 1, { skirting: 'rounded', cornice: 'rounded' }).document
    expect(doc.building.floors[0].walls.find((w) => w.id === wall.id)!.trim).toBeUndefined()
    doc = setProjectDefaults(doc, { skirting: 'angled', cornice: 'none' }).document
    runs = trimRuns(doc, doc.building.floors[0])
    expect(runs.every((run) => run.skirting === 'angled' && run.cornice === 'none')).toBe(true)
    expect(setFaceTrim(doc, floor.id, wall.id, 1, { skirting: 'gold' as never }).ok).toBe(false)
  })

  it('builds skirting at the floor and cornice at the ceiling, and prices them', () => {
    const doc = house()
    const floor = doc.building.floors[0]
    const parts = buildTrimParts(trimRuns(doc, floor), floor, 0)
    expect(parts).toHaveLength(2)
    parts[0].geometry.computeBoundingBox()
    parts[1].geometry.computeBoundingBox()
    expect(parts[0].geometry.boundingBox!.max.y).toBeLessThan(0.3)
    expect(parts[1].geometry.boundingBox!.min.y).toBeGreaterThan(2.3)
    const ids = takeoff(doc).map((line) => line.id)
    expect(ids).toContain('skirting:rounded')
    expect(ids).toContain('cornice:rounded')
  })
})

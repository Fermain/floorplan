import { describe, expect, it } from 'vitest'
import { fixtureDocument } from '../plot/fixture'
import { addPaving, addWallRing, removePaving, setProjectDefaults, updatePaving } from '../model/mutations'
import { deriveRooms } from '../model/rooms'
import type { Document } from '../model/types'
import { takeoff } from '../cost/quantities'
import { wallReach } from './outline'
import { apronPolygons, buildPavingParts, guidePavingPoint, pavingAt, pavingPieces, pavingRectangle, pavingSnapTargets, snapPavingPoint } from './paving'

// An 8 m by 6 m house from (4, 4) to (12, 10).
function house(): Document {
  const d = fixtureDocument()
  return addWallRing(d, d.building.floors[0].id, [{ x: 4, z: 4 }, { x: 12, z: 4 }, { x: 12, z: 10 }, { x: 4, z: 10 }], 'double').document
}

const driveway: [number, number][] = [[13, 2], [16, 2], [16, 8], [13, 8]]

describe('paving areas', () => {
  it('lays, changes and lifts an area, refusing what is off the plot or too small', () => {
    let doc = house()
    const laid = addPaving(doc, driveway, 'cement-pavers')
    expect(laid.ok).toBe(true)
    doc = laid.document
    const id = doc.paving![0].id
    expect(updatePaving(doc, id, { surface: 'gravel' }).document.paving![0].surface).toBe('gravel')
    expect(updatePaving(doc, id, { surface: 'tar' as never }).ok).toBe(false)
    expect(addPaving(doc, [[0, 0], [100, 0], [100, 100]], 'concrete').ok).toBe(false)
    expect(addPaving(doc, [[13, 2], [13.1, 2], [13.1, 2.1]], 'concrete').ok).toBe(false)
    expect(removePaving(doc, id).document.paving).toBeUndefined()
  })

  it('never becomes a room, so nothing can stand on it or roof it', () => {
    const doc = addPaving(house(), driveway, 'concrete').document
    expect(deriveRooms(doc.building.floors[0])).toHaveLength(deriveRooms(house().building.floors[0]).length)
  })
})

describe('the apron', () => {
  it('runs round the outside faces of the house at the chosen width', () => {
    const doc = setProjectDefaults(house(), { apronWidth: 0.6 }).document
    const reach = wallReach(doc.building.floors[0].walls[0])
    const [apron] = apronPolygons(doc)
    expect(apron.holes).toHaveLength(1)
    const outside = (8 + 2 * reach) * (6 + 2 * reach)
    const piece = pavingPieces(doc).find((item) => item.apron)!
    expect(piece.area).toBeCloseTo((8 + 2 * reach + 1.2) * (6 + 2 * reach + 1.2) - outside, 3)
    expect(apronPolygons(house())).toEqual([])
    expect(setProjectDefaults(house(), { apronWidth: 5 }).ok).toBe(false)
  })

  it('goes round what is built, not round a patio marked off by logical walls', () => {
    let doc = setProjectDefaults(house(), { apronWidth: 0.6 }).document
    const before = pavingPieces(doc).find((item) => item.apron)!.area
    doc = addWallRing(doc, doc.building.floors[0].id, [{ x: 4, z: 4 }, { x: 4, z: 1 }, { x: 12, z: 1 }, { x: 12, z: 4 }], 'logical').document
    expect(pavingPieces(doc).find((item) => item.apron)!.area).toBeCloseTo(before, 3)
  })

  it('stops at the boundary of the plot', () => {
    // A house half a metre in from the west boundary, with a metre of apron asked for.
    const base = fixtureDocument()
    const plot = { ...base.plot, ring: [[0, 0], [20, 0], [20, 20], [0, 20]] as [number, number][] }
    let doc: Document = { ...base, plot }
    doc = addWallRing(doc, doc.building.floors[0].id, [{ x: 0.5, z: 5 }, { x: 8, z: 5 }, { x: 8, z: 11 }, { x: 0.5, z: 11 }], 'double').document
    doc = setProjectDefaults(doc, { apronWidth: 1 }).document
    const [apron] = apronPolygons(doc)
    expect(Math.min(...apron.outer.map((p) => p.x))).toBeCloseTo(0, 6)
    expect(Math.max(...apron.outer.map((p) => p.x))).toBeGreaterThan(9)
  })

  it('is picked by a point on it, but not inside the house', () => {
    const doc = setProjectDefaults(addPaving(house(), driveway, 'concrete').document, { apronWidth: 0.6 }).document
    expect(pavingAt(doc, { x: 8, z: 3.6 })).toEqual({ kind: 'apron' })
    expect(pavingAt(doc, { x: 8, z: 7 })).toBeNull()
    expect(pavingAt(doc, { x: 15, z: 5 })).toMatchObject({ kind: 'paving' })
  })
})

describe('quantities', () => {
  it('prices each surface by area, the layers under it by volume, and edging round pavers', () => {
    let doc = addPaving(house(), driveway, 'cement-pavers').document
    doc = setProjectDefaults(doc, { apronWidth: 0.6, apronSurface: 'concrete' }).document
    const lines = takeoff(doc)
    expect(lines.find((line) => line.id === 'paving:cement-pavers')).toMatchObject({ group: 'Paving', unit: 'm²', quantity: 18 })
    expect(lines.find((line) => line.id === 'paving:concrete')?.note).toMatch(/apron/)
    expect(lines.find((line) => line.id === 'paving-edge')).toMatchObject({ quantity: 18 })
    expect(lines.find((line) => line.id === 'paving-layer:g5-m3')!.quantity).toBeGreaterThan(18 * 0.15)
    expect(lines.find((line) => line.id === 'paving-layer:concrete-m3')).toBeDefined()
  })
})

describe('drawing paving', () => {
  it('snaps a corner to the plot, the house and other paving, and otherwise to 50 mm', () => {
    const doc = addPaving(house(), driveway, 'concrete').document
    const targets = pavingSnapTargets(doc)
    expect(snapPavingPoint({ x: 13.2, z: 2.1 }, targets, 0.5)).toEqual({ point: { x: 13, z: 2 }, snapped: true })
    const onSide = snapPavingPoint({ x: 14.5, z: 2.2 }, targets, 0.5)
    expect(onSide.snapped).toBe(true)
    expect(onSide.point.z).toBeCloseTo(2)
    expect(snapPavingPoint({ x: 7.03, z: 15.98 }, targets, 0.2)).toEqual({ point: { x: 7.05, z: 16 }, snapped: false })
  })

  it('makes a rectangle square to the grid from two corners', () => {
    expect(pavingRectangle({ x: 0, z: 0 }, { x: 3, z: 2 })).toEqual([[0, 0], [3, 0], [3, 2], [0, 2]])
    const turned = pavingRectangle({ x: 0, z: 0 }, { x: 0, z: 2 }, { x: 1, z: 1 })
    expect(turned).toHaveLength(4)
    expect(turned[1][0]).toBeCloseTo(1)
    expect(turned[1][1]).toBeCloseTo(1)
  })

  it('lays the paving over the ground for Review, just above it', () => {
    const doc = setProjectDefaults(addPaving(house(), driveway, 'clay-pavers').document, { apronWidth: 0.6 }).document
    const slope = (x: number, z: number) => x * 0.05 + z * 0.02
    const parts = buildPavingParts(doc, slope)
    expect(parts.length).toBe(2)
    for (const part of parts) {
      const pos = part.geometry.getAttribute('position')
      for (let i = 0; i < pos.count; i += 5) {
        const above = pos.getY(i) - slope(pos.getX(i), pos.getZ(i))
        expect(above).toBeGreaterThan(0)
        expect(above).toBeLessThan(0.1)
      }
      part.geometry.dispose()
    }
  })
})

describe('guides while drawing paving', () => {
  const targets = pavingSnapTargets(addPaving(house(), driveway, 'concrete').document)

  it('marks a corner it snaps to with a cross, and a side with the side itself', () => {
    const corner = guidePavingPoint({ x: 13.2, z: 2.1 }, targets, 0.5)
    expect(corner.point).toEqual({ x: 13, z: 2 })
    expect(corner.traces).toHaveLength(2)
    const side = guidePavingPoint({ x: 14.5, z: 2.2 }, targets, 0.5)
    expect(side.traces).toEqual([{ x1: 13, z1: 2, x2: 16, z2: 2 }])
  })

  it('lines a free corner up with others, and with corners already drawn', () => {
    // Out in the open, 100 mm off the line of the driveway's far side.
    const lined = guidePavingPoint({ x: 18, z: 8.1 }, targets, 0.3, { align: 0.3 })
    expect(lined.point.z).toBeCloseTo(8)
    expect(lined.snapped).toBe(true)
    expect(lined.traces.some((trace) => trace.z1 === 8 && trace.z2 === 8)).toBe(true)
    const drawn = guidePavingPoint({ x: 17.52, z: 14.1 }, { points: [], edges: [] }, 0.3, { nodes: [{ x: 17.5, z: 12 }], align: 0.2 })
    expect(drawn.point).toEqual({ x: 17.5, z: 14.1 })
    expect(drawn.traces).toEqual([{ x1: 17.5, z1: 12, x2: 17.5, z2: 14.1 }])
    expect(guidePavingPoint({ x: 17.52, z: 14.13 }, { points: [], edges: [] }, 0.3)).toEqual({ point: { x: 17.5, z: 14.15 }, snapped: false, traces: [] })
  })
})

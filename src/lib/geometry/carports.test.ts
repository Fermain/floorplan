import { describe, expect, it } from 'vitest'
import { takeoff } from '../cost/quantities'
import { carportPosts, carportRing, carportSize } from '../model/carports'
import { addCarport, addWallRing, removeCarport, setProjectDefaults, updateCarport } from '../model/mutations'
import { deriveRooms } from '../model/rooms'
import type { Carport, Document } from '../model/types'
import { fixtureDocument } from '../plot/fixture'
import { buildCarportParts, carportAt, carportIssues, carportQuantities, snapCarport } from './carports'
import { apronPolygons, pavingPieces, pavingSnapTargets } from './paving'

const double: Omit<Carport, 'id'> = { x: 15, z: 8, dx: 0, dz: 1, bays: 2, roof: 'sheet' }

// An 8 m by 6 m house from (4, 4) to (12, 10), with an apron round it.
function house(): Document {
  const d = fixtureDocument()
  const walled = addWallRing(d, d.building.floors[0].id, [{ x: 4, z: 4 }, { x: 12, z: 4 }, { x: 12, z: 10 }, { x: 4, z: 10 }], 'double').document
  return setProjectDefaults(walled, { apronWidth: 0.6 }).document
}

describe('carports', () => {
  it('are flagged when they stand over a room or over each other, but not when they butt up to the house', () => {
    // Clear of the house, whose outside face is at about x = 12.1.
    const clear = addCarport(house(), double).document
    expect(carportIssues(clear)).toEqual([])
    const over = addCarport(house(), { ...double, x: 10, z: 7 }).document
    expect(carportIssues(over).map((issue) => issue.id)).toEqual([`carport-room:${over.carports![0].id}`])
    const pair = addCarport(clear, { ...double, x: 16, z: 9 }).document
    expect(carportIssues(pair).map((issue) => issue.id)).toEqual([`carport-carport:${pair.carports![1].id}`])
  })

  it('are placed, changed and removed, and refused off the plot or in a size that does not exist', () => {
    let doc = house()
    const placed = addCarport(doc, double)
    expect(placed.ok).toBe(true)
    doc = placed.document
    const id = doc.carports![0].id
    expect(updateCarport(doc, id, { bays: 3, roof: 'shade-cloth' }).document.carports![0]).toMatchObject({ bays: 3, roof: 'shade-cloth' })
    expect(updateCarport(doc, id, { bays: 4 as never }).ok).toBe(false)
    expect(updateCarport(doc, id, { roof: 'thatch' as never }).ok).toBe(false)
    expect(addCarport(doc, { ...double, x: -20 }).ok).toBe(false)
    expect(addCarport(doc, { ...double, dx: 2 }).ok).toBe(false)
    expect(removeCarport(doc, id).document.carports).toBeUndefined()
  })

  it('take 2.75 m a car across and 5.5 m along, on six posts', () => {
    expect(carportSize({ bays: 1 })).toEqual({ wide: 2.75, deep: 5.5 })
    expect(carportSize({ bays: 3 })).toEqual({ wide: 8.25, deep: 5.5 })
    const ring = carportRing(double)
    expect(Math.max(...ring.map((p) => p.x)) - Math.min(...ring.map((p) => p.x))).toBeCloseTo(5.5)
    expect(Math.max(...ring.map((p) => p.z)) - Math.min(...ring.map((p) => p.z))).toBeCloseTo(5.5)
    expect(carportPosts(double)).toHaveLength(6)
    // Turned a quarter turn, a single is long across the page instead of up it.
    const turned = carportRing({ ...double, bays: 1, dx: 1, dz: 0 })
    expect(Math.max(...turned.map((p) => p.x)) - Math.min(...turned.map((p) => p.x))).toBeCloseTo(5.5)
  })

  it('are not rooms: nothing is slabbed, roofed or given an apron for them', () => {
    const before = house()
    const doc = addCarport(before, double).document
    expect(deriveRooms(doc.building.floors[0])).toHaveLength(deriveRooms(before.building.floors[0]).length)
    expect(pavingPieces(doc).find((piece) => piece.apron)!.area).toBeCloseTo(pavingPieces(before).find((piece) => piece.apron)!.area, 6)
  })

  it('are picked by a point under them, and lend their corners to paving', () => {
    const doc = addCarport(house(), double).document
    expect(carportAt(doc, { x: 15, z: 8 })?.id).toBe(doc.carports![0].id)
    expect(carportAt(doc, { x: 8, z: 7 })).toBeNull()
    const corner = carportRing(double)[0]
    expect(pavingSnapTargets(doc).points.some((p) => Math.hypot(p.x - corner.x, p.z - corner.z) < 1e-9)).toBe(true)
  })

  it('snap a corner to the house when placed beside it, and otherwise to 50 mm', () => {
    const doc = house()
    // A single carport whose near corner is 150 mm off the corner of the apron.
    const apron = Math.max(...apronPolygons(doc)[0].outer.map((p) => p.x))
    const loose = { ...double, bays: 1 as const, x: apron + 0.15 + 2.75 / 2, z: 8.03 }
    const snapped = snapCarport(doc, loose, 0.4)
    expect(Math.min(...carportRing({ ...loose, ...snapped }).map((p) => p.x))).toBeCloseTo(apron, 6)
    expect(snapCarport(doc, { ...double, bays: 1, x: 11.02, z: 14.53 }, 0.2)).toEqual({ x: 11, z: 14.55 })
  })

  it('stand level on a slope, with longer posts downhill', () => {
    const doc = addCarport(house(), double).document
    const slope = (x: number) => x * 0.1
    const parts = buildCarportParts(doc, slope)
    expect(parts).toHaveLength(2)
    const frame = parts[0].geometry.getAttribute('position')
    let low = Infinity
    for (let i = 0; i < frame.count; i++) low = Math.min(low, frame.getY(i))
    const posts = carportPosts(double)
    expect(low).toBeCloseTo(Math.min(...posts.map((p) => slope(p.x))), 3)
    const roof = parts[1].geometry.getAttribute('position')
    let lowest = Infinity
    for (let i = 0; i < roof.count; i++) lowest = Math.min(lowest, roof.getY(i))
    expect(lowest).toBeGreaterThan(Math.max(...posts.map((p) => slope(p.x))) + 2.3)
    for (const part of parts) part.geometry.dispose()
  })

  it('are priced by their posts, steel and roof', () => {
    let doc = addCarport(house(), double).document
    const second = addCarport(doc, { ...double, x: 8, z: 15, bays: 1, roof: 'shade-cloth' })
    expect(second.ok).toBe(true)
    doc = second.document
    const lines = takeoff(doc).filter((line) => line.group === 'Carports')
    expect(lines.find((line) => line.id === 'carport-post')!.quantity).toBe(12)
    expect(lines.find((line) => line.id === 'carport-roof:sheet')!.quantity).toBeCloseTo(carportQuantities(doc.carports![0]).roof, 1)
    expect(lines.find((line) => line.id === 'carport-roof:shade-cloth')!.quantity).toBeGreaterThan(2.75 * 5.5)
    expect(lines.find((line) => line.id === 'carport-steel')!.quantity).toBeGreaterThan(40)
    expect(takeoff(house()).some((line) => line.group === 'Carports')).toBe(false)
  })
})

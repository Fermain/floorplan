import { describe, expect, it } from 'vitest'
import { addOpening, addWallRing, nameCell } from '../model/mutations'
import type { Document, RoomType } from '../model/types'
import { fixtureDocument } from '../plot/fixture'
import { buildingChecks, minimumWidth } from './sans'

function room(width: number, depth: number, type: RoomType = 'bedroom'): Document {
  const d = fixtureDocument()
  const fid = d.building.floors[0].id
  const ring = addWallRing(
    d,
    fid,
    [
      { x: 4, z: 4 },
      { x: 4 + width, z: 4 },
      { x: 4 + width, z: 4 + depth },
      { x: 4, z: 4 + depth },
    ],
    'double',
  )
  expect(ring.ok).toBe(true)
  const named = nameCell(ring.document, fid, 4.5, 4.5, 'Room', type)
  expect(named.ok).toBe(true)
  return named.document
}

function wallAlong(doc: Document, z: number) {
  const floor = doc.building.floors[0]
  return floor.walls.find((wall) => {
    const a = floor.corners.find((c) => c.id === wall.startCornerId)!
    const b = floor.corners.find((c) => c.id === wall.endCornerId)!
    return a.z === z && b.z === z
  })!
}

function withWindow(doc: Document, z: number, u: number): Document {
  const floor = doc.building.floors[0]
  const r = addOpening(doc, floor.id, wallAlong(doc, z).id, 'window', u)
  expect(r.ok).toBe(true)
  return r.document
}

function checksOf(doc: Document) {
  const [room] = buildingChecks(doc).rooms
  return Object.fromEntries(room.checks.map((item) => [item.id, item]))
}

describe('SANS 10400 room checks', () => {
  it('fails daylight and ventilation for a bedroom with no windows', () => {
    const checks = checksOf(room(4, 4))
    expect(checks.light.ok).toBe(false)
    expect(checks.ventilation.ok).toBe(false)
    expect(checks.area.ok).toBe(true)
    expect(checks.width.ok).toBe(true)
  })

  it('counts the glass inside the frames of windows in outside walls', () => {
    let doc = room(4, 4)
    doc = withWindow(doc, 4, 0.5)
    doc = withWindow(doc, 4, 2.5)
    const [checked] = buildingChecks(doc).rooms
    expect(checked.glazed).toBeCloseTo(2 * 0.808 * 1.042, 3)
    expect(checked.openable).toBeCloseTo(checked.glazed / 2, 9)
    const checks = checksOf(doc)
    expect(checks.light.ok).toBe(true)
    expect(checks.ventilation.ok).toBe(true)
  })

  it('does not count a window that looks into the next room', () => {
    let doc = room(8, 4)
    const floor = doc.building.floors[0]
    const west = (z: number) => floor.corners.find((c) => c.x === 4 && c.z === z)!.id
    doc = addWallRing(
      doc,
      floor.id,
      [
        { x: 8, z: 4 },
        { x: 8, z: 8 },
        { x: 4, z: 8, cornerId: west(8) },
        { x: 4, z: 4, cornerId: west(4) },
      ],
      'double',
    ).document
    const inner = doc.building.floors[0].walls.find((wall) => {
      const f = doc.building.floors[0]
      const a = f.corners.find((c) => c.id === wall.startCornerId)!
      const b = f.corners.find((c) => c.id === wall.endCornerId)!
      return a.x === 8 && b.x === 8
    })!
    doc = addOpening(doc, floor.id, inner.id, 'window', 1.5).document
    const [checked] = buildingChecks(doc).rooms
    expect(checked.glazed).toBe(0)
  })

  it('flags a habitable room that is too small or too narrow', () => {
    const checks = checksOf(room(2, 2.6))
    expect(checks.area.ok).toBe(false)
    expect(checks.width.ok).toBe(false)
    expect(checks.width.measured).toBeCloseTo(2 - 0.262, 6)
  })

  it('leaves rooms that are not habitable alone', () => {
    expect(buildingChecks(room(2, 2, 'bathroom')).rooms).toEqual([])
  })

  it('compares all the glazing to the floor it lights', () => {
    let doc = room(4, 4)
    expect(buildingChecks(doc).fenestration?.ok).toBe(true)
    for (const u of [0.3, 1.5, 2.7]) doc = withWindow(doc, 4, u)
    for (const u of [0.3, 1.5, 2.7]) doc = withWindow(doc, 8, u)
    const fenestration = buildingChecks(doc).fenestration!
    expect(fenestration.ratio).toBeGreaterThan(0.15)
    expect(fenestration.ok).toBe(false)
  })

  it('measures the narrowest width of a shape', () => {
    const ring = [
      { x: 0, z: 0 },
      { x: 5, z: 0 },
      { x: 5, z: 3 },
      { x: 0, z: 3 },
    ]
    expect(minimumWidth(ring)).toBeCloseTo(3, 9)
  })
})

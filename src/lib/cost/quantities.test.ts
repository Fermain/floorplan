import { describe, expect, it } from 'vitest'
import { addOpening, addStorey, addWallRing, nameCell, setAssumption, setRate, setRoof, updateSpace } from '../model/mutations'
import type { Document, WallSystemId } from '../model/types'
import { fixtureDocument } from '../plot/fixture'
import { scheduleWall } from '../geometry/schedule'
import { LINTEL_STEP_M, quantitiesCsv, takeoff, totalCost } from './quantities'
import { DEFAULT_RATES } from './rates'

function room(systemId: WallSystemId = 'clay-cavity'): Document {
  const d = fixtureDocument()
  const r = addWallRing(
    d,
    d.building.floors[0].id,
    [
      { x: 4, z: 4 },
      { x: 8, z: 4 },
      { x: 8, z: 8 },
      { x: 4, z: 8 },
    ],
    'double',
    systemId,
  )
  expect(r.ok).toBe(true)
  return r.document
}

function line(doc: Document, id: string) {
  return takeoff(doc).find((item) => item.id === id)
}

describe('takeoff', () => {
  it('has nothing to count on an empty plot', () => {
    const lines = takeoff(fixtureDocument())
    expect(lines).toEqual([])
    expect(totalCost(lines)).toBe(0)
  })

  it('buys every whole and cut brick in the walls, plus waste', () => {
    const doc = room()
    const floor = doc.building.floors[0]
    const units = floor.walls.reduce((sum, wall) => {
      const schedule = scheduleWall(floor, wall)
      return sum + schedule.wholeBricks + schedule.cutBricks
    }, 0)
    const bricks = line(doc, 'unit:clay-brick')
    expect(bricks?.quantity).toBe(Math.ceil(units * 1.05))
    expect(bricks?.rate).toBe(DEFAULT_RATES['unit:clay-brick'])
  })

  it('mixes mortar in proportion to the joints', () => {
    const doc = room()
    const cement = line(doc, 'mortar-cement')
    const sand = line(doc, 'mortar-sand')
    expect(cement?.quantity).toBeGreaterThan(0)
    expect(sand?.quantity).toBeGreaterThan(0)
    const richer = setAssumption(doc, 'cementBagsPerM3', 11).document
    expect(line(richer, 'mortar-cement')!.quantity).toBeGreaterThanOrEqual(2 * cement!.quantity - 1)
  })

  it('beds hollow blocks on their shells, so they take less mortar per unit of wall', () => {
    const maxi = line(room('maxi-140'), 'mortar-sand')!.quantity
    const block = line(room('block-140'), 'mortar-sand')!.quantity
    expect(block).toBeLessThan(maxi)
  })

  it('sizes strip footings from the length of ground-floor walls', () => {
    const footing = line(room(), 'footings')
    expect(footing?.quantity).toBeCloseTo(16 * 0.6 * 0.2 * 1.05, 2)
  })

  it('pours a surface bed inside the walls', () => {
    const bed = line(room(), 'surface-bed')
    expect(bed?.unit).toBe('m³')
    expect(bed?.quantity).toBeGreaterThan(16 * 0.15)
    expect(bed?.quantity).toBeLessThan(4.6 * 4.6 * 0.15 * 1.05)
  })

  it('lists windows by size and lintels by stock length, one lintel per leaf', () => {
    let doc = room()
    const floor = doc.building.floors[0]
    const wallId = floor.walls[0].id
    doc = addOpening(doc, floor.id, wallId, 'window', 1.5).document
    const lines = takeoff(doc)
    const windows = lines.filter((item) => item.group === 'Openings')
    expect(windows).toHaveLength(1)
    expect(windows[0].unit).toBe('m²')
    expect(windows[0].label).toMatch(/^Window 928 × 1162$/)
    const lintels = lines.filter((item) => item.group === 'Lintels')
    expect(lintels).toHaveLength(1)
    const stock = Number(lintels[0].id.split(':')[1])
    expect((stock / LINTEL_STEP_M) % 1).toBeCloseTo(0, 6)
    expect(lintels[0].quantity).toBeCloseTo(2 * stock, 6)
  })

  it('prices a line at the rate the user types, and returns to the example when cleared', () => {
    const doc = room()
    const priced = setRate(doc, 'unit:clay-brick', 4).document
    const bricks = line(priced, 'unit:clay-brick')!
    expect(bricks.rate).toBe(4)
    expect(bricks.amount).toBeCloseTo(bricks.quantity * 4, 2)
    const cleared = setRate(priced, 'unit:clay-brick', null).document
    expect(line(cleared, 'unit:clay-brick')!.rate).toBe(DEFAULT_RATES['unit:clay-brick'])
  })

  it('lays each floor finish over the net area of the rooms that use it', () => {
    let doc = room()
    const fid = doc.building.floors[0].id
    doc = nameCell(doc, fid, 6, 6, 'Bedroom', 'bedroom').document
    doc = updateSpace(doc, fid, doc.building.floors[0].spaces![0].id, { finish: 'tiles' }).document
    const tiles = line(doc, 'finish:tiles')!
    expect(tiles.quantity).toBeCloseTo(Math.round((4 - 0.262) ** 2 * 1.05 * 10) / 10, 6)
    expect(line(doc, 'finish:screed')).toBeUndefined()
  })

  it('adds the bricks in the gable ends of a roof over the first storey', () => {
    let doc = room()
    const ground = doc.building.floors[0]
    doc = addStorey(doc, ground.id, ground.corners[0].id).document
    const upper = doc.building.floors.find((floor) => floor.index === 1)!
    const before = line(doc, 'unit:clay-brick')!.quantity
    const hip = setRoof(doc, upper.id, { pitchDeg: 30, eaves: 0.3 })
    expect(hip.ok).toBe(true)
    expect(line(hip.document, 'unit:clay-brick')!.quantity).toBe(before)
    const gable = setRoof(doc, upper.id, { pitchDeg: 30, eaves: 0.3, form: 'gable' })
    expect(gable.ok).toBe(true)
    const bricks = line(gable.document, 'unit:clay-brick')!
    expect(bricks.quantity).toBeGreaterThan(before)
    expect(bricks.note).toMatch(/in gables/)
    expect(line(gable.document, 'roof:concrete-tile')!.quantity).toBeGreaterThan(16)
    expect(line(gable.document, 'roof:concrete-tile')!.note).toMatch(/about \d+ tiles/)
    const sheeted = setRoof(doc, upper.id, { pitchDeg: 10, eaves: 0.3, form: 'mono', covering: 'ibr' }).document
    expect(line(sheeted, 'roof:ibr')!.label).toBe('IBR steel sheeting')
    expect(line(sheeted, 'roof:concrete-tile')).toBeUndefined()
  })

  it('refuses a negative rate', () => {
    expect(setRate(room(), 'unit:clay-brick', -1).ok).toBe(false)
  })

  it('writes a CSV with a total row', () => {
    const csv = quantitiesCsv(takeoff(room()))
    const rows = csv.split('\n')
    expect(rows[0]).toBe('Group,Item,Note,Quantity,Unit,Rate (R),Amount (R)')
    expect(rows.at(-1)).toMatch(/^,Total,,,,,\d/)
    expect(csv).toContain('"')
  })
})

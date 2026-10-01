import { describe, expect, it } from 'vitest'
import { fixtureDocument } from '../plot/fixture'
import { addFixtures, addStorey, addWallRing, setBackupHours, setEssential, setRoof, setSolarPanels } from '../model/mutations'
import type { Document, Fixture } from '../model/types'
import { takeoff } from '../cost/quantities'
import { BATTERY_MODULE_KWH, facingFactor, powerLayout, suggestedPanels } from './power'

type Draft = Omit<Fixture, 'id'>
const east = { dx: 1, dz: 0 }

function house(): Document {
  let d = fixtureDocument()
  const id = d.building.floors[0].id
  d = addWallRing(d, id, [{ x: 4, z: 4 }, { x: 14, z: 4 }, { x: 14, z: 12 }, { x: 4, z: 12 }], 'double').document
  const drafts: Draft[] = [
    { kind: 'db-board', x: 4.3, z: 5, ...east, y: 1.4 },
    { kind: 'light', x: 7, z: 7, ...east, y: 2.4 },
    { kind: 'light', x: 11, z: 7, ...east, y: 2.4 },
    { kind: 'socket', x: 6, z: 11.8, dx: 0, dz: -1, y: 0.3 },
    { kind: 'socket', x: 9, z: 11.8, dx: 0, dz: -1, y: 0.3 },
    { kind: 'stove-isolator', x: 13.8, z: 8, dx: -1, dz: 0, y: 1.4 },
  ]
  d = addFixtures(d, id, drafts).document
  const ground = d.building.floors[0]
  d = addStorey(d, ground.id, ground.corners[0].id).document
  const plate = d.building.floors.find((floor) => floor.index === 1)!
  return setRoof(d, plate.id, { pitchDeg: 30, eaves: 0.5, form: 'gable', covering: 'concrete-tile' }).document
}

describe('facing', () => {
  it('scores north-facing slopes best and south-facing worst', () => {
    expect(facingFactor({ x: 0, z: 1 }, 0)).toBeCloseTo(1)
    expect(facingFactor({ x: 1, z: 0 }, 0)).toBeCloseTo(0.8)
    expect(facingFactor({ x: 0, z: -1 }, 0)).toBeCloseTo(0.6)
  })
})

describe('load shedding backup', () => {
  it('sizes the inverter and battery from the circuits marked essential', () => {
    let doc = house()
    expect(powerLayout(doc).inverterKva).toBeNull()
    doc = setEssential(doc, 'L1', true).document
    doc = setEssential(doc, 'P1', true).document
    doc = setBackupHours(doc, 4).document
    const power = powerLayout(doc)
    expect(power.running).toBe(20 + 150 + 50)
    expect(power.inverterKva).toBe(3)
    expect(power.batteryModules).toBe(1)
    expect(power.batteryKwh).toBeCloseTo((220 * 4) / 1000 / 0.9, 6)
    expect(power.warnings).toEqual([])
    doc = setEssential(doc, 'S1', true).document
    expect(powerLayout(doc).warnings.map((w) => w.id)).toContain('heavy:S1')
    doc = setEssential(doc, 'S1', false).document
    expect(powerLayout(doc).essential.map((c) => c.id)).toEqual(['L1', 'P1'])
  })
})

describe('solar panels', () => {
  it('lays panels on the sunnier roof faces and prices the system', () => {
    let doc = setEssential(setEssential(house(), 'L1', true).document, 'P1', true).document
    const empty = powerLayout(doc)
    expect(empty.capacity).toBeGreaterThan(0)
    const suggested = suggestedPanels(empty)
    expect(suggested).toBeGreaterThan(0)
    expect(setSolarPanels(doc, 999).ok).toBe(false)
    doc = setSolarPanels(doc, empty.capacity + 5).document
    const capped = powerLayout(doc)
    expect(capped.panels).toBe(empty.capacity)
    expect(capped.panelSpots).toHaveLength(empty.capacity)
    for (const spot of capped.panelSpots) expect(spot.corners).toHaveLength(4)
    doc = setSolarPanels(doc, 4).document
    const power = powerLayout(doc)
    expect(power.kwp).toBeCloseTo(2.2)
    expect(power.yearly).toBeGreaterThan(0)
    const ids = takeoff(doc).map((line) => line.id)
    for (const id of ['inverter:3', 'battery', 'essentials-board', 'solar-panel', 'panel-mounting']) expect(ids).toContain(id)
    expect(BATTERY_MODULE_KWH).toBeGreaterThan(5)
  })
})

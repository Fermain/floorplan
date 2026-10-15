import { describe, expect, it } from 'vitest'
import { fixtureDocument } from '../plot/fixture'
import { addFixture, addWallRing } from '../model/mutations'
import { AIRCON_BTUS, AIRCON_SIZES, DEFAULT_AIRCON_BTU, fixtureSize, reseat, sizeName, stepSize } from '../model/fixtures'
import type { Document } from '../model/types'
import { airconIssues, airconLayout, formatBtu, recommendedAirconBtu } from './aircon'
import { buildFixtureParts, placeFixture } from './fixtures'
import { electricalLayout } from './electrical'
import { serviceRuns } from './serviceRuns'
import { takeoff } from '../cost/quantities'

function createHouse(): Document {
  const d = fixtureDocument()
  const r = addWallRing(
    d,
    d.building.floors[0].id,
    [
      { x: 2, z: 2 },
      { x: 10, z: 2 },
      { x: 10, z: 8 },
      { x: 2, z: 8 },
    ],
    'double',
  )
  expect(r.ok).toBe(true)
  return r.document
}

describe('air conditioning model and sizing', () => {
  it('defines standard BTU sizes and dimensions', () => {
    expect(AIRCON_BTUS).toEqual([9000, 12000, 18000, 24000])
    expect(DEFAULT_AIRCON_BTU).toBe(12000)

    for (const btu of AIRCON_BTUS) {
      const spec = AIRCON_SIZES[btu]
      expect(spec.indoor.width).toBeGreaterThan(0.7)
      expect(spec.indoor.height).toBeGreaterThan(0.2)
      expect(spec.outdoor.width).toBeGreaterThan(0.7)
      expect(spec.indoor.m2Max).toBeGreaterThan(10)
    }
  })

  it('steps through BTU sizes with stepSize and formats with sizeName', () => {
    expect(sizeName('aircon-indoor', { btu: 9000 })).toBe(formatBtu(9000))
    expect(sizeName('aircon-outdoor', { btu: 24000 })).toBe(formatBtu(24000))

    const stepUp = stepSize('aircon-indoor', { btu: 9000 }, 1)
    expect(stepUp.btu).toBe(12000)
    const stepUp2 = stepSize('aircon-indoor', stepUp, 1)
    expect(stepUp2.btu).toBe(18000)
    const stepDown = stepSize('aircon-outdoor', { btu: 18000 }, -1)
    expect(stepDown.btu).toBe(12000)
  })

  it('re-seats when BTU size changes', () => {
    const indoor = { kind: 'aircon-indoor' as const, x: 5, z: 5, dx: 0, dz: 1, y: 2.0, btu: 9000 as const }
    const resized = reseat(indoor, { btu: 24000 })
    expect(resized.btu).toBe(24000)
    // Sizing should expand depth
    const d9 = fixtureSize(indoor).depth
    const d24 = fixtureSize(resized).depth
    expect(resized.z).toBeCloseTo(5 + (d24 - d9) / 2)
  })

  it('calculates recommended BTU based on room floor area', () => {
    expect(recommendedAirconBtu(15)).toBe(9000)
    expect(recommendedAirconBtu(22)).toBe(12000)
    expect(recommendedAirconBtu(32)).toBe(18000)
    expect(recommendedAirconBtu(48)).toBe(24000)
  })
})

describe('air conditioning layout and pairing', () => {
  it('pairs back-to-back indoor and outdoor units directly through the wall', () => {
    let doc = createHouse()
    const floor = doc.building.floors[0]

    // Indoor unit against north wall (facing into room +z) sized for the room
    const inPlacement = placeFixture(floor, { x: 5, z: 2.3 }, 'aircon-indoor', { x: 0, z: 1 }, { setup: { btu: 24000 } })
    expect(inPlacement.problem).toBeNull()
    const r1 = addFixture(doc, floor.id, inPlacement.fixture)
    expect(r1.ok).toBe(true)
    doc = r1.document

    // Outdoor unit on opposite exterior face of north wall (facing outside -z)
    const outPlacement = placeFixture(doc.building.floors[0], { x: 5, z: 1.8 }, 'aircon-outdoor', { x: 0, z: -1 }, { setup: { btu: 24000 } })
    expect(outPlacement.problem).toBeNull()
    const r2 = addFixture(doc, floor.id, outPlacement.fixture)
    expect(r2.ok).toBe(true)
    doc = r2.document

    const layout = airconLayout(doc)
    expect(layout.indoors.length).toBe(1)
    expect(layout.outdoors.length).toBe(1)
    expect(layout.pairs.length).toBe(1)

    const pair = layout.pairs[0]
    expect(pair.direct).toBe(true)
    // Direct wall penetration has short pipe length
    expect(pair.pipeLength).toBeLessThan(3)
    expect(pair.condensateLength).toBeLessThan(3)
    expect(layout.issues).toHaveLength(0)
  })

  it('warns when an air conditioner is undersized for a large room', () => {
    let doc = createHouse()
    const floor = doc.building.floors[0]

    // 9,000 BTU unit in 48 m² room (which needs 24,000 BTU)
    const inPlacement = placeFixture(floor, { x: 5, z: 2.3 }, 'aircon-indoor', { x: 0, z: 1 }, { setup: { btu: 9000 } })
    const r1 = addFixture(doc, floor.id, inPlacement.fixture)
    const outPlacement = placeFixture(r1.document.building.floors[0], { x: 5, z: 1.8 }, 'aircon-outdoor', { x: 0, z: -1 }, { setup: { btu: 9000 } })
    doc = addFixture(r1.document, floor.id, outPlacement.fixture).document

    const layout = airconLayout(doc)
    const undersized = layout.issues.find((i) => i.id.startsWith('aircon-undersized-'))
    expect(undersized).toBeDefined()
    expect(undersized?.text).toContain(`${formatBtu(9000)} unit cools up to 18 m²`)
    expect(undersized?.text).toContain(`recommended: ${formatBtu(24000)}`)
  })

  it('pairs indirect indoor and outdoor units and routes across ceiling', () => {
    let doc = createHouse()
    const floor = doc.building.floors[0]

    // Indoor unit on north wall
    const inPlacement = placeFixture(floor, { x: 4, z: 2.3 }, 'aircon-indoor', { x: 0, z: 1 })
    const r1 = addFixture(doc, floor.id, inPlacement.fixture)
    doc = r1.document

    // Outdoor unit on south wall far away
    const outPlacement = placeFixture(doc.building.floors[0], { x: 9, z: 8.2 }, 'aircon-outdoor', { x: 0, z: 1 })
    const r2 = addFixture(doc, floor.id, outPlacement.fixture)
    doc = r2.document

    const layout = airconLayout(doc)
    expect(layout.pairs.length).toBe(1)
    const pair = layout.pairs[0]
    expect(pair.direct).toBe(false)
    expect(pair.pipeLength).toBeGreaterThan(6)
    // Condensate drain drops straight to the outside wall behind the indoor unit rather than copying refrigerant route
    expect(pair.condensateLength).toBeLessThan(3.5)
    expect(pair.condensatePath[pair.condensatePath.length - 1].z).toBeLessThan(2.3)
  })

  it('flags unpaired indoor units and unpaired outdoor compressors', () => {
    let doc = createHouse()
    const floor = doc.building.floors[0]

    // Place only indoor unit
    const inPlacement = placeFixture(floor, { x: 5, z: 2.3 }, 'aircon-indoor', { x: 0, z: 1 })
    const r1 = addFixture(doc, floor.id, inPlacement.fixture)
    doc = r1.document

    const layout = airconLayout(doc)
    expect(layout.unpairedIndoors.length).toBe(1)
    expect(layout.issues.some((i) => i.id.startsWith('aircon-no-outdoor-'))).toBe(true)

    // Place an extra outdoor unit
    const outPlacement1 = placeFixture(doc.building.floors[0], { x: 5, z: 1.8 }, 'aircon-outdoor', { x: 0, z: -1 })
    const r2 = addFixture(doc, floor.id, outPlacement1.fixture)
    const outPlacement2 = placeFixture(r2.document.building.floors[0], { x: 8, z: 1.8 }, 'aircon-outdoor', { x: 0, z: -1 })
    const r3 = addFixture(r2.document, floor.id, outPlacement2.fixture)
    doc = r3.document

    const layout2 = airconLayout(doc)
    expect(layout2.pairs.length).toBe(1)
    expect(layout2.unpairedOutdoors.length).toBe(1)
    expect(layout2.issues.some((i) => i.id.startsWith('aircon-no-indoor-'))).toBe(true)
    expect(airconIssues(doc)).toEqual(layout2.issues)
  })

  it('provides dedicated 20A circuit for outdoor compressors in electricalLayout', () => {
    let doc = createHouse()
    const floor = doc.building.floors[0]

    // Place DB board
    const dbPlacement = placeFixture(floor, { x: 3, z: 2.3 }, 'db-board', { x: 0, z: 1 })
    doc = addFixture(doc, floor.id, dbPlacement.fixture).document

    // Place outdoor unit
    const outPlacement = placeFixture(doc.building.floors[0], { x: 6, z: 1.8 }, 'aircon-outdoor', { x: 0, z: -1 })
    doc = addFixture(doc, floor.id, outPlacement.fixture).document

    const electrical = electricalLayout(doc)
    const acCircuits = electrical.circuits.filter((c) => c.kind === 'aircon')
    expect(acCircuits.length).toBe(1)
    expect(acCircuits[0].breaker).toBe(20)
    expect(acCircuits[0].cable).toBe(2.5)
  })

  it('generates 3D fixture pieces and service runs without errors', () => {
    let doc = createHouse()
    const floor = doc.building.floors[0]

    const inPlacement = placeFixture(floor, { x: 5, z: 2.3 }, 'aircon-indoor', { x: 0, z: 1 })
    doc = addFixture(doc, floor.id, inPlacement.fixture).document
    const outPlacement = placeFixture(doc.building.floors[0], { x: 5, z: 1.8 }, 'aircon-outdoor', { x: 0, z: -1 })
    doc = addFixture(doc, floor.id, outPlacement.fixture).document

    const parts = buildFixtureParts(doc.building.floors[0].fixtures!, 0)
    expect(parts.length).toBeGreaterThan(0)

    const runs = serviceRuns(doc)
    const acRuns = runs.filter((r) => r.kind === 'aircon')
    expect(acRuns.length).toBe(1)
    expect(acRuns[0].points.length).toBeGreaterThanOrEqual(2)
  })

  it('quantifies indoor, outdoor, isolator, and piping in takeoff', () => {
    let doc = createHouse()
    const floor = doc.building.floors[0]

    const inPlacement = placeFixture(floor, { x: 5, z: 2.3 }, 'aircon-indoor', { x: 0, z: 1 })
    doc = addFixture(doc, floor.id, inPlacement.fixture).document
    const outPlacement = placeFixture(doc.building.floors[0], { x: 5, z: 1.8 }, 'aircon-outdoor', { x: 0, z: -1 })
    doc = addFixture(doc, floor.id, outPlacement.fixture).document

    const lines = takeoff(doc)
    const acLines = lines.filter((d) => d.group === 'Air conditioning')
    expect(acLines.some((d) => d.id === 'aircon-indoor:12000')).toBe(true)
    expect(acLines.some((d) => d.id === 'aircon-outdoor:12000')).toBe(true)
    expect(acLines.some((d) => d.id === 'aircon-isolator')).toBe(true)
    expect(acLines.some((d) => d.id === 'aircon-pipe')).toBe(true)

    // Quantifies condensate drain pipe under Plumbing
    const plumbingLines = lines.filter((d) => d.group === 'Plumbing')
    expect(plumbingLines.some((d) => d.id === 'aircon-condensate-pipe')).toBe(true)
  })

  it('prefers matching BTU sizes during pairing regardless of creation order', () => {
    let doc = createHouse()
    const floor = doc.building.floors[0]

    // Indoor A: 9,000 BTU at x=4; Indoor B: 24,000 BTU at x=8
    const in9 = placeFixture(floor, { x: 4, z: 2.3 }, 'aircon-indoor', { x: 0, z: 1 }, { setup: { btu: 9000 } })
    const in24 = placeFixture(floor, { x: 8, z: 2.3 }, 'aircon-indoor', { x: 0, z: 1 }, { setup: { btu: 24000 } })
    doc = addFixture(addFixture(doc, floor.id, in9.fixture).document, floor.id, in24.fixture).document

    // Outdoor compressors placed in reverse order: 24k first at x=8, 9k second at x=4
    const out24 = placeFixture(doc.building.floors[0], { x: 8, z: 1.8 }, 'aircon-outdoor', { x: 0, z: -1 }, { setup: { btu: 24000 } })
    const out9 = placeFixture(doc.building.floors[0], { x: 4, z: 1.8 }, 'aircon-outdoor', { x: 0, z: -1 }, { setup: { btu: 9000 } })
    doc = addFixture(addFixture(doc, floor.id, out24.fixture).document, floor.id, out9.fixture).document

    const layout = airconLayout(doc)
    expect(layout.pairs).toHaveLength(2)

    const pair9 = layout.pairs.find((p) => p.indoor.btu === 9000)!
    const pair24 = layout.pairs.find((p) => p.indoor.btu === 24000)!
    expect(pair9.outdoor.btu).toBe(9000)
    expect(pair24.outdoor.btu).toBe(24000)
    expect(layout.issues.some((i) => i.id.startsWith('aircon-size-mismatch-'))).toBe(false)
  })

  it('flags size mismatch when units have different ratings', () => {
    let doc = createHouse()
    const floor = doc.building.floors[0]

    // Indoor 24k paired with outdoor 9k
    const inPlacement = placeFixture(floor, { x: 5, z: 2.3 }, 'aircon-indoor', { x: 0, z: 1 }, { setup: { btu: 24000 } })
    doc = addFixture(doc, floor.id, inPlacement.fixture).document
    const outPlacement = placeFixture(doc.building.floors[0], { x: 5, z: 1.8 }, 'aircon-outdoor', { x: 0, z: -1 }, { setup: { btu: 9000 } })
    doc = addFixture(doc, floor.id, outPlacement.fixture).document

    const layout = airconLayout(doc)
    expect(layout.pairs).toHaveLength(1)
    const mismatch = layout.issues.find((i) => i.id.startsWith('aircon-size-mismatch-'))
    expect(mismatch).toBeDefined()
    expect(mismatch?.text).toContain('mismatched outdoor compressor')
  })

  it('scales electrical load according to BTU rating', async () => {
    const { powerLayout } = await import('./power')
    let doc = createHouse()
    const floor = doc.building.floors[0]

    // Place DB board
    const dbPlacement = placeFixture(floor, { x: 3, z: 2.3 }, 'db-board', { x: 0, z: 1 })
    doc = addFixture(doc, floor.id, dbPlacement.fixture).document

    // Place 9,000 BTU outdoor unit
    const out9 = placeFixture(doc.building.floors[0], { x: 5, z: 1.8 }, 'aircon-outdoor', { x: 0, z: -1 }, { setup: { btu: 9000 } })
    const doc9 = addFixture(doc, floor.id, out9.fixture).document
    const wiring9 = electricalLayout(doc9)
    const ac9 = wiring9.circuits.find((c) => c.kind === 'aircon')!
    doc9.services = { essential: [ac9.id] }
    const p9 = powerLayout(doc9)

    // Place 24,000 BTU outdoor unit
    const out24 = placeFixture(doc.building.floors[0], { x: 5, z: 1.8 }, 'aircon-outdoor', { x: 0, z: -1 }, { setup: { btu: 24000 } })
    const doc24 = addFixture(doc, floor.id, out24.fixture).document
    const wiring24 = electricalLayout(doc24)
    const ac24 = wiring24.circuits.find((c) => c.kind === 'aircon')!
    doc24.services = { essential: [ac24.id] }
    const p24 = powerLayout(doc24)

    // 9,000 BTU unit (0.8 kW peak) draws significantly less than 24,000 BTU unit (2.2 kW peak)
    expect(p9.peak).toBe(800)
    expect(p24.peak).toBe(2200)
    expect(p24.peak - p9.peak).toBe(1400) // 2200 - 800
  })

  it('warns when pipe run exceeds pre-charged (7.5 m) or maximum limit (25 m)', () => {
    let doc = createHouse()
    const floor = doc.building.floors[0]

    // Indirect pair over ceiling with ~10m pipe
    const inPlacement = placeFixture(floor, { x: 3, z: 2.3 }, 'aircon-indoor', { x: 0, z: 1 })
    doc = addFixture(doc, floor.id, inPlacement.fixture).document
    const outPlacement = placeFixture(doc.building.floors[0], { x: 9, z: 8.2 }, 'aircon-outdoor', { x: 0, z: 1 })
    doc = addFixture(doc, floor.id, outPlacement.fixture).document

    const layout = airconLayout(doc)
    expect(layout.pairs[0].pipeLength).toBeGreaterThan(7.5)
    expect(layout.issues.some((i) => i.id.startsWith('aircon-pipe-long-'))).toBe(true)
  })
})

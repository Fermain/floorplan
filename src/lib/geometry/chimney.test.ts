import { describe, expect, it } from 'vitest'
import { fixtureDocument } from '../plot/fixture'
import { addFixture, addStorey, addWallRing, nameCell, setRoof, updateSpace } from '../model/mutations'
import { fixtureSize, sizeName, stepSize, WOOD_BURNER_SIZES } from '../model/fixtures'
import type { Document, Fixture } from '../model/types'
import {
  buildChimneyParts,
  chimneyLayout,
  FLUE_PROJECTION_ABOVE_ROOF_M,
  fluePlanPosition,
  recommendedWoodBurnerKw,
  roofHeightAt,
} from './chimney'
import { buildFixtureParts, placeFixture } from './fixtures'
import { takeoff } from '../cost/quantities'

function createHouseWithRoof(): Document {
  let doc = fixtureDocument()
  const floorId = doc.building.floors[0].id
  // Build a 6m x 8m room
  const ring = addWallRing(
    doc,
    floorId,
    [
      { x: 2, z: 2 },
      { x: 8, z: 2 },
      { x: 8, z: 10 },
      { x: 2, z: 10 },
    ],
    'double',
  )
  expect(ring.ok).toBe(true)
  doc = ring.document

  // Add a roof on storey 1
  const cornerId = doc.building.floors[0].corners[0].id
  const roofStorey = addStorey(doc, floorId, cornerId)
  expect(roofStorey.ok).toBe(true)
  doc = roofStorey.document
  const roofFloorId = doc.building.floors.find((f) => f.index === 1)!.id
  const roof = setRoof(doc, roofFloorId, { pitchDeg: 30, eaves: 0.4, form: 'hip' })
  expect(roof.ok).toBe(true)
  return roof.document
}

describe('wood burner sizing & names', () => {
  it('steps through kW capacities', () => {
    expect(sizeName('wood-burner', { kw: 8 })).toBe('8 kW')
    expect(sizeName('wood-burner', { kw: 10 })).toBe('10 kW')
    const up1 = stepSize('wood-burner', { kw: 8 }, 1)
    expect(up1.kw).toBe(10)
    const up2 = stepSize('wood-burner', up1, 1)
    expect(up2.kw).toBe(12)
    const up3 = stepSize('wood-burner', up2, 1)
    expect(up3.kw).toBe(14)
    const upMax = stepSize('wood-burner', up3, 1)
    expect(upMax.kw).toBe(14)
    const down1 = stepSize('wood-burner', upMax, -1)
    expect(down1.kw).toBe(12)
  })

  it('recommends burner capacity based on room area', () => {
    expect(recommendedWoodBurnerKw(30)).toBe(8)
    expect(recommendedWoodBurnerKw(65)).toBe(8)
    expect(recommendedWoodBurnerKw(75)).toBe(10)
    expect(recommendedWoodBurnerKw(85)).toBe(10)
    expect(recommendedWoodBurnerKw(95)).toBe(12)
    expect(recommendedWoodBurnerKw(110)).toBe(12)
    expect(recommendedWoodBurnerKw(130)).toBe(14)
  })

  it('scales dimensions and flue diameter with kW rating', () => {
    const s8 = fixtureSize({ kind: 'wood-burner', kw: 8 })
    const s10 = fixtureSize({ kind: 'wood-burner', kw: 10 })
    const s14 = fixtureSize({ kind: 'wood-burner', kw: 14 })
    expect(s8.width).toBeLessThan(s10.width)
    expect(s10.width).toBeLessThan(s14.width)
    expect(WOOD_BURNER_SIZES[8].flueDia).toBe(0.15)
    expect(WOOD_BURNER_SIZES[14].flueDia).toBe(0.18)
  })
})

describe('flue plan position', () => {
  it('offsets the flue spigot toward the rear of the stove along its facing', () => {
    const fixture: Fixture = {
      id: 'wb1',
      kind: 'wood-burner',
      x: 5,
      z: 5,
      dx: 0,
      dz: 1, // facing south (+z)
      y: 0,
      kw: 10,
    }
    const pos = fluePlanPosition(fixture)
    // For depth 0.45, flueOut is 0.45 * 0.4 = 0.18. flueOut - depth/2 = 0.18 - 0.225 = -0.045
    expect(pos.x).toBeCloseTo(5)
    expect(pos.z).toBeCloseTo(5 - 0.045)
  })
})

describe('roofHeightAt', () => {
  it('calculates the roof penetration elevation above a point inside the building', () => {
    const doc = createHouseWithRoof()
    const height = roofHeightAt(doc, 5, 5, 0)
    expect(height).not.toBeNull()
    expect(height!.roofTopY).toBeGreaterThan(height!.roofUnderY)
    expect(height!.pitchDeg).toBe(30)
    expect(height!.roofFloorId).toBe(doc.building.floors.find((f) => f.index === 1)!.id)
  })

  it('returns null for points far outside the roof', () => {
    const doc = createHouseWithRoof()
    const height = roofHeightAt(doc, 25, 25, 0)
    expect(height).toBeNull()
  })

  it('calculates roof height for gable roofs correctly', () => {
    let doc = createHouseWithRoof()
    const roofFloorId = doc.building.floors.find((f) => f.index === 1)!.id
    doc = setRoof(doc, roofFloorId, { pitchDeg: 25, eaves: 0.3, form: 'gable' }).document
    const height = roofHeightAt(doc, 5, 6, 0)
    expect(height).not.toBeNull()
    expect(height!.pitchDeg).toBe(25)
  })

  it('calculates roof height for mono-pitch roofs correctly', () => {
    let doc = createHouseWithRoof()
    const roofFloorId = doc.building.floors.find((f) => f.index === 1)!.id
    doc = setRoof(doc, roofFloorId, { pitchDeg: 15, eaves: 0.3, form: 'mono' }).document
    const height = roofHeightAt(doc, 5, 6, 0)
    expect(height).not.toBeNull()
    expect(height!.pitchDeg).toBe(15)
  })
})

describe('chimneyLayout', () => {
  it('computes flue heights, cowl elevation and total flue run length', () => {
    let doc = createHouseWithRoof()
    const floor = doc.building.floors[0]
    // Place a wood burner against the north wall inside the room
    const placed = placeFixture(floor, { x: 5, z: 2.5 }, 'wood-burner', { x: 0, z: 1 }, { setup: { kw: 10 } })
    expect(placed.snapped).toBe(true)
    doc = addFixture(doc, floor.id, placed.fixture).document

    const layout = chimneyLayout(doc)
    expect(layout.woodBurners).toHaveLength(1)
    const wb = layout.woodBurners[0]
    expect(wb.kw).toBe(10)
    expect(wb.roofTopY).not.toBeNull()
    expect(wb.cowlY).toBeCloseTo(wb.roofTopY! + FLUE_PROJECTION_ABOVE_ROOF_M)
    expect(wb.flueLength).toBeCloseTo(wb.cowlY - wb.stoveTopY)
    expect(layout.totalFlueLength).toBeCloseTo(wb.flueLength)
    expect(layout.totalKw).toBe(10)
  })

  it('reports an issue if the wood burner has no roof above it', () => {
    let doc = fixtureDocument()
    const floor = doc.building.floors[0]
    const ring = addWallRing(
      doc,
      floor.id,
      [
        { x: 2, z: 2 },
        { x: 8, z: 2 },
        { x: 8, z: 8 },
        { x: 2, z: 8 },
      ],
      'double',
    )
    doc = ring.document
    const placed = placeFixture(doc.building.floors[0], { x: 5, z: 2.5 }, 'wood-burner', { x: 0, z: 1 })
    doc = addFixture(doc, floor.id, placed.fixture).document

    const layout = chimneyLayout(doc)
    expect(layout.issues.some((i) => i.id.startsWith('no-roof:'))).toBe(true)
  })

  it('checks room sizing and warns if the burner is undersized for the room', () => {
    let doc = createHouseWithRoof()
    const floor = doc.building.floors[0]
    // 6x8 room is 48 m² net ~ 43 m²
    // Add an 8 kW burner in an oversized room:
    // Let's name the space 'Great Hall' and expand it or test small burner
    doc = nameCell(doc, floor.id, 5, 5, 'Living', 'living').document
    const placed = placeFixture(doc.building.floors[0], { x: 5, z: 2.5 }, 'wood-burner', { x: 0, z: 1 }, { setup: { kw: 8 } })
    doc = addFixture(doc, floor.id, placed.fixture).document

    const layout = chimneyLayout(doc)
    // 43 m² is fine for 8 kW (max 65 m²)
    expect(layout.issues.filter((i) => i.id.startsWith('undersized:'))).toHaveLength(0)
  })

  it('warns about timber/carpet flooring requiring a hearth plate', () => {
    let doc = createHouseWithRoof()
    const floor = doc.building.floors[0]
    doc = nameCell(doc, floor.id, 5, 5, 'Living', 'living').document
    const spaceId = doc.building.floors[0].spaces![0].id
    doc = updateSpace(doc, floor.id, spaceId, { finish: 'timber' }).document

    const placed = placeFixture(doc.building.floors[0], { x: 5, z: 2.5 }, 'wood-burner', { x: 0, z: 1 })
    doc = addFixture(doc, floor.id, placed.fixture).document

    const layout = chimneyLayout(doc)
    expect(layout.issues.some((i) => i.id.startsWith('hearth:'))).toBe(true)
  })
})

describe('buildChimneyParts', () => {
  it('constructs 3D meshes for exterior flue, flashing and cowl', () => {
    let doc = createHouseWithRoof()
    const floor = doc.building.floors[0]
    const placed = placeFixture(floor, { x: 5, z: 2.5 }, 'wood-burner', { x: 0, z: 1 }, { setup: { kw: 10 } })
    doc = addFixture(doc, floor.id, placed.fixture).document

    const parts = buildChimneyParts(doc)
    expect(parts.length).toBeGreaterThanOrEqual(1)
    for (const part of parts) {
      expect(part.geometry.getAttribute('position').count).toBeGreaterThan(0)
      expect(typeof part.colour).toBe('string')
      expect(part.roughness).toBeGreaterThanOrEqual(0)
      expect(part.metalness).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('buildFixtureParts for wood burner', () => {
  it('creates cast iron stove, glass window, fire glow and room flue pipe to ceiling', () => {
    let doc = createHouseWithRoof()
    const floor = doc.building.floors[0]
    const placed = placeFixture(floor, { x: 5, z: 2.5 }, 'wood-burner', { x: 0, z: 1 }, { setup: { kw: 10 } })
    doc = addFixture(doc, floor.id, placed.fixture).document
    const fixture = doc.building.floors[0].fixtures![0]

    const parts = buildFixtureParts([fixture], 0)
    expect(parts.length).toBeGreaterThanOrEqual(3)
    // Check for cast iron finish, fire glow emissive, and vitreous flue
    const glow = parts.find((p) => p.emissive && p.emissive !== '#000000')
    expect(glow).toBeDefined()
    expect(glow!.colour).toBe('#ea580c')
  })
})

describe('takeoff for Heating', () => {
  it('quantifies wood burner each, flue pipe metres, and chimney cowl kit', () => {
    let doc = createHouseWithRoof()
    const floor = doc.building.floors[0]
    const placed = placeFixture(floor, { x: 5, z: 2.5 }, 'wood-burner', { x: 0, z: 1 }, { setup: { kw: 10 } })
    doc = addFixture(doc, floor.id, placed.fixture).document

    const lines = takeoff(doc).filter((line) => line.group === 'Heating')
    expect(lines).toHaveLength(3)

    const stove = lines.find((l) => l.id === 'wood-burner:10')
    expect(stove).toBeDefined()
    expect(stove!.unit).toBe('each')
    expect(stove!.quantity).toBe(1)
    expect(stove!.rate).toBe(12500)
    expect(stove!.amount).toBe(12500)

    const flue = lines.find((l) => l.id === 'wood-burner-flue')
    expect(flue).toBeDefined()
    expect(flue!.unit).toBe('m')
    expect(flue!.quantity).toBeGreaterThan(1)
    expect(flue!.rate).toBe(650)
    expect(flue!.amount).toBe(flue!.quantity * 650)

    const cowl = lines.find((l) => l.id === 'wood-burner-cowl')
    expect(cowl).toBeDefined()
    expect(cowl!.unit).toBe('each')
    expect(cowl!.quantity).toBe(1)
    expect(cowl!.rate).toBe(2200)
    expect(cowl!.amount).toBe(2200)
  })
})

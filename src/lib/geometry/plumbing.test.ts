import { describe, expect, it } from 'vitest'
import { fixtureDocument } from '../plot/fixture'
import { addFixtures, addWallRing, setServiceBends, setServicePoint } from '../model/mutations'
import type { Document, Fixture } from '../model/types'
import { takeoff } from '../cost/quantities'
import { DRAIN_FALL, drainProfile, MIN_COVER_M, plumbingLayout, serviceExit } from './plumbing'
import { pointInRing, structureRings } from './pad'

type Draft = Omit<Fixture, 'id'>

function house(drafts: Draft[]): Document {
  let d = fixtureDocument()
  const id = d.building.floors[0].id
  d = addWallRing(d, id, [{ x: 4, z: 4 }, { x: 10, z: 4 }, { x: 10, z: 8 }, { x: 4, z: 8 }], 'double').document
  return drafts.length ? addFixtures(d, id, drafts).document : d
}

const bathroom: Draft[] = [
  { kind: 'wc', x: 9.5, z: 5, dx: -1, dz: 0, y: 0 },
  { kind: 'basin', x: 9.6, z: 6.5, dx: -1, dz: 0, y: 0.67 },
  { kind: 'shower', x: 5, z: 5, dx: 1, dz: 0, y: 0 },
]

describe('drain profile', () => {
  const flat = () => 0
  it('falls at its minimum from the house and reaches a sewer that is deep enough', () => {
    const path = [{ x: 0, z: 0 }, { x: 30, z: 0 }]
    const profile = drainProfile(path, -0.3, flat, 1)
    expect(profile.points.at(-1)!.invert).toBeCloseTo(-0.3 - 30 / DRAIN_FALL[110], 6)
    expect(profile.shortBy).toBe(0)
    expect(profile.length).toBeCloseTo(30)
  })

  it('says how far short it falls when the sewer is uphill', () => {
    const rising = (x: number) => x / 15
    const profile = drainProfile([{ x: 0, z: 0 }, { x: 30, z: 0 }], -0.3, rising, 1)
    expect(profile.shortBy).toBeCloseTo(1 - (-0.3 - 0.5), 6)
  })

  it('goes deeper to keep its cover where the ground dips', () => {
    const dip = (x: number) => (x > 10 && x < 20 ? -1 : 0)
    const profile = drainProfile([{ x: 0, z: 0 }, { x: 30, z: 0 }], -0.3, dip, 1)
    expect(profile.points.at(-1)!.invert).toBeLessThanOrEqual(-1 - MIN_COVER_M)
  })
})

describe('plumbing layout', () => {
  it('leaves the house on its outside face, near the wet fittings', () => {
    const doc = house(bathroom)
    const exit = serviceExit(doc)!
    const rings = structureRings(doc.building.floors[0])
    expect(rings.some((ring) => pointInRing(ring, exit.x, exit.z))).toBe(false)
  })

  it('asks for a geyser, then for a solar one, and warns about a long hot run', () => {
    expect(plumbingLayout(house(bathroom)).issues.map((i) => i.id)).toContain('no-geyser')
    const electric = house([...bathroom, { kind: 'geyser', x: 7, z: 6, dx: 1, dz: 0, y: 2.6 }])
    expect(plumbingLayout(electric).issues.map((i) => i.id)).toContain('xa-hot-water')
    const solar = house([...bathroom, { kind: 'solar-geyser', x: 7, z: 6, dx: 1, dz: 0, y: 2.6 }])
    expect(plumbingLayout(solar).issues.map((i) => i.id)).not.toContain('xa-hot-water')
    let far = house([{ kind: 'basin', x: 4.4, z: 7.6, dx: 1, dz: 0, y: 0.67 }])
    far = addFixtures(far, far.building.floors[0].id, [{ kind: 'solar-geyser', x: 9.5, z: 4.4, dx: 1, dz: 0, y: 12 }]).document
    expect(plumbingLayout(far).issues.map((i) => i.id)).toContain('long-hot-run')
  })

  it('follows the bends you give the drain and prices pipe, eyes and trench', () => {
    let doc = house([...bathroom, { kind: 'solar-geyser', x: 7, z: 6, dx: 1, dz: 0, y: 2.6 }])
    doc = setServicePoint(doc, 'sewer', { x: 2, z: 2 }).document
    const straight = plumbingLayout(doc).profile!
    doc = setServiceBends(doc, 'sewer', [{ x: 12, z: 2 }]).document
    const bent = plumbingLayout(doc).profile!
    expect(bent.points).toHaveLength(3)
    expect(bent.length).toBeGreaterThan(straight.length)
    expect(setServicePoint(doc, 'water', { x: -50, z: 0 }).ok).toBe(false)
    const ids = takeoff(doc).filter((line) => line.group === 'Plumbing').map((line) => line.id)
    for (const id of ['pipe:110', 'pipe:50', 'pipe:22', 'pipe:15', 'pipe:15-hot', 'inspection-eye', 'gully', 'trench']) expect(ids).toContain(id)
  })
})

describe('routes under buildings', () => {
  it('warns when the drain is routed under the house', () => {
    let doc = house(bathroom)
    const exit = serviceExit(doc)!
    const across = { x: 14 - exit.x, z: 12 - exit.z }
    doc = setServicePoint(doc, 'sewer', across).document
    const crossing = plumbingLayout(doc).issues.map((i) => i.id)
    expect(crossing).toContain('drain-under')
  })
})

describe('septic tanks', () => {
  it('sizes the tank by bedrooms and checks its clearances', async () => {
    const { nameCell, setSewerType, setSoakaway } = await import('../model/mutations')
    let doc = house(bathroom)
    doc = nameCell(doc, doc.building.floors[0].id, 7, 6, 'Bedroom', 'bedroom').document
    doc = setSewerType(doc, 'septic').document
    doc = setServicePoint(doc, 'sewer', { x: 7, z: 9 }).document
    const close = plumbingLayout(doc)
    expect(close.septic).toMatchObject({ litres: 2500, bedrooms: 1 })
    expect(close.issues.map((i) => i.id)).toContain('septic-close')
    doc = setSoakaway(doc, { x: 7, z: 8.6 }).document
    expect(plumbingLayout(doc).issues.map((i) => i.id)).toContain('soakaway-close')
    const ids = takeoff(doc).map((line) => line.id)
    expect(ids).toContain('septic-tank')
    expect(ids).toContain('soakaway')
  })
})

describe('rainwater', () => {
  it('works out the harvest from the roof and how quickly a tank fills', async () => {
    const { addStorey, setRoof, setRainfall } = await import('../model/mutations')
    const { placeFixture } = await import('./fixtures')
    let doc = house([])
    const ground = doc.building.floors[0]
    doc = addStorey(doc, ground.id, ground.corners[0].id).document
    const plate = doc.building.floors.find((floor) => floor.index === 1)!
    doc = setRoof(doc, plate.id, { pitchDeg: 30, eaves: 0.5, form: 'hip' }).document
    doc = setRainfall(doc, 700).document
    const tank = placeFixture(doc.building.floors[0], { x: 7, z: 2.8 }, 'water-tank', { x: 1, z: 0 })
    expect(tank.problem).toBeNull()
    doc = addFixtures(doc, doc.building.floors[0].id, [tank.fixture]).document
    const rain = plumbingLayout(doc).rain!
    expect(rain.catchment).toBeGreaterThan(24)
    expect(rain.yearly).toBeCloseTo(rain.catchment * 700 * 0.8, 3)
    expect(rain.tanks).toBe(1)
    expect(rain.fillMm).toBeCloseTo(5000 / (rain.catchment * 0.8), 6)
  })
})

describe('default soakaway', () => {
  it('finds a spot on the plot away from the tank', async () => {
    const { setSewerType } = await import('../model/mutations')
    let doc = setSewerType(house(bathroom), 'septic').document
    const { septic } = plumbingLayout(doc)
    expect(septic!.soakaway).not.toEqual(septic!.tank)
    const ring = doc.plot.ring.map(([x, z]) => ({ x, z }))
    expect(pointInRing(ring, septic!.soakaway.x, septic!.soakaway.z)).toBe(true)
    doc = setServicePoint(doc, 'sewer', septic!.tank).document
    expect(plumbingLayout(doc).septic!.soakaway).toEqual(septic!.soakaway)
  })
})

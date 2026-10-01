import { describe, expect, it } from 'vitest'
import { fixtureDocument } from '../plot/fixture'
import { addFixtures, addOpening, addStorey, addWallRing, setRoof } from '../model/mutations'
import { fixtureSize, fixtureSpec, reseat } from '../model/fixtures'
import type { Document, Fixture } from '../model/types'
import { takeoff } from '../cost/quantities'
import { placeFixture } from './fixtures'
import { buildGutterParts, gutterLayout, gutterLengths } from './gutters'
import { plumbingLayout } from './plumbing'
import { doorCrossed, gasLayout } from './gas'
import { wallReach } from './outline'

// An 8 m by 6 m house from (4, 4) to (12, 10) under a hip roof, so a downpipe stands near each corner.
function roofed(): Document {
  let d = fixtureDocument()
  const id = d.building.floors[0].id
  d = addWallRing(d, id, [{ x: 4, z: 4 }, { x: 12, z: 4 }, { x: 12, z: 10 }, { x: 4, z: 10 }], 'double').document
  const ground = d.building.floors[0]
  d = addStorey(d, ground.id, ground.corners[0].id).document
  const plate = d.building.floors.find((floor) => floor.index === 1)!
  return setRoof(d, plate.id, { pitchDeg: 30, eaves: 0.5, form: 'hip', covering: 'ibr' }).document
}

function withFixtures(doc: Document, drafts: Omit<Fixture, 'id'>[]): Document {
  return addFixtures(doc, doc.building.floors[0].id, drafts).document
}

// A downpipe in front of the east wall, out at the eaves.
function eastPipe(doc: Document) {
  const pipes = gutterLayout(doc).downpipes.filter((pipe) => pipe.x > 12)
  expect(pipes.length).toBeGreaterThan(0)
  return pipes[0]
}

describe('rainwater tanks', () => {
  it('slides a tank placed near a downpipe along the wall to stand under it', () => {
    const doc = roofed()
    const pipe = eastPipe(doc)
    const floor = doc.building.floors[0]
    // The hip roof's downpipes stand out at the corners, past the ends of the walls.
    expect(pipe.z < 4 || pipe.z > 10).toBe(true)
    const z = pipe.z < 7 ? 5 : 9
    const placed = placeFixture(floor, { x: 13, z }, 'water-tank', { x: 1, z: 0 }, { downpipes: gutterLayout(doc).downpipes })
    expect(placed.problem).toBeNull()
    expect(placed.fixture.dx).toBe(1)
    // It stands out to the wall's end, with the downpipe over its lid.
    expect(placed.fixture.z).toBeCloseTo(pipe.z < 7 ? 4 : 10, 5)
    expect(Math.hypot(placed.fixture.x - pipe.x, placed.fixture.z - pipe.z)).toBeLessThan(fixtureSize(placed.fixture).width / 2)
    // Without downpipes it stays where it was put.
    const free = placeFixture(floor, { x: 13, z: 7 }, 'water-tank', { x: 1, z: 0 })
    expect(free.fixture.z).toBeCloseTo(7, 5)
  })

  it('leads a downpipe near a tank into it, and stops it above the lid', () => {
    let doc = roofed()
    const pipe = eastPipe(doc)
    const floor = doc.building.floors[0]
    const placed = placeFixture(floor, { x: 12.8, z: pipe.z }, 'water-tank', { x: 1, z: 0 }, { downpipes: gutterLayout(doc).downpipes })
    doc = withFixtures(doc, [placed.fixture])
    const layout = gutterLayout(doc)
    const linked = layout.downpipes.filter((item) => item.tank)
    expect(linked).toHaveLength(1)
    expect(linked[0].tank!.height).toBeCloseTo(fixtureSpec('water-tank').height)
    expect(Number.isFinite(linked[0].tank!.stand)).toBe(true)
    const bare = roofed()
    const before = gutterLengths(gutterLayout(bare), bare).downpipe['round-pvc']
    const after = gutterLengths(layout, doc).downpipe['round-pvc']
    expect(after).toBeLessThan(before)
    // The pipe's lowest point at the tank is at the lid (stand + height above the ground datum).
    const [part] = buildGutterParts(layout, linked[0].roofFloorId, 'round-pvc', () => -3, -3)
    const pos = part.geometry.getAttribute('position')
    let low = Infinity
    for (let i = 0; i < pos.count; i++) {
      if (Math.hypot(pos.getX(i) - linked[0].tank!.x, pos.getZ(i) - linked[0].tank!.z) < 0.1) low = Math.min(low, pos.getY(i))
    }
    const lid = -3 + linked[0].tank!.stand + linked[0].tank!.height
    expect(low).toBeCloseTo(lid, 2)
    expect(plumbingLayout(doc).issues.map((issue) => issue.id.split(':')[0])).not.toContain('tank-unfed')
  })

  it('warns about a tank no downpipe reaches', () => {
    const doc = withFixtures(roofed(), [{ kind: 'water-tank', x: 12 + 0.2 + 0.9, z: 7, dx: 1, dz: 0, y: 0 }])
    expect(plumbingLayout(doc).issues.map((issue) => issue.id.split(':')[0])).toContain('tank-unfed')
  })

  it('comes in four sizes, counted in litres and priced by size', () => {
    const doc = roofed()
    const pipe = eastPipe(doc)
    const base = placeFixture(doc.building.floors[0], { x: 12.8, z: pipe.z }, 'water-tank', { x: 1, z: 0 }, { downpipes: gutterLayout(doc).downpipes }).fixture
    const big = reseat(base, { litres: 10000 })
    expect(fixtureSize(big).width).toBeCloseTo(2.4)
    // Its back stays against the wall.
    expect(big.x - fixtureSize(big).depth / 2).toBeCloseTo(base.x - fixtureSize(base).depth / 2)
    const withTanks = withFixtures(doc, [big, { kind: 'water-tank', x: 3, z: 7, dx: -1, dz: 0, y: 0, litres: 1000 }])
    expect(plumbingLayout(withTanks).rain).toMatchObject({ tanks: 2, litres: 11000 })
    const lines = takeoff(withTanks)
    expect(lines.find((line) => line.id === 'tank:10000')).toMatchObject({ quantity: 1 })
    expect(lines.find((line) => line.id === 'tank:1000')).toMatchObject({ quantity: 1 })
    expect(lines.find((line) => line.id === 'fixture:water-tank')).toBeUndefined()
    expect(lines.find((line) => line.id === 'tank-inlet')).toMatchObject({ quantity: 1 })
  })
})

describe('gas pipe and doors', () => {
  it('flags a pipe along the outside wall that crosses a doorway', () => {
    let doc = roofed()
    const floor = doc.building.floors[0]
    const at = (id: string) => floor.corners.find((corner) => corner.id === id)!
    const east = floor.walls.find((item) => Math.abs(at(item.startCornerId).x - 12) < 1e-6 && Math.abs(at(item.endCornerId).x - 12) < 1e-6)!
    const reach = wallReach(east)
    // A door from z = 6.5 to 7.4 on the east wall, between the bottles at z = 5 and the geyser at z = 9.
    const u = at(east.startCornerId).z < 5 ? 2.5 : 10 - 7.4
    doc = addOpening(doc, floor.id, east.id, 'external-door', u, 0.9).document
    doc = withFixtures(doc, [
      { kind: 'gas-cylinder', x: 12 + reach + 0.2375, z: 5, dx: 1, dz: 0, y: 0 },
      { kind: 'gas-geyser', x: 12 + reach + 0.1, z: 9, dx: 1, dz: 0, y: 1.2 },
    ])
    const gas = gasLayout(doc)
    expect(doorCrossed(doc.building.floors[0], gas.runs[0].path)).toBe(true)
    expect(gas.issues.map((issue) => issue.id.split(':')[0])).toContain('gas-door')
  })
})

describe('fitting setup, shared by Plan and Focus', () => {
  it('changes a tank or bottles in place, keeping the back against the wall, and refuses what does not apply', async () => {
    const { setFixtureSetup } = await import('../model/mutations')
    const doc = withFixtures(roofed(), [{ kind: 'water-tank', x: 12 + 0.131 + 0.9, z: 7, dx: 1, dz: 0, y: 0 }, { kind: 'socket', x: 11.8, z: 7, dx: -1, dz: 0, y: 0.3 }])
    const floor = doc.building.floors[0]
    const [tank, socket] = floor.fixtures!
    const bigger = setFixtureSetup(doc, floor.id, tank.id, { litres: 10000 })
    expect(bigger.ok).toBe(true)
    const after = bigger.document.building.floors[0].fixtures![0]
    expect(after.litres).toBe(10000)
    expect(after.x - fixtureSize(after).depth / 2).toBeCloseTo(tank.x - fixtureSize(tank).depth / 2)
    expect(setFixtureSetup(doc, floor.id, tank.id, { bottles: 2 }).ok).toBe(false)
    expect(setFixtureSetup(doc, floor.id, socket.id, { litres: 1000 }).ok).toBe(false)
    expect(setFixtureSetup(doc, floor.id, tank.id, { litres: 3000 as never }).ok).toBe(false)
  })

  it('steps sizes up and down, stopping at the ends', async () => {
    const { sizeName, stepSize } = await import('../model/fixtures')
    expect(sizeName('water-tank')).toBe('5,000 L')
    expect(stepSize('water-tank', {}, 1)).toEqual({ litres: 10000 })
    expect(stepSize('water-tank', { litres: 10000 }, 1)).toEqual({ litres: 10000 })
    expect(stepSize('gas-cylinder', {}, -1)).toEqual({ bottleKg: 19 })
    expect(stepSize('gas-cylinder', { bottleKg: 9 }, -1)).toEqual({ bottleKg: 9 })
    expect(sizeName('socket')).toBeNull()
  })

  it('places a fitting at the size chosen before placing it, indoors and out', () => {
    const doc = roofed()
    const floor = doc.building.floors[0]
    const tank = placeFixture(floor, { x: 13, z: 7 }, 'water-tank', { x: 1, z: 0 }, { setup: { litres: 1000 } })
    expect(tank.fixture.litres).toBe(1000)
    expect(tank.fixture.x - fixtureSize(tank.fixture).depth / 2).toBeCloseTo(12 + wallReach(floor.walls[0]), 2)
    // Indoors the bottles keep the indoor setup (one, no cage) under the chosen size.
    const inside = placeFixture(floor, { x: 11.6, z: 7 }, 'gas-cylinder', { x: -1, z: 0 }, { setup: { bottleKg: 19 } })
    expect(inside.fixture).toMatchObject({ bottles: 1, bottleKg: 19, cage: false })
  })
})

describe('outdoor fittings stay on the plot', () => {
  it('will not put a tank over the boundary, even to reach a downpipe', () => {
    const doc = roofed()
    const floor = doc.building.floors[0]
    // A downpipe right on the east boundary of a plot that ends a metre past the wall.
    const ring: [number, number][] = [[0, 0], [12.9, 0], [12.9, 20], [0, 20]]
    const placed = placeFixture(floor, { x: 12.5, z: 7 }, 'water-tank', { x: 1, z: 0 }, { downpipes: [{ x: 12.85, z: 7 }], plot: ring })
    expect(placed.problem).not.toBeNull()
    const free = placeFixture(floor, { x: 12.5, z: 7 }, 'water-tank', { x: 1, z: 0 }, { downpipes: [{ x: 12.85, z: 7 }] })
    expect(free.problem).toBeNull()
  })
})

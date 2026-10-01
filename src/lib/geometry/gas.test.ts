import { describe, expect, it } from 'vitest'
import { fixtureDocument } from '../plot/fixture'
import { addFixtures, addOpening, addWallRing, setFixtureKind } from '../model/mutations'
import { fixtureSpec } from '../model/fixtures'
import type { Document, Fixture } from '../model/types'
import { takeoff } from '../cost/quantities'
import { electricalIssues, electricalLayout } from './electrical'
import { gasLayout } from './gas'
import { wallReach } from './outline'
import { plumbingLayout } from './plumbing'

type Draft = Omit<Fixture, 'id'>

// An 8 m by 6 m room from (4, 4) to (12, 10).
function house(): Document {
  const d = fixtureDocument()
  return addWallRing(d, d.building.floors[0].id, [{ x: 4, z: 4 }, { x: 12, z: 4 }, { x: 12, z: 10 }, { x: 4, z: 10 }], 'double').document
}

function reach(doc: Document): number {
  return wallReach(doc.building.floors[0].walls[0])
}

function withFixtures(doc: Document, drafts: Draft[]): Document {
  return addFixtures(doc, doc.building.floors[0].id, drafts).document
}

// Against the east wall: inside facing west, outside facing east.
const inEast = (doc: Document, kind: Draft['kind'], z: number, y = fixtureSpec(kind).y): Draft => ({
  kind,
  x: 12 - reach(doc) - fixtureSpec(kind).depth / 2,
  z,
  dx: -1,
  dz: 0,
  y,
})
const outEast = (doc: Document, kind: Draft['kind'], z: number, y = fixtureSpec(kind).y): Draft => ({
  kind,
  x: 12 + reach(doc) + fixtureSpec(kind).depth / 2,
  z,
  dx: 1,
  dz: 0,
  y,
})
const inNorth = (doc: Document, kind: Draft['kind'], x: number, y = fixtureSpec(kind).y): Draft => ({
  kind,
  x,
  z: 4 + reach(doc) + fixtureSpec(kind).depth / 2,
  dx: 0,
  dz: 1,
  y,
})

const ids = (issues: { id: string }[]) => issues.map((issue) => issue.id.split(':')[0])

describe('gas routing', () => {
  it('runs straight along the wall and through it to a stove on the same outside wall', () => {
    const base = house()
    const doc = withFixtures(base, [outEast(base, 'gas-cylinder', 6), inEast(base, 'gas-stove', 8.5)])
    const layout = gasLayout(doc)
    expect(layout.runs).toHaveLength(1)
    const run = layout.runs[0]
    expect(run.outside).toBeCloseTo(2.5, 1)
    expect(run.inside).toBeCloseTo(reach(doc) * 2 + 0.06, 1)
    expect(run.direct).toBe(true)
    // The pipe stands off the outside face.
    for (const point of run.path) expect(point.x).toBeGreaterThan(12 + reach(doc))
    expect(run.length).toBeGreaterThan(run.outside + run.inside)
  })

  it('goes round the corner of the house to a stove on another wall', () => {
    const base = house()
    const doc = withFixtures(base, [outEast(base, 'gas-cylinder', 6), inNorth(base, 'gas-stove', 9)])
    const run = gasLayout(doc).runs[0]
    // 2 m south to the corner, 3 m west along the north wall, plus the offsets round the corner.
    expect(run.outside).toBeGreaterThan(5)
    expect(run.outside).toBeLessThan(6)
    expect(run.path.length).toBe(3)
    expect(run.direct).toBe(true)
    expect(run.path[1].x).toBeGreaterThan(12)
    expect(run.path[1].z).toBeLessThan(4)
  })

  it('feeds a gas geyser on the outside wall without going indoors, and wires it to nothing', () => {
    const base = house()
    const doc = withFixtures(base, [
      outEast(base, 'gas-cylinder', 6),
      outEast(base, 'gas-geyser', 8),
      inNorth(base, 'basin', 6),
      { kind: 'db-board', x: 4.3, z: 8, dx: 1, dz: 0, y: 1.4 },
    ])
    const run = gasLayout(doc).runs[0]
    expect(run.inside).toBe(0)
    expect(electricalLayout(doc).circuits.some((circuit) => circuit.kind === 'geyser')).toBe(false)
    const pipes = plumbingLayout(doc)
    expect(pipes.hot).toHaveLength(1)
    expect(ids(pipes.issues)).not.toContain('no-geyser')
    expect(ids(pipes.issues)).not.toContain('xa-hot-water')
  })

  it('asks for bottles when there is a gas appliance and none to feed it', () => {
    const base = house()
    const doc = withFixtures(base, [inEast(base, 'gas-stove', 8)])
    expect(gasLayout(doc).runs).toEqual([])
    expect(ids(gasLayout(doc).issues)).toContain('gas-no-cylinder')
  })

  it('prices copper pipe, a valve at each appliance and the certificate', () => {
    const base = house()
    const doc = withFixtures(base, [outEast(base, 'gas-cylinder', 6), inEast(base, 'gas-stove', 8.5), outEast(base, 'gas-geyser', 9)])
    const lines = takeoff(doc)
    expect(lines.find((line) => line.id === 'gas-pipe')).toMatchObject({ group: 'Gas' })
    expect(lines.find((line) => line.id === 'gas-valve')).toMatchObject({ group: 'Gas', quantity: 2 })
    expect(lines.find((line) => line.id === 'gas-coc')).toMatchObject({ quantity: 1 })
    expect(lines.find((line) => line.id === 'fixture:gas-cylinder')).toBeUndefined()
    expect(lines.find((line) => line.id === 'gas-bottle:48')).toMatchObject({ group: 'Gas', quantity: 2 })
    expect(lines.find((line) => line.id === 'gas-regulator')).toMatchObject({ quantity: 1 })
    expect(lines.find((line) => line.id === 'gas-cage')).toMatchObject({ quantity: 1 })
  })
})

describe('where the gas bottles may go', () => {
  it('keeps them a metre from doors and windows', () => {
    const base = house()
    const floor = base.building.floors[0]
    const at = (id: string) => floor.corners.find((corner) => corner.id === id)!
    // The east wall, from (12, 4) to (12, 10) one way or the other, with a window from z = 7 to 8.2.
    const wall = floor.walls.find((item) => Math.abs(at(item.startCornerId).x - 12) < 1e-6 && Math.abs(at(item.endCornerId).x - 12) < 1e-6)!
    const u = at(wall.startCornerId).z < 5 ? 3 : 10 - 8.2
    const doc = addOpening(base, floor.id, wall.id, 'window', u, 1.2).document
    const half = fixtureSpec('gas-cylinder').width / 2
    const close = withFixtures(doc, [outEast(doc, 'gas-cylinder', 8.2 + half + 0.5)])
    expect(ids(gasLayout(close).issues)).toContain('gas-opening')
    const far = withFixtures(doc, [outEast(doc, 'gas-cylinder', 7 - half - 1.2)])
    expect(ids(gasLayout(far).issues)).not.toContain('gas-opening')
  })

  it('keeps all but a single 9 kg bottle outside, and five metres from an outside switch or socket', () => {
    const base = house()
    const inside = withFixtures(base, [{ kind: 'gas-cylinder', x: 8, z: 7, dx: 1, dz: 0, y: 0 }])
    expect(ids(gasLayout(inside).issues)).toContain('gas-inside')
    const small = withFixtures(base, [{ kind: 'gas-cylinder', x: 8, z: 7, dx: 1, dz: 0, y: 0, bottles: 1, bottleKg: 9, cage: false }])
    expect(ids(gasLayout(small).issues)).not.toContain('gas-inside')
    const open = withFixtures(base, [{ ...outEast(base, 'gas-cylinder', 6), cage: false }])
    expect(ids(gasLayout(open).issues)).toContain('gas-cage')
    const sparky = withFixtures(base, [outEast(base, 'gas-cylinder', 6), outEast(base, 'socket', 9, 0.3)])
    expect(ids(gasLayout(sparky).issues)).toContain('gas-electrical')
    const lit = withFixtures(base, [outEast(base, 'gas-cylinder', 6), outEast(base, 'outdoor-light', 9)])
    expect(ids(gasLayout(lit).issues)).not.toContain('gas-electrical')
  })
})

describe('stove rules', () => {
  it('keeps a gas hob 200 mm from sockets and the isolator', () => {
    const base = house()
    const near = withFixtures(base, [inEast(base, 'gas-stove', 8), inEast(base, 'socket', 8.4, 0.3)])
    expect(ids(gasLayout(near).issues)).toContain('hob-electrical')
    const clear = withFixtures(base, [inEast(base, 'gas-stove', 8), inEast(base, 'socket', 8.7, 0.3)])
    expect(ids(gasLayout(clear).issues)).not.toContain('hob-electrical')
  })

  it('asks for an electric stove isolator within 3 m, between 0.5 m and 2.2 m up', async () => {
    const { fitFixtureY } = await import('../model/fixtures')
    expect(fitFixtureY('stove-isolator', 0.2)).toBe(0.5)
    const base = house()
    const alone = withFixtures(base, [inEast(base, 'stove', 8)])
    expect(ids(electricalIssues(alone))).toContain('stove-isolator')
    const far = withFixtures(base, [inEast(base, 'stove', 9), inNorth(base, 'stove-isolator', 5)])
    expect(ids(electricalIssues(far))).toContain('stove-isolator')
    const beside = withFixtures(base, [inEast(base, 'stove', 8), inEast(base, 'stove-isolator', 8.7)])
    expect(ids(electricalIssues(beside))).not.toContain('stove-isolator')
    const low = withFixtures(base, [inEast(base, 'stove', 8), inEast(base, 'stove-isolator', 8.7, 0.3)])
    expect(ids(electricalIssues(low))).toContain('isolator-height')
    // A gas stove needs no isolator.
    const gas = withFixtures(base, [inEast(base, 'gas-stove', 8)])
    expect(ids(electricalIssues(gas))).not.toContain('stove-isolator')
  })

  it('keeps the distribution board a metre from either stove, by the stove itself', () => {
    const base = house()
    for (const kind of ['stove', 'gas-stove'] as const) {
      const above = withFixtures(base, [inEast(base, kind, 8), inEast(base, 'db-board', 8.9, 1.4)])
      expect(ids(electricalIssues(above))).toContain('db-stove')
      const clear = withFixtures(base, [inEast(base, kind, 8), inEast(base, 'db-board', 9.6, 1.4)])
      expect(ids(electricalIssues(clear))).not.toContain('db-stove')
    }
  })

  it('sizes a row of bottles by count, size and cage, keeping its back against the wall', async () => {
    const { fixtureSize, reseat, fixtureProblem } = await import('../model/fixtures')
    const base = house()
    const draft = outEast(base, 'gas-cylinder', 6)
    expect(fixtureSize(draft).width).toBeCloseTo(2 * 0.375 + 0.05 + 0.1)
    const four = reseat(draft, { bottles: 4, bottleKg: 19, cage: true })
    expect(fixtureSize(four).width).toBeCloseTo(4 * 0.32 + 3 * 0.05 + 0.1)
    const backBefore = draft.x - fixtureSize(draft).depth / 2
    const backAfter = four.x - fixtureSize(four).depth / 2
    expect(backAfter).toBeCloseTo(backBefore)
    expect(fixtureProblem({ ...draft, bottles: 5 })).toMatch(/one to 4/)
    expect(fixtureProblem({ ...draft, bottleKg: 16 as never })).toMatch(/size/)
  })

  it('starts bottles indoors as one 9 kg bottle without a cage, and outside as two 48 kg bottles in one', async () => {
    const { placeFixture } = await import('./fixtures')
    const doc = house()
    const floor = doc.building.floors[0]
    const inside = placeFixture(floor, { x: 11.6, z: 7 }, 'gas-cylinder', { x: -1, z: 0 })
    expect(inside.problem).toBeNull()
    expect(inside.fixture).toMatchObject({ bottles: 1, bottleKg: 9, cage: false })
    const outside = placeFixture(floor, { x: 12.5, z: 7 }, 'gas-cylinder', { x: 1, z: 0 })
    expect(outside.problem).toBeNull()
    expect(outside.fixture.x).toBeGreaterThan(12)
    expect(outside.fixture.bottles).toBeUndefined()
  })

  it('swaps an electric stove for a gas one in place, but not for something else', () => {
    const base = house()
    const doc = withFixtures(base, [inEast(base, 'stove', 8)])
    const floor = doc.building.floors[0]
    const id = floor.fixtures![0].id
    const swapped = setFixtureKind(doc, floor.id, id, 'gas-stove')
    expect(swapped.ok).toBe(true)
    expect(swapped.document.building.floors[0].fixtures![0]).toMatchObject({ kind: 'gas-stove', x: floor.fixtures![0].x })
    expect(setFixtureKind(doc, floor.id, id, 'wc').ok).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import { fixtureDocument } from '../plot/fixture'
import { addFixtures, addWallRing, nameCell } from '../model/mutations'
import type { Document, Fixture } from '../model/types'
import { takeoff } from '../cost/quantities'
import { electricalIssues, electricalLayout, MAX_SOCKETS, runBetween } from './electrical'

type Draft = Omit<Fixture, 'id'>
const east = { dx: 1, dz: 0 }

function room(drafts: Draft[]): Document {
  let d = fixtureDocument()
  const id = d.building.floors[0].id
  d = addWallRing(d, id, [{ x: 4, z: 4 }, { x: 12, z: 4 }, { x: 12, z: 10 }, { x: 4, z: 10 }], 'double').document
  return drafts.length ? addFixtures(d, id, drafts).document : d
}

const board: Draft = { kind: 'db-board', x: 4.3, z: 5, ...east, y: 1.4 }
const socket = (x: number, z: number): Draft => ({ kind: 'socket', x, z, ...east, y: 0.3 })

describe('circuits', () => {
  it('needs a board before it can lay out circuits', () => {
    const doc = room([socket(5, 5)])
    expect(electricalLayout(doc).circuits).toEqual([])
    expect(electricalIssues(doc).map((issue) => issue.id)).toContain('no-board')
  })

  it('groups points by kind, splits long plug circuits and gives the stove and geyser their own', () => {
    const sockets = Array.from({ length: MAX_SOCKETS + 2 }, (_, i) => socket(5 + i * 0.6, 9.8))
    const doc = room([
      board,
      ...sockets,
      { kind: 'light', x: 6, z: 7, ...east, y: 2.4 },
      { kind: 'light', x: 10, z: 7, ...east, y: 2.4 },
      { kind: 'switch', x: 4.2, z: 7, ...east, y: 1.2 },
      { kind: 'stove-isolator', x: 11.8, z: 6, dx: -1, dz: 0, y: 1.4 },
      { kind: 'geyser', x: 8, z: 7, ...east, y: 2.6 },
    ])
    const layout = electricalLayout(doc)
    const kinds = layout.circuits.map((circuit) => circuit.id)
    expect(kinds).toEqual(['L1', 'P1', 'P2', 'S1', 'G1'])
    expect(layout.circuits.find((c) => c.id === 'P1')!.points).toHaveLength(MAX_SOCKETS)
    expect(layout.circuits.find((c) => c.id === 'S1')).toMatchObject({ breaker: 32, cable: 6 })
    expect(layout.ways).toBe(9)
    expect(layout.boardSize).toBe(12)
    for (const circuit of layout.circuits) expect(circuit.length).toBeGreaterThan(0)
  })

  it('runs cable up to the ceiling, square across it and back down', () => {
    const doc = room([board, socket(8, 5)])
    const floor = doc.building.floors[0]
    const [b, s] = floor.fixtures!
    const run = runBetween({ floor, fixture: b }, { floor, fixture: s })
    const across = Math.abs(b.x - s.x) + Math.abs(b.z - s.z)
    expect(run.length).toBeGreaterThan(across + 2)
    expect(run.drops).toBeGreaterThan(1.5)
  })

  it('prices cable, conduit, boxes, breakers and earth leakage', () => {
    const doc = room([board, socket(8, 5), { kind: 'light', x: 6, z: 7, ...east, y: 2.4 }])
    const ids = takeoff(doc).filter((line) => line.group === 'Electrical').map((line) => line.id)
    for (const id of ['cable:1.5', 'cable:2.5', 'conduit-20', 'flush-box', 'breaker:10', 'breaker:20', 'earth-leakage']) expect(ids).toContain(id)
  })
})

describe('electrical checks', () => {
  it('flags a socket by the bath and a switch inside a bathroom', () => {
    let doc = room([board, { kind: 'bath', x: 8, z: 4.5, dx: 0, dz: 1, y: 0 }, socket(8, 5.2), { kind: 'switch', x: 11.8, z: 8, dx: -1, dz: 0, y: 1.2 }])
    doc = nameCell(doc, doc.building.floors[0].id, 8, 7, 'Bathroom', 'bathroom').document
    const ids = electricalIssues(doc).map((issue) => issue.id.split(':')[0])
    expect(ids).toContain('zone')
    expect(ids).toContain('bath-switch')
  })
})

describe('runs into the roof', () => {
  it('climbs from the ceiling to a geyser in the roof space above', () => {
    const low = room([board, { kind: 'geyser', x: 8, z: 7, ...east, y: 2.6 }])
    const high = room([board, { kind: 'geyser', x: 8, z: 7, ...east, y: 5.4 }])
    const run = (doc: Document) => electricalLayout(doc).circuits.find((c) => c.kind === 'geyser')!.length
    expect(run(high) - run(low)).toBeCloseTo(2.8, 1)
  })
})

describe('where the distribution board may go', () => {
  it('keeps it between 1.2 m and 2.2 m', async () => {
    const { fitFixtureY, fixtureSpec } = await import('../model/fixtures')
    expect(fitFixtureY('db-board', 0.3)).toBe(1.2)
    expect(fitFixtureY('db-board', 2.5)).toBeCloseTo(2.2 - fixtureSpec('db-board').height)
    expect(fitFixtureY('socket', 0.3)).toBe(0.3)
    const low = room([{ ...board, y: 0.9 }])
    expect(electricalIssues(low).map((i) => i.id.split(':')[0])).toContain('db-low')
    const fine = room([board])
    expect(electricalIssues(fine).map((i) => i.id.split(':')[0])).not.toContain('db-low')
  })

  it('keeps it out of bathrooms and a metre from taps and the stove', () => {
    let doc = room([board, { kind: 'basin', x: 4.4, z: 5.6, dx: 1, dz: 0, y: 0.67 }, { kind: 'stove-isolator', x: 4.2, z: 5.8, dx: 1, dz: 0, y: 1.4 }])
    doc = nameCell(doc, doc.building.floors[0].id, 8, 7, 'Bathroom', 'bathroom').document
    const ids = electricalIssues(doc).map((i) => i.id.split(':')[0])
    expect(ids).toContain('db-bathroom')
    expect(ids).toContain('db-water')
    expect(ids).toContain('db-stove')
  })
})

describe('bathroom zones', () => {
  it('only count sockets in the same room as the bath or shower', async () => {
    const { addWall, addCorner } = await import('../model/mutations')
    let doc = room([])
    const id = doc.building.floors[0].id
    doc = addCorner(doc, id, 8, 4).document
    doc = addCorner(doc, id, 8, 10).document
    const [a, b] = doc.building.floors[0].corners.slice(-2)
    doc = addWall(doc, id, a.id, b.id, 'double').document
    // A shower against the dividing wall on one side, a socket on the other side of the same wall.
    const reach = 0.131
    const shower = { kind: 'shower' as const, x: 8 - reach - 0.45, z: 7, dx: -1, dz: 0, y: 0 }
    const across = { kind: 'socket' as const, x: 8 + reach + 0.02, z: 7, dx: 1, dz: 0, y: 0.3 }
    const beside = { kind: 'socket' as const, x: 8 - reach - 0.02, z: 7.9, dx: -1, dz: 0, y: 0.3 }
    const ids = (d: Document) => electricalIssues(d).map((issue) => issue.id.split(':')[0])
    expect(ids(addFixtures(doc, id, [shower, across]).document)).not.toContain('zone')
    expect(ids(addFixtures(doc, id, [shower, beside]).document)).toContain('zone')
  })
})

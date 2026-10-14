import { describe, expect, it } from 'vitest'
import { takeoff } from '../cost/quantities'
import { counterRing } from '../model/counters'
import { addCorner, addCounter, addFixture, addOpening, addWall, addWallRing, moveCorners, removeCounter, updateCounter } from '../model/mutations'
import type { Counter, Document } from '../model/types'
import { fixtureDocument } from '../plot/fixture'
import { buildCounterParts, counterAlongFace, counterAt, counterBetween, counterCarried, counterFace, counterIssues, countersOnWall, counterTotals } from './counters'
import { buildFixtureParts, placeFixture } from './fixtures'

// A room from (4, 4) to (10, 9), in cavity brick 262 mm thick.
function room(): Document {
  const d = fixtureDocument()
  return addWallRing(d, d.building.floors[0].id, [{ x: 4, z: 4 }, { x: 10, z: 4 }, { x: 10, z: 9 }, { x: 4, z: 9 }], 'double').document
}
const floorOf = (doc: Document) => doc.building.floors[0]
// Half the cavity wall: from a wall's centre line to its face.
const HALF = 0.131
const base: Omit<Counter, 'id'> = { x: 4.2, z: 4.2, dx: 1, dz: 0, length: 3, depth: 0.6, kind: 'base', top: 'laminate' }

describe('counters', () => {
  it('are added, changed and removed, and refused when too short, too deep or of a kind that does not exist', () => {
    let doc = room()
    const fid = floorOf(doc).id
    const added = addCounter(doc, fid, base)
    expect(added.ok).toBe(true)
    doc = added.document
    const id = floorOf(doc).counters![0].id
    expect(updateCounter(doc, fid, id, { top: 'granite', wallUnits: true }).document.building.floors[0].counters![0]).toMatchObject({ top: 'granite', wallUnits: true })
    expect(updateCounter(doc, fid, id, { length: 0.1 }).ok).toBe(false)
    expect(updateCounter(doc, fid, id, { depth: 2 }).ok).toBe(false)
    expect(updateCounter(doc, fid, id, { kind: 'shelf' as never }).ok).toBe(false)
    // An island cannot carry wall cupboards, so turning a counter into one drops them.
    const walled = updateCounter(doc, fid, id, { wallUnits: true }).document
    expect(updateCounter(walled, fid, id, { kind: 'island' }).document.building.floors[0].counters![0].wallUnits).toBeUndefined()
    expect(removeCounter(doc, fid, id).document.building.floors[0].counters).toBeUndefined()
  })

  it('stand against the inside face of the wall the pointer is nearest, with the room on their left', () => {
    const floor = floorOf(room())
    // Just inside the south wall, whose centre line is z = 4.
    const face = counterFace(floor, { x: 6, z: 4.3 }, 0.45)!
    expect(face.point.z).toBeGreaterThan(4.1)
    expect(face.point.z).toBeLessThan(4.2)
    const run = counterAlongFace(face, { x: 8.52, z: 5 }, 0.6)
    expect(run.length).toBeCloseTo(2.5, 6)
    const ring = counterRing(run)
    // Its front edge is further into the room than its back edge.
    expect(Math.max(...ring.map((p) => p.z))).toBeCloseTo(face.point.z + 0.6, 6)
    // Drawn the other way along the wall, it is the same counter.
    const back = counterAlongFace(face, { x: 3.5, z: 5 }, 0.6)
    expect(Math.max(...counterRing(back).map((p) => p.z))).toBeCloseTo(face.point.z + 0.6, 6)
    expect(back.length).toBeLessThanOrEqual(2 + 1e-9)
    expect(counterFace(floor, { x: 7, z: 6.5 }, 0.45)).toBeNull()
  })

  it('start flush in a corner when started near it, and end flush with the face of the wall at the other', () => {
    const floor = floorOf(room())
    // Started 100 mm short of the inside corner of the south and west walls, on the south wall's face.
    const face = counterFace(floor, { x: 4 + HALF + 0.1, z: 4.15 }, 0.45)!
    expect(face.point.x).toBeCloseTo(4 + HALF, 6)
    expect(face.before).toBeCloseTo(0, 6)
    expect(face.after).toBeCloseTo(6 - 2 * HALF, 6)
    // Pulled past the east wall, it stops at that wall's face, not its centre line.
    const run = counterAlongFace(face, { x: 11, z: 5 }, 0.6)
    expect(run.x + run.length).toBeCloseTo(10 - HALF, 6)
    // Started further out, it starts where it was started.
    expect(counterFace(floor, { x: 4.6, z: 4.15 }, 0.45)!.point.x).toBeCloseTo(4.6, 6)
    // Started over the end of the west wall, it is moved out to the corner.
    expect(counterFace(floor, { x: 4.05, z: 4.14 }, 0.45)!.point.x).toBeCloseTo(4 + HALF, 6)
  })

  it('stop at a wall meeting the face from the room side', () => {
    let doc = room()
    const fid = floorOf(doc).id
    // A partition from the south wall north to the north wall at x = 7, splitting the room.
    doc = addCorner(doc, fid, 7, 4).document
    doc = addCorner(doc, fid, 7, 9).document
    const [south, north] = floorOf(doc).corners.slice(-2)
    const split = addWall(doc, fid, south.id, north.id, 'double')
    expect(split.ok).toBe(true)
    doc = split.document
    const face = counterFace(floorOf(doc), { x: 5, z: 4.3 }, 0.45)
    expect(face).not.toBeNull()
    const run = counterAlongFace(face!, { x: 9, z: 5 }, 0.6)
    expect(run.x + run.length).toBeCloseTo(7 - HALF, 6)
  })

  it('stop at the end of a counter already on the face, and turn an L round one on the next wall', () => {
    let doc = room()
    const fid = floorOf(doc).id
    // A counter along the south wall from the south-west corner, 2 m long.
    const south = counterFace(floorOf(doc), { x: 4.2, z: 4.15 }, 0.45)!
    doc = addCounter(doc, fid, { ...counterAlongFace(south, { x: 4 + HALF + 2, z: 5 }, 0.6), kind: 'base', top: 'laminate' }).document
    const floor = floorOf(doc)
    // Started further along the south wall and drawn back, it stops at that counter's end.
    const after = counterFace(floor, { x: 8, z: 4.15 }, 0.45)!
    const back = counterAlongFace(after, { x: 5, z: 5 }, 0.6)
    expect(back.x).toBeCloseTo(4 + HALF + 2, 6)
    // Started just past that counter's end, it is pulled up flush to it.
    expect(counterFace(floor, { x: 4 + HALF + 2.1, z: 4.15 }, 0.45)!.point.x).toBeCloseTo(4 + HALF + 2, 6)
    // On the west wall, the face starts where the south counter's front edge is, 600 mm out from the corner.
    const west = counterFace(floor, { x: 4.15, z: 4.4 }, 0.45)!
    expect(west.point.z).toBeCloseTo(4 + HALF + 0.6, 6)
    // A counter being carried does not stand in its own way.
    const own = floor.counters![0]
    expect(counterFace(floor, { x: 4.6, z: 4.15 }, 0.45, { ignore: own.id })!.point.x).toBeCloseTo(4.6, 6)
  })

  it('stop clear of a doorway in their wall, and of a window that comes down below the worktop', () => {
    let doc = room()
    const fid = floorOf(doc).id
    const south = floorOf(doc).walls.find((wall) => counterFace(floorOf(doc), { x: 6, z: 4.15 }, 0.45)!.wallId === wall.id)!
    const start = floorOf(doc).corners.find((corner) => corner.id === south.startCornerId)!
    // A door 1.5 m along the south wall from its start corner, 0.9 m wide.
    const added = addOpening(doc, fid, south.id, 'internal-door', 1.5)
    expect(added.ok).toBe(true)
    doc = added.document
    const door = floorOf(doc).walls.find((wall) => wall.id === south.id)!.openings[0]
    // Where the door's sides are along the face, in x.
    const along = (u: number) => start.x + (start.x < 7 ? u : -u)
    const sides = [along(door.u), along(door.u + door.width)].sort((a, b) => a - b)
    const face = counterFace(floorOf(doc), { x: 4.3, z: 4.15 }, 0.45)!
    const run = counterAlongFace(face, { x: 9.5, z: 5 }, 0.6)
    // Drawn from the west end toward the door, it stops 100 mm short of the doorway.
    expect(run.x + run.length).toBeCloseTo(sides[0] - 0.1, 6)
  })

  it('stand free as an island drawn corner to corner', () => {
    const island = counterBetween({ x: 6, z: 6 }, { x: 8.02, z: 6.9 }, { x: 1, z: 0 })
    expect(island).toMatchObject({ length: 2, depth: 0.9 })
    const ring = counterRing(island)
    expect(Math.min(...ring.map((p) => p.x))).toBeCloseTo(6)
    expect(Math.min(...ring.map((p) => p.z))).toBeCloseTo(6)
    // Drawn from the far corner back, it covers the same ground.
    const again = counterRing(counterBetween({ x: 8, z: 6.9 }, { x: 6, z: 6 }, { x: 1, z: 0 }))
    expect(Math.min(...again.map((p) => p.x))).toBeCloseTo(6)
    expect(Math.max(...again.map((p) => p.z))).toBeCloseTo(6.9)
  })

  it('are picked by a point on them', () => {
    const doc = addCounter(room(), floorOf(room()).id, base).document
    expect(counterAt(floorOf(doc), { x: 5, z: 4.5 })?.kind).toBe('base')
    expect(counterAt(floorOf(doc), { x: 5, z: 6 })).toBeNull()
  })

  it('are built as a plinth, cupboards and a worktop 900 mm up, with wall cupboards over them if asked', () => {
    const parts = buildCounterParts([{ ...base, id: 'c', wallUnits: true }], 1)
    let top = -Infinity
    for (const part of parts) {
      const position = part.geometry.getAttribute('position')
      for (let i = 0; i < position.count; i++) top = Math.max(top, position.getY(i))
      part.geometry.dispose()
    }
    expect(top).toBeCloseTo(1 + 2.15, 6)
    const plain = buildCounterParts([{ ...base, id: 'c' }], 1)
    let height = -Infinity
    for (const part of plain) {
      const position = part.geometry.getAttribute('position')
      for (let i = 0; i < position.count; i++) height = Math.max(height, position.getY(i))
      part.geometry.dispose()
    }
    expect(height).toBeCloseTo(1.9, 6)
  })

  it('are priced by the metre of cupboard, the area of worktop and the metre of wall cupboard', () => {
    let doc = room()
    const fid = floorOf(doc).id
    doc = addCounter(doc, fid, { ...base, wallUnits: true }).document
    doc = addCounter(doc, fid, { x: 6, z: 6, dx: 1, dz: 0, length: 2, depth: 0.9, kind: 'island', top: 'granite' }).document
    const totals = counterTotals(doc)
    expect(totals.units).toEqual({ base: 3, island: 2, bar: 0 })
    expect(totals.wallUnits).toBe(3)
    expect(totals.tops.granite).toBeCloseTo(2 * 0.94, 6)
    const lines = takeoff(doc).filter((line) => line.group === 'Joinery')
    expect(lines.map((line) => line.id).sort()).toEqual(['counter-wall-units', 'counter:base', 'counter:island', 'worktop:granite', 'worktop:laminate'])
    expect(takeoff(room()).some((line) => line.group === 'Joinery')).toBe(false)
  })

  it('close up to a stove and stop at it, and run on from a sink', () => {
    let doc = room()
    const fid = floorOf(doc).id
    const wall = counterFace(floorOf(doc), { x: 4.5, z: 4.3 }, 0.45)!
    const backZ = wall.point.z
    // A stove standing against the south wall from x = 7 to 7.6, and a sink unit from 8.4 to 9.6.
    doc = addFixture(doc, fid, { kind: 'stove', x: 7.3, z: backZ + 0.3, dx: 0, dz: 1, y: 0 } as never).document
    doc = addFixture(doc, fid, { kind: 'sink', x: 9, z: backZ + 0.3, dx: 0, dz: 1, y: 0 } as never).document
    const face = counterFace(floorOf(doc), { x: 4.5, z: 4.3 }, 0.45)!
    expect(face.spans.map((span) => [span.kind, span.stop])).toEqual([['stove', true], ['sink', false]])
    const end = (x: number) => {
      const run = counterAlongFace(face, { x, z: 5 }, 0.6)
      return run.x + run.dx * run.length
    }
    // Ending 80 mm short of the stove, it closes up to the stove's side.
    expect(end(6.92)).toBeCloseTo(7, 6)
    // Pulled on past the stove, it still stops at the stove's near side.
    expect(end(8)).toBeCloseTo(7, 6)
    // Started beyond the stove, it runs on through the sink unit without stopping.
    const beyond = counterFace(floorOf(doc), { x: 7.8, z: 4.3 }, 0.45)!
    const on = counterAlongFace(beyond, { x: 9.8, z: 5 }, 0.6)
    expect(on.x + on.dx * on.length).toBeGreaterThan(9.6)
    // And started beyond it and pulled back, it stops at the stove's far side.
    const back = counterAlongFace(beyond, { x: 5, z: 5 }, 0.6)
    expect(back.x).toBeCloseTo(7.6, 6)
  })

  it('are flagged when they run through a stove, but not when they stop beside it', () => {
    let doc = room()
    const fid = floorOf(doc).id
    const backZ = counterFace(floorOf(doc), { x: 4.5, z: 4.3 }, 0.45)!.point.z
    doc = addFixture(doc, fid, { kind: 'stove', x: 7.3, z: backZ + 0.3, dx: 0, dz: 1, y: 0 } as never).document
    const through = addCounter(doc, fid, { ...base, x: 5, z: backZ, length: 4 }).document
    expect(counterIssues(through).map((issue) => issue.text)).toEqual(['A counter runs through the electric stove. Stop the counter at its side, or move one of them.'])
    const beside = addCounter(doc, fid, { ...base, x: 5, z: backZ, length: 2 }).document
    expect(counterIssues(beside)).toEqual([])
  })

  it('draw a sink flush with a counter and a stove to its side when those are placed', () => {
    let doc = room()
    const fid = floorOf(doc).id
    const backZ = counterFace(floorOf(doc), { x: 4.5, z: 4.3 }, 0.45)!.point.z
    // A counter along the south wall from x = 5 to 8.
    doc = addCounter(doc, fid, { ...base, x: 5, z: backZ, length: 3 }).document
    const floor = floorOf(doc)
    const left = (placed: { fixture: { x: number; z: number; dx: number; dz: number; kind: string } }, width: number) => placed.fixture.x - width / 2
    // A sink dropped 100 mm shy of the counter's start sits flush with it, inside the counter.
    const sink = placeFixture(floor, { x: 5.7, z: 4.6 }, 'sink', { x: 0, z: 1 })
    expect(sink.problem).toBeNull()
    expect(left(sink, 1.2)).toBeCloseTo(5, 6)
    // A stove dropped in the middle of the counter goes to the nearer end, outside it.
    const stove = placeFixture(floor, { x: 7.4, z: 4.6 }, 'stove', { x: 0, z: 1 })
    expect(left(stove, 0.6)).toBeCloseTo(8, 6)
    // Well clear of the counter, a fitting goes where it is put.
    const clear = placeFixture(floor, { x: 9.1, z: 4.6 }, 'stove', { x: 0, z: 1 })
    expect(clear.fixture.x).toBeCloseTo(9.1, 6)
    // And with no counters, nothing changes.
    expect(placeFixture(floorOf(room()), { x: 5.7, z: 4.6 }, 'sink', { x: 0, z: 1 }).fixture.x).toBeCloseTo(5.7, 6)
  })

  it('take a sink or a hob set into an island, flush with the side it is worked at from', () => {
    let doc = room()
    const fid = floorOf(doc).id
    // An island from x = 6 to 8, z = 6 to 6.9.
    doc = addCounter(doc, fid, { x: 6, z: 6, dx: 1, dz: 0, length: 2, depth: 0.9, kind: 'island', top: 'granite' }).document
    const floor = floorOf(doc)
    // Dropped near its far side, a stove is built in there, facing out of that side.
    const hob = placeFixture(floor, { x: 7.02, z: 6.8 }, 'stove', { x: 0, z: 1 })
    expect(hob.problem).toBeNull()
    expect(hob.fixture.builtIn).toBe(true)
    expect(hob.fixture.dz).toBeCloseTo(1, 6)
    expect(hob.fixture.x).toBeCloseTo(7, 6)
    expect(hob.fixture.z).toBeCloseTo(6.6, 6)
    // A sink dropped near its near side faces the other way, and stays inside the island's length.
    const sink = placeFixture(floor, { x: 6.1, z: 6.1 }, 'sink', { x: 0, z: 1 })
    expect(sink.fixture.dz).toBeCloseTo(-1, 6)
    expect(sink.fixture.x).toBeCloseTo(6.6, 6)
    expect(sink.fixture.z).toBeCloseTo(6.3, 6)
    expect(sink.fixture.builtIn).toBeUndefined()
    // A washing machine does not go in an island, and a bar is too narrow for anything.
    expect(placeFixture(floor, { x: 7, z: 6.5 }, 'washing-machine', { x: 0, z: 1 }).fixture.z).not.toBeCloseTo(6.6, 1)
    const bar = floorOf(addCounter(room(), fid, { x: 6, z: 6, dx: 1, dz: 0, length: 2, depth: 0.4, kind: 'bar', top: 'timber' }).document)
    expect(placeFixture(bar, { x: 7, z: 6.2 }, 'stove', { x: 0, z: 1 }).fixture.builtIn).toBeUndefined()
  })

  it('run through a built-in hob without complaint, and draw it flush inside them like a sink', () => {
    let doc = room()
    const fid = floorOf(doc).id
    const backZ = counterFace(floorOf(doc), { x: 4.5, z: 4.3 }, 0.45)!.point.z
    doc = addCounter(doc, fid, { ...base, x: 5, z: backZ, length: 3 }).document
    doc = addFixture(doc, fid, { kind: 'stove', x: 6.5, z: backZ + 0.3, dx: 0, dz: 1, y: 0, builtIn: true } as never).document
    expect(counterIssues(doc)).toEqual([])
    // A new counter is not stopped by it.
    const face = counterFace(floorOf(doc), { x: 5, z: backZ + 0.1 }, 0.45)!
    expect(face.spans.some((span) => span.stop)).toBe(false)
    // Dropped in the middle of the counter it stays there; near an end it sits flush inside.
    const floor = floorOf(doc)
    expect(placeFixture(floor, { x: 6.5, z: 4.6 }, 'stove', { x: 0, z: 1 }, { setup: { builtIn: true } }).fixture.x).toBeCloseTo(6.5, 6)
    expect(placeFixture(floor, { x: 5.4, z: 4.6 }, 'stove', { x: 0, z: 1 }, { setup: { builtIn: true } }).fixture).toMatchObject({ builtIn: true })
    expect(placeFixture(floor, { x: 5.4, z: 4.6 }, 'stove', { x: 0, z: 1 }, { setup: { builtIn: true } }).fixture.x).toBeCloseTo(5.3, 6)
    // Only a stove can be built in.
    expect(addFixture(doc, fid, { kind: 'sink', x: 8.5, z: backZ + 0.3, dx: 0, dz: 1, y: 0, builtIn: true } as never).ok).toBe(false)
  })

  it('are cut through where a sink is set into them, and the sink is drawn as bowls rather than a unit of its own', () => {
    let doc = room()
    const fid = floorOf(doc).id
    const backZ = counterFace(floorOf(doc), { x: 4.5, z: 4.3 }, 0.45)!.point.z
    doc = addCounter(doc, fid, { ...base, x: 5, z: backZ, length: 3 }).document
    const whole = buildCounterParts(floorOf(doc).counters!, 0)
    doc = addFixture(doc, fid, { kind: 'sink', x: 6.5, z: backZ + 0.3, dx: 0, dz: 1, y: 0 } as never).document
    const floor = floorOf(doc)
    const cut = buildCounterParts(floor.counters!, 0, floor.fixtures!)
    const count = (parts: { geometry: { getAttribute(name: string): { count: number } } }[]) => parts.reduce((sum, part) => sum + part.geometry.getAttribute('position').count, 0)
    expect(count(cut)).toBeGreaterThan(count(whole))
    const span = (parts: ReturnType<typeof buildFixtureParts>) => {
      const ys = parts.flatMap((part) => Array.from(part.geometry.getAttribute('position').array).filter((_, i) => i % 3 === 1))
      return Math.min(...ys)
    }
    // On its own the sink stands on the floor as a unit; set in, nothing of it is below the bowls.
    expect(span(buildFixtureParts(floor.fixtures!, 0))).toBeLessThan(0.05)
    expect(span(buildFixtureParts(floor.fixtures!, 0, floor.counters!))).toBeGreaterThan(0.6)
  })

  it('go with their room when it is moved, and are found on the wall they stand against', () => {
    let doc = room()
    const fid = floorOf(doc).id
    const backZ = counterFace(floorOf(doc), { x: 4.5, z: 4.3 }, 0.45)!.point.z
    doc = addCounter(doc, fid, { ...base, x: 5, z: backZ, length: 3 }).document
    doc = addCounter(doc, fid, { x: 6, z: 6, dx: 1, dz: 0, length: 2, depth: 0.9, kind: 'island', top: 'granite' }).document
    const south = floorOf(doc).walls.find((wall) => {
      const [a, b] = [wall.startCornerId, wall.endCornerId].map((id) => floorOf(doc).corners.find((corner) => corner.id === id)!)
      return a.z === 4 && b.z === 4
    })!
    const sides = ([1, -1] as const).map((side) => countersOnWall(floorOf(doc), south.id, side).length)
    expect(sides.sort()).toEqual([0, 1])
    const moved = moveCorners(doc, fid, floorOf(doc).corners.map((corner) => corner.id), 1, 0.5)
    expect(moved.ok).toBe(true)
    const [wallCounter, island] = floorOf(moved.document).counters!
    expect(wallCounter).toMatchObject({ x: 6, z: backZ + 0.5 })
    expect(island).toMatchObject({ x: 7, z: 6.5 })
  })

  it('are carried along their wall, or to another, by the point they were picked up by', () => {
    let doc = room()
    const fid = floorOf(doc).id
    const backZ = counterFace(floorOf(doc), { x: 4.5, z: 4.3 }, 0.45)!.point.z
    doc = addCounter(doc, fid, { ...base, x: 5, z: backZ, length: 2 }).document
    const floor = floorOf(doc)
    const counter = floor.counters![0]
    // Picked up 0.5 m along it and carried 1 m along the wall.
    const slid = counterCarried(floor, counter, { x: 6.52, z: 4.4 }, 0.5, 0.9)!
    expect(slid).toMatchObject({ dx: 1, dz: 0 })
    // It lands within 25 mm of where it was carried to, a whole number of 50 mm steps from the inside corner.
    expect(Math.abs(slid.x - 6.02)).toBeLessThanOrEqual(0.025 + 1e-9)
    const fromCorner = (slid.x - (4 + HALF)) / 0.05
    expect(Math.abs(fromCorner - Math.round(fromCorner))).toBeLessThan(1e-6)
    expect(slid.z).toBeCloseTo(backZ, 6)
    // Carried past the end of the wall, it stops flush with the face of the wall at the corner.
    const end = counterCarried(floor, counter, { x: 9.9, z: 4.4 }, 0.5, 0.9)!
    const far = counterRing({ ...counter, ...end }).map((p) => p.x)
    expect(Math.max(...far)).toBeCloseTo(10 - HALF, 6)
    // Carried to the west wall, it turns to stand against that, still with the room in front of it.
    const turned = counterCarried(floor, counter, { x: 4.3, z: 7 }, 0.5, 0.9)!
    expect(Math.abs(turned.dz)).toBeCloseTo(1, 6)
    expect(Math.max(...counterRing({ ...counter, ...turned }).map((p) => p.x))).toBeGreaterThan(4.6)
    // In the middle of the room there is no wall to stand against.
    expect(counterCarried(floor, counter, { x: 7, z: 6.5 }, 0.5, 0.9)).toBeNull()
  })
})

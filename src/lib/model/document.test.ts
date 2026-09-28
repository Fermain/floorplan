import { describe, expect, it } from 'vitest'
import { fixtureDocument } from '../plot/fixture'
import {
  addCorner,
  addOpening,
  addWall,
  setOpeningAligned,
  updateOpening,
} from './mutations'
import { deriveRooms } from './rooms'
import { DEFAULT_SILL, DEFAULT_WINDOW_HEIGHT } from '../plot/fixture'
import { loadDocument, undo, documentStore, getDocument } from '../state/document.svelte'

function floorId(doc: ReturnType<typeof fixtureDocument>) {
  return doc.building.floors[0].id
}

function rectInsidePlot(doc: ReturnType<typeof fixtureDocument>) {
  let d = doc
  const fid = floorId(d)
  const ids = ['c0', 'c1', 'c2', 'c3'] as const
  const pts: [string, number, number][] = [
    [ids[0], 4, 4],
    [ids[1], 10, 4],
    [ids[2], 10, 10],
    [ids[3], 4, 10],
  ]
  for (const [id, x, z] of pts) {
    d = {
      ...d,
      building: {
        floors: d.building.floors.map((f) =>
          f.id === fid
            ? { ...f, corners: [...f.corners, { id, x, z }] }
            : f,
        ),
      },
    }
  }
  for (let i = 0; i < 4; i++) {
    const r = addWall(d, fid, ids[i], ids[(i + 1) % 4], 'double')
    expect(r.ok).toBe(true)
    if (r.ok) d = r.document
  }
  return d
}

describe('wall intersection split', () => {
  it('splits both crossing walls and adds one corner', () => {
    let d = fixtureDocument()
    const fid = floorId(d)
    const corners: string[] = []
    for (const [x, z] of [
      [2, 5],
      [14, 5],
      [8, 3],
      [8, 15],
    ] as const) {
      const r = addCorner(d, fid, x, z)
      expect(r.ok).toBe(true)
      if (!r.ok) return
      d = r.document
      corners.push(r.document.building.floors[0].corners.at(-1)!.id)
    }
    const w1 = addWall(d, fid, corners[0], corners[1], 'single')
    expect(w1.ok).toBe(true)
    if (!w1.ok) return
    d = w1.document
    const w2 = addWall(d, fid, corners[2], corners[3], 'single')
    expect(w2.ok).toBe(true)
    if (!w2.ok) return
    d = w2.document
    const floor = d.building.floors[0]
    expect(floor.corners.length).toBe(5)
    expect(floor.walls.length).toBe(4)
  })
})

describe('rooms', () => {
  it('yields one room for a closed rectangle', () => {
    const d = rectInsidePlot(fixtureDocument())
    const rooms = deriveRooms(d.building.floors[0])
    expect(rooms.length).toBe(1)
    expect(rooms[0].signedArea).toBeGreaterThan(0)
  })

  it('yields two rooms when a logical wall splits the rectangle', () => {
    let d = rectInsidePlot(fixtureDocument())
    const fid = floorId(d)
    const floor = d.building.floors[0]
    const c0 = floor.corners.find((c) => c.id === 'c0')!
    const c2 = floor.corners.find((c) => c.id === 'c2')!
    const r = addWall(d, fid, c0.id, c2.id, 'logical')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    d = r.document
    const rooms = deriveRooms(d.building.floors[0])
    expect(rooms.length).toBe(2)
  })
})

describe('plot limit', () => {
  it('rejects a wall with an endpoint outside the plot ring', () => {
    let d = fixtureDocument()
    const fid = floorId(d)
    const inside = addCorner(d, fid, 5, 5)
    d = inside.ok ? inside.document : d
    const outside = addCorner(d, fid, -5, 5)
    d = outside.ok ? outside.document : d
    const floor = d.building.floors[0]
    const r = addWall(d, fid, floor.corners[0].id, floor.corners[1].id, 'single')
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.document).toEqual(d)
  })
})

describe('document store undo', () => {
  it('restores the document before the last successful mutation', () => {
    loadDocument(fixtureDocument())
    const before = structuredClone(getDocument())
    const fid = floorId(before)
    const r = documentStore.addCorner(fid, 3, 3)
    expect(r.ok).toBe(true)
    expect(getDocument().building.floors[0].corners.length).toBe(1)
    expect(undo()).toBe(true)
    expect(getDocument()).toEqual(before)
  })
})

describe('aligned openings', () => {
  it('uses sill and height until v is overridden, then realigns', () => {
    let d = rectInsidePlot(fixtureDocument())
    const fid = floorId(d)
    const wallId = d.building.floors[0].walls[0].id
    const added = addOpening(d, fid, wallId, 'window', 1)
    expect(added.ok).toBe(true)
    if (!added.ok) return
    d = added.document
    let opening = d.building.floors[0].walls[0].openings[0]
    expect(opening.v).toBe(DEFAULT_SILL)
    expect(opening.height).toBe(DEFAULT_WINDOW_HEIGHT)
    expect(opening.aligned).toBe(true)

    const bumped = updateOpening(d, fid, wallId, opening.id, { v: 1.1 })
    expect(bumped.ok).toBe(true)
    if (!bumped.ok) return
    d = bumped.document
    opening = d.building.floors[0].walls[0].openings[0]
    expect(opening.v).toBe(1.1)
    expect(opening.aligned).toBe(false)

    const realign = setOpeningAligned(d, fid, wallId, opening.id, true)
    expect(realign.ok).toBe(true)
    if (!realign.ok) return
    opening = realign.document.building.floors[0].walls[0].openings[0]
    expect(opening.v).toBe(DEFAULT_SILL)
    expect(opening.aligned).toBe(true)
  })
})

import { describe, expect, it } from 'vitest'
import { BLOCK_LENGTH, fixtureDocument } from '../plot/fixture'
import {
  addCorner,
  addOpening,
  addStorey,
  addWall,
  moveCorners,
  rotateCorners,
  removeOpening,
  removeTopStorey,
  removeWall,
  replacePlot,
  setOpeningAligned,
  updateOpening,
} from './mutations'
import { deriveRooms } from './rooms'
import { DEFAULT_SILL, DEFAULT_WINDOW_HEAD, DEFAULT_WINDOW_HEIGHT, FLOOR_TO_FLOOR, MAX_STOREYS } from '../plot/fixture'
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

  it('splits an existing wall when a new wall ends on it', () => {
    let d = fixtureDocument()
    const fid = floorId(d)
    const corners: string[] = []
    for (const [x, z] of [
      [2, 6],
      [14, 6],
      [8, 2],
      [8, 6],
    ] as const) {
      const r = addCorner(d, fid, x, z)
      expect(r.ok).toBe(true)
      if (!r.ok) return
      d = r.document
      corners.push(r.document.building.floors[0].corners.at(-1)!.id)
    }
    const along = addWall(d, fid, corners[0], corners[1], 'double')
    expect(along.ok).toBe(true)
    if (!along.ok) return
    d = along.document
    const tee = addWall(d, fid, corners[2], corners[3], 'double')
    expect(tee.ok).toBe(true)
    if (!tee.ok) return
    const floor = tee.document.building.floors[0]
    expect(floor.corners).toHaveLength(4)
    const junction = floor.corners.find((c) => c.id === corners[3])
    expect(junction).toBeTruthy()
    const joined = floor.walls.filter(
      (w) => w.startCornerId === corners[3] || w.endCornerId === corners[3],
    )
    expect(joined).toHaveLength(3)
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

  it('sets a door head on the same line as a window head', () => {
    let d = rectInsidePlot(fixtureDocument())
    const fid = floorId(d)
    const wallId = d.building.floors[0].walls[0].id
    const door = addOpening(d, fid, wallId, 'door', 0.5)
    expect(door.ok).toBe(true)
    if (!door.ok) return
    const window = addOpening(door.document, fid, wallId, 'window', 2)
    expect(window.ok).toBe(true)
    if (!window.ok) return
    const openings = window.document.building.floors[0].walls[0].openings
    const doorHead = openings[0].v + openings[0].height
    const windowHead = openings[1].v + openings[1].height
    expect(doorHead).toBeCloseTo(DEFAULT_WINDOW_HEAD, 5)
    expect(windowHead).toBeCloseTo(doorHead, 5)
  })
})

describe('delete', () => {
  it('removes a wall and keeps its corners', () => {
    const d = rectInsidePlot(fixtureDocument())
    const fid = floorId(d)
    const wallId = d.building.floors[0].walls[0].id
    const removed = removeWall(d, fid, wallId)
    expect(removed.ok).toBe(true)
    if (!removed.ok) return
    expect(removed.document.building.floors[0].walls.some((w) => w.id === wallId)).toBe(false)
    expect(removed.document.building.floors[0].corners).toHaveLength(4)
    expect(removed.document.building.floors[0].walls).toHaveLength(3)
  })

  it('leaves the document unchanged when the wall is missing', () => {
    const d = rectInsidePlot(fixtureDocument())
    const missing = removeWall(d, floorId(d), 'missing')
    expect(missing.ok).toBe(false)
    expect(missing.document).toBe(d)
  })

  it('removes one opening', () => {
    let d = rectInsidePlot(fixtureDocument())
    const fid = floorId(d)
    const wallId = d.building.floors[0].walls[0].id
    const added = addOpening(d, fid, wallId, 'window', 1)
    expect(added.ok).toBe(true)
    if (!added.ok) return
    d = added.document
    const openingId = d.building.floors[0].walls[0].openings[0].id
    const removed = removeOpening(d, fid, wallId, openingId)
    expect(removed.ok).toBe(true)
    if (!removed.ok) return
    expect(removed.document.building.floors[0].walls[0].openings).toHaveLength(0)
  })
})

describe('replace plot', () => {
  it('keeps the building when every wall stays inside', () => {
    const d = rectInsidePlot(fixtureDocument())
    const replaced = replacePlot(d, { ...d.plot, northBearingDeg: 20 })
    expect(replaced.ok).toBe(true)
    if (!replaced.ok) return
    expect(replaced.document.plot.northBearingDeg).toBe(20)
    expect(replaced.document.building.floors[0].walls).toHaveLength(4)
  })

  it('refuses a ring that leaves existing walls outside', () => {
    const d = rectInsidePlot(fixtureDocument())
    const replaced = replacePlot(d, {
      ...d.plot,
      ring: [
        [0, 0],
        [3, 0],
        [3, 3],
        [0, 3],
      ],
    })
    expect(replaced.ok).toBe(false)
    if (replaced.ok) return
    expect(replaced.reason).toBe('existing walls leave the new plot')
    expect(replaced.document).toBe(d)
  })
})

describe('moveCorners', () => {
  it('slides a closed building and keeps its shape', () => {
    const d = rectInsidePlot(fixtureDocument())
    const floor = d.building.floors[0]
    const moved = moveCorners(d, floor.id, floor.corners.map((c) => c.id), 2, -1)
    expect(moved.ok).toBe(true)
    if (!moved.ok) return
    const next = moved.document.building.floors[0]
    expect(next.corners.map((c) => [c.x, c.z])).toEqual([
      [6, 3],
      [12, 3],
      [12, 9],
      [6, 9],
    ])
    expect(next.walls).toHaveLength(4)
  })

  it('refuses a move that leaves the plot', () => {
    const d = rectInsidePlot(fixtureDocument())
    const floor = d.building.floors[0]
    const moved = moveCorners(d, floor.id, ['c0'], 30, 0)
    expect(moved.ok).toBe(false)
    if (moved.ok) return
    expect(moved.document).toBe(d)
  })
})

describe('rotateCorners', () => {
  it('turns a building a quarter turn around the chosen corner', () => {
    const d = rectInsidePlot(fixtureDocument())
    const floor = d.building.floors[0]
    const turned = rotateCorners(d, floor.id, floor.corners.map((c) => c.id), 'c2', Math.PI / 2)
    expect(turned.ok).toBe(true)
    if (!turned.ok) return
    expect(turned.document.building.floors[0].corners.map((c) => [c.x, c.z])).toEqual([
      [16, 4],
      [16, 10],
      [10, 10],
      [10, 4],
    ])
  })

  it('turns a building by an angle that is not a right angle', () => {
    const d = rectInsidePlot(fixtureDocument())
    const floor = d.building.floors[0]
    const turned = rotateCorners(d, floor.id, floor.corners.map((c) => c.id), 'c2', (15 * Math.PI) / 180)
    expect(turned.ok).toBe(true)
    if (!turned.ok) return
    const c1 = turned.document.building.floors[0].corners.find((c) => c.id === 'c1')
    expect(c1?.x).toBeCloseTo(11.552914, 4)
    expect(c1?.z).toBeCloseTo(4.204445, 4)
  })

  it('refuses a turn that leaves the plot', () => {
    const d = rectInsidePlot(fixtureDocument())
    const floor = d.building.floors[0]
    const turned = rotateCorners(d, floor.id, floor.corners.map((c) => c.id), 'c0', Math.PI / 2)
    expect(turned.ok).toBe(false)
    if (turned.ok) return
    expect(turned.reason).toBe('wall outside plot')
    expect(turned.document).toBe(d)
  })
})

describe('door width', () => {
  it('clamps a door between a narrow leaf and the wall minus padding', () => {
    const d = rectInsidePlot(fixtureDocument())
    const floor = d.building.floors[0]
    const wall = floor.walls[0]
    const wide = addOpening(d, floor.id, wall.id, 'door', 0, 10)
    expect(wide.ok).toBe(true)
    if (!wide.ok) return
    const opening = wide.document.building.floors[0].walls[0].openings[0]
    expect(opening.width).toBeCloseTo(5.7, 5)
    expect(opening.u).toBeCloseTo(0.15, 5)

    const narrow = addOpening(d, floor.id, wall.id, 'door', 2, 0.2)
    expect(narrow.ok).toBe(true)
    if (!narrow.ok) return
    const slim = narrow.document.building.floors[0].walls[0].openings[0]
    expect(slim.width).toBeCloseTo(0.6, 5)
    expect(slim.u).toBeCloseTo(2, 5)
  })

  it('keeps the centre when a door is widened', () => {
    const d = rectInsidePlot(fixtureDocument())
    const floor = d.building.floors[0]
    const wall = floor.walls[0]
    const added = addOpening(d, floor.id, wall.id, 'door', 2, 0.9)
    expect(added.ok).toBe(true)
    if (!added.ok) return
    const opening = added.document.building.floors[0].walls[0].openings[0]
    const widened = updateOpening(added.document, floor.id, wall.id, opening.id, { width: 2 })
    expect(widened.ok).toBe(true)
    if (!widened.ok) return
    const next = widened.document.building.floors[0].walls[0].openings[0]
    expect(next.width).toBeCloseTo(2, 5)
    expect(next.u).toBeCloseTo(1.45, 5)
  })

  it('keeps the centre when a window is widened', () => {
    const d = rectInsidePlot(fixtureDocument())
    const floor = d.building.floors[0]
    const wall = floor.walls[0]
    const added = addOpening(d, floor.id, wall.id, 'window', 2)
    expect(added.ok).toBe(true)
    if (!added.ok) return
    const opening = added.document.building.floors[0].walls[0].openings[0]
    const centre = opening.u + opening.width / 2
    const widened = updateOpening(added.document, floor.id, wall.id, opening.id, { width: 1.4 })
    expect(widened.ok).toBe(true)
    if (!widened.ok) return
    const next = widened.document.building.floors[0].walls[0].openings[0]
    expect(next.width).toBeCloseTo(1.4, 5)
    expect(next.u + next.width / 2).toBeCloseTo(centre, 5)
  })

  it('keeps a block between a door and a window', () => {
    const d = rectInsidePlot(fixtureDocument())
    const floor = d.building.floors[0]
    const wall = floor.walls[0]
    const door = addOpening(d, floor.id, wall.id, 'door', 1, 0.9)
    expect(door.ok).toBe(true)
    if (!door.ok) return
    const first = door.document.building.floors[0].walls[0].openings[0]
    const beside = addOpening(door.document, floor.id, wall.id, 'window', first.u + first.width + 0.1)
    expect(beside.ok).toBe(true)
    if (!beside.ok) return
    const second = beside.document.building.floors[0].walls[0].openings[1]
    expect(second.u).toBeCloseTo(first.u + first.width + BLOCK_LENGTH, 5)
    const crowded = updateOpening(beside.document, floor.id, wall.id, second.id, {
      u: first.u + first.width + 0.05,
    })
    expect(crowded.ok).toBe(true)
    if (!crowded.ok) return
    const shifted = crowded.document.building.floors[0].walls[0].openings[1]
    expect(shifted.u).toBeCloseTo(first.u + first.width + BLOCK_LENGTH, 5)
    const widened = updateOpening(beside.document, floor.id, wall.id, first.id, { width: 2 })
    expect(widened.ok).toBe(true)
    if (!widened.ok) return
    const held = widened.document.building.floors[0].walls[0].openings[0]
    expect(held.width).toBeCloseTo(0.9, 5)
    expect(held.u).toBeCloseTo(1, 5)
  })

  it('holds a window 150 mm from a free end', () => {
    const d = rectInsidePlot(fixtureDocument())
    const floor = d.building.floors[0]
    const wall = floor.walls[0]
    const placed = addOpening(d, floor.id, wall.id, 'window', 0.02)
    expect(placed.ok).toBe(true)
    if (!placed.ok) return
    const opening = placed.document.building.floors[0].walls[0].openings[0]
    expect(opening.u).toBeCloseTo(0.15, 5)
  })

  it('refuses a window that cannot leave 150 mm at both ends', () => {
    let d = fixtureDocument()
    const fid = floorId(d)
    const first = addCorner(d, fid, 5, 8)
    expect(first.ok).toBe(true)
    if (!first.ok) return
    d = first.document
    const second = addCorner(d, fid, 6.15, 8)
    expect(second.ok).toBe(true)
    if (!second.ok) return
    d = second.document
    const corners = d.building.floors[0].corners
    const walled = addWall(d, fid, corners[0].id, corners[1].id, 'double')
    expect(walled.ok).toBe(true)
    if (!walled.ok) return
    d = walled.document
    const wall = d.building.floors[0].walls[0]
    const window = addOpening(d, fid, wall.id, 'window', 0.1)
    expect(window.ok).toBe(false)
    if (window.ok) return
    expect(window.reason).toBe('openings too close')
    expect(window.document).toBe(d)
  })

  it('refuses a door on a wall that cannot hold the minimum', () => {
    let d = fixtureDocument()
    const fid = floorId(d)
    const first = addCorner(d, fid, 5, 8)
    expect(first.ok).toBe(true)
    if (!first.ok) return
    d = first.document
    const second = addCorner(d, fid, 5.5, 8)
    expect(second.ok).toBe(true)
    if (!second.ok) return
    d = second.document
    const corners = d.building.floors[0].corners
    const walled = addWall(d, fid, corners[0].id, corners[1].id, 'double')
    expect(walled.ok).toBe(true)
    if (!walled.ok) return
    d = walled.document
    const wall = d.building.floors[0].walls[0]
    const door = addOpening(d, fid, wall.id, 'door', 0.1, 0.9)
    expect(door.ok).toBe(false)
    if (door.ok) return
    expect(door.reason).toBe('wall too short for a door')
    expect(door.document).toBe(d)
  })
})

describe('storeys', () => {
  it('lays an empty floor on the building outline', () => {
    let d = rectInsidePlot(fixtureDocument())
    const fid = floorId(d)
    const opened = addOpening(d, fid, d.building.floors[0].walls[0].id, 'door', 1, 0.9)
    expect(opened.ok).toBe(true)
    if (!opened.ok) return
    d = opened.document
    const added = addStorey(d, fid, 'c0')
    expect(added.ok).toBe(true)
    if (!added.ok) return
    d = added.document
    expect(d.building.floors).toHaveLength(2)
    const upper = d.building.floors[1]
    expect(upper.index).toBe(1)
    expect(upper.datumHeight).toBe(FLOOR_TO_FLOOR)
    expect(upper.walls).toHaveLength(0)
    expect(upper.corners).toHaveLength(0)
    expect(upper.outline?.[0]).toHaveLength(4)
    expect(d.building.floors[0].walls[0].openings).toHaveLength(1)
    const outside = addCorner(d, upper.id, 2, 2)
    expect(outside.ok).toBe(true)
    if (!outside.ok) return
    const inside = addCorner(outside.document, upper.id, 7, 7)
    expect(inside.ok).toBe(true)
    if (!inside.ok) return
    const edgeA = addCorner(inside.document, upper.id, 4, 4)
    expect(edgeA.ok).toBe(true)
    if (!edgeA.ok) return
    const edgeB = addCorner(edgeA.document, upper.id, 10, 4)
    expect(edgeB.ok).toBe(true)
    if (!edgeB.ok) return
    const corners = edgeB.document.building.floors[1].corners
    const along = addWall(edgeB.document, upper.id, corners[1].id, corners[2].id, 'double')
    expect(along.ok).toBe(true)
    if (!along.ok) return
    const past = addWall(along.document, upper.id, corners[0].id, corners[2].id, 'double')
    expect(past.ok).toBe(true)
    if (!past.ok) return
    expect(past.document.building.floors[1].walls).toHaveLength(2)
  })

  it('stops at four storeys and removes only the top', () => {
    let d = rectInsidePlot(fixtureDocument())
    const fid = floorId(d)
    for (let i = 1; i < MAX_STOREYS; i++) {
      const corner = d.building.floors[0].corners[0].id
      const added = addStorey(d, fid, corner)
      expect(added.ok).toBe(true)
      if (!added.ok) return
      d = added.document
    }
    const blocked = addStorey(d, fid, 'c0')
    expect(blocked.ok).toBe(false)
    if (blocked.ok) return
    expect(blocked.reason).toBe('storey limit')
    const unitId = d.building.floors[1].unitId
    expect(unitId).toBeTruthy()
    if (!unitId) return
    const removed = removeTopStorey(d, unitId)
    expect(removed.ok).toBe(true)
    if (!removed.ok) return
    expect(removed.document.building.floors.map((floor) => floor.index).sort()).toEqual([0, 1, 2])
  })

  it('leaves a second building on the ground', () => {
    let d = rectInsidePlot(fixtureDocument())
    const fid = floorId(d)
    const extra: [string, number, number][] = [
      ['d0', 12, 4],
      ['d1', 16, 4],
      ['d2', 16, 8],
      ['d3', 12, 8],
    ]
    for (const [id, x, z] of extra) {
      d = {
        ...d,
        building: {
          floors: d.building.floors.map((floor) =>
            floor.id === fid ? { ...floor, corners: [...floor.corners, { id, x, z }] } : floor,
          ),
        },
      }
    }
    for (let i = 0; i < 4; i++) {
      const walled = addWall(d, fid, extra[i][0], extra[(i + 1) % 4][0], 'double')
      expect(walled.ok).toBe(true)
      if (!walled.ok) return
      d = walled.document
    }
    const added = addStorey(d, fid, 'c0')
    expect(added.ok).toBe(true)
    if (!added.ok) return
    const upper = added.document.building.floors[1]
    expect(upper.corners).toHaveLength(0)
    expect(upper.outline?.[0].some((point) => point.x === 12)).toBe(false)
    expect(upper.outline?.[0].some((point) => point.x === 4)).toBe(true)
    expect(added.document.building.floors[0].corners.some((corner) => corner.unitId)).toBe(true)
    expect(added.document.building.floors[0].corners.find((corner) => corner.id === 'd0')?.unitId).toBeUndefined()
  })
})

describe('document store', () => {
  it('adds a corner through the reactive document and undo restores it', () => {
    loadDocument(fixtureDocument())
    const fid = getDocument().building.floors[0].id
    const added = documentStore.addCorner(fid, 5, 5)
    expect(added.ok).toBe(true)
    expect(getDocument().building.floors[0].corners).toEqual([{ id: expect.any(String), x: 5, z: 5 }])
    expect(undo()).toBe(true)
    expect(getDocument().building.floors[0].corners).toHaveLength(0)
  })
})

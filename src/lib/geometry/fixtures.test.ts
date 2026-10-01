import { describe, expect, it } from 'vitest'
import { fixtureDocument } from '../plot/fixture'
import { addFixture, addWallRing, moveCorners, removeFixture, updateFixture } from '../model/mutations'
import { FIXTURES, fixtureFootprint } from '../model/fixtures'
import type { Document } from '../model/types'
import { buildFixtureParts, fixtureOnFace, fixtureWall, placeFixture } from './fixtures'
import { floorCells } from './spaces'
import { pointInRing } from './pad'

const east = { x: 1, z: 0 }

function room(): Document {
  const d = fixtureDocument()
  const r = addWallRing(
    d,
    d.building.floors[0].id,
    [
      { x: 4, z: 4 },
      { x: 10, z: 4 },
      { x: 10, z: 8 },
      { x: 4, z: 8 },
    ],
    'double',
  )
  expect(r.ok).toBe(true)
  return r.document
}

function net(doc: Document) {
  const ring = floorCells(doc.building.floors[0])[0].net
  return { minZ: Math.min(...ring.map((p) => p.z)), maxZ: Math.max(...ring.map((p) => p.z)), ring }
}

describe('placing fixtures', () => {
  it('backs a socket onto the nearest inside face and finds that wall again', () => {
    const doc = room()
    const floor = doc.building.floors[0]
    const placed = placeFixture(floor, { x: 7, z: net(doc).minZ + 0.3 }, 'socket', east)
    expect(placed.problem).toBeNull()
    expect(placed.fixture.dz).toBeCloseTo(1)
    expect(placed.fixture.y).toBeCloseTo(0.3)
    const added = addFixture(doc, floor.id, placed.fixture)
    expect(added.ok).toBe(true)
    const fixture = added.document.building.floors[0].fixtures![0]
    const on = fixtureWall(added.document.building.floors[0], fixture)!
    expect(on).not.toBeNull()
    expect(Math.abs(on.u - 3)).toBeLessThan(0.01)
    const again = fixtureOnFace(floor, on.wall, on.side, 'socket', on.u, fixture.y)!
    expect(again.x).toBeCloseTo(fixture.x, 6)
    expect(again.z).toBeCloseTo(fixture.z, 6)
  })

  it('tucks a toilet into a corner inside the room', () => {
    const doc = room()
    const floor = doc.building.floors[0]
    const placed = placeFixture(floor, { x: 4.3, z: 4.3 }, 'wc', east)
    expect(placed.problem).toBeNull()
    expect(fixtureFootprint(placed.fixture).every((p) => pointInRing(net(doc).ring, p.x, p.z))).toBe(true)
  })

  it('puts a garden tap on an outside face, facing out', () => {
    const doc = room()
    const floor = doc.building.floors[0]
    const placed = placeFixture(floor, { x: 7, z: 3.6 }, 'outside-tap', east)
    expect(placed.problem).toBeNull()
    expect(placed.fixture.dz).toBeCloseTo(-1)
    const on = fixtureWall(floor, { ...placed.fixture, id: 't' })
    expect(on).not.toBeNull()
    expect(placeFixture(floor, { x: 7, z: 6 }, 'outside-tap', east).problem).not.toBeNull()
  })

  it('centres a ceiling light when pointed near the middle', () => {
    const doc = room()
    const placed = placeFixture(doc.building.floors[0], { x: 7.2, z: 5.8 }, 'light', east)
    expect(placed.snapped).toBe(true)
    expect(placed.fixture.x).toBeCloseTo(7, 1)
    expect(placed.fixture.z).toBeCloseTo(6, 1)
  })
})

describe('fixture edits', () => {
  it('validates, updates, removes, and moves with its building', () => {
    let doc = room()
    const floor = doc.building.floors[0]
    expect(addFixture(doc, floor.id, { kind: 'marble' as never, x: 5, z: 5, dx: 1, dz: 0, y: 0 }).ok).toBe(false)
    expect(addFixture(doc, floor.id, { kind: 'wc', x: 5, z: 5, dx: 2, dz: 0, y: 0 }).ok).toBe(false)
    doc = addFixture(doc, floor.id, { kind: 'wc', x: 5, z: 5, dx: 1, dz: 0, y: 0 }).document
    const id = doc.building.floors[0].fixtures![0].id
    expect(updateFixture(doc, floor.id, id, { y: 20 }).ok).toBe(false)
    doc = updateFixture(doc, floor.id, id, { y: 0.1 }).document
    expect(doc.building.floors[0].fixtures![0].y).toBeCloseTo(0.1)
    const moved = moveCorners(doc, floor.id, doc.building.floors[0].corners.map((c) => c.id), 1, 2).document
    expect(moved.building.floors[0].fixtures![0].x).toBeCloseTo(6)
    expect(moved.building.floors[0].fixtures![0].z).toBeCloseTo(7)
    expect(removeFixture(moved, floor.id, id).document.building.floors[0].fixtures).toEqual([])
  })

  it('builds a model for every kind above its floor', () => {
    for (const spec of FIXTURES) {
      const parts = buildFixtureParts([{ id: 'f', kind: spec.id, x: 1, z: 1, dx: 0, dz: 1, y: spec.y }], 2)
      expect(parts.length).toBeGreaterThan(0)
      for (const part of parts) {
        part.geometry.computeBoundingBox()
        expect(part.geometry.boundingBox!.min.y).toBeGreaterThanOrEqual(2 - 1e-6)
        part.geometry.dispose()
      }
    }
  })
})

describe('fitting quantities', () => {
  it('counts fittings by kind under their trade', async () => {
    const { takeoff } = await import('../cost/quantities')
    let doc = room()
    const id = doc.building.floors[0].id
    doc = addFixture(doc, id, { kind: 'socket', x: 5, z: 5, dx: 1, dz: 0, y: 0.3 }).document
    doc = addFixture(doc, id, { kind: 'socket', x: 6, z: 5, dx: 1, dz: 0, y: 0.3 }).document
    doc = addFixture(doc, id, { kind: 'wc', x: 7, z: 5, dx: 1, dz: 0, y: 0 }).document
    const lines = takeoff(doc)
    expect(lines.find((line) => line.id === 'fixture:socket')).toMatchObject({ group: 'Electrical', quantity: 2 })
    expect(lines.find((line) => line.id === 'fixture:wc')).toMatchObject({ group: 'Plumbing', quantity: 1 })
  })
})

describe('fixture models', () => {
  it('carries a finish on every merged part', () => {
    for (const spec of FIXTURES) {
      const parts = buildFixtureParts([{ id: 'f', kind: spec.id, x: 1, z: 1, dx: 0, dz: 1, y: spec.y }], 0)
      expect(parts.length).toBeGreaterThan(0)
      for (const part of parts) {
        expect(part.roughness).toBeGreaterThan(0)
        expect(part.metalness).toBeGreaterThanOrEqual(0)
        expect(part.colour).toMatch(/^#/)
        part.geometry.dispose()
      }
    }
  })

  it('point plate faces outwards, whichever way the fixture faces', async () => {
    const { Vector3 } = await import('three')
    // Wall plates stay as box stacks; richer fittings mix lathes and cylinders and are checked by the floor bound above.
    const plates = ['socket', 'switch', 'stove-isolator']
    for (const id of plates) {
      const spec = FIXTURES.find((item) => item.id === id)!
      for (const [dx, dz] of [
        [1, 0],
        [0, 1],
        [-1, 0],
        [0, -1],
      ]) {
        for (const part of buildFixtureParts([{ id: 'f', kind: spec.id, x: 3, z: 2, dx, dz, y: spec.y }], 0)) {
          const pos = part.geometry.getAttribute('position')
          let inward = 0
          for (let i = 0; i < pos.count; i += 36) {
            const centre = new Vector3()
            for (let k = 0; k < 36 && i + k < pos.count; k++) centre.add(new Vector3().fromBufferAttribute(pos, i + k))
            centre.divideScalar(Math.min(36, pos.count - i))
            for (let t = i; t < i + 36 && t < pos.count; t += 3) {
              const a = new Vector3().fromBufferAttribute(pos, t)
              const b = new Vector3().fromBufferAttribute(pos, t + 1)
              const c = new Vector3().fromBufferAttribute(pos, t + 2)
              const n = new Vector3().subVectors(b, a).cross(new Vector3().subVectors(c, a))
              if (n.dot(a.clone().add(b).add(c).divideScalar(3).sub(centre)) < 0) inward += 1
            }
          }
          expect(inward, `${spec.id} facing ${dx},${dz}`).toBe(0)
          part.geometry.dispose()
        }
      }
    }
  })
})

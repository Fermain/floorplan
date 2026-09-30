import { describe, expect, it } from 'vitest'
import { fixtureDocument } from '../plot/fixture'
import { buildFenceParts, fenceFrame } from '../geometry/fence'
import { takeoff } from '../cost/quantities'
import { fencePosts, fenceSpec, FENCES } from './fences'
import { addWallRing, setFence } from './mutations'
import type { WallSkin } from './types'

function ring(skin: WallSkin) {
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
    skin,
  )
  expect(r.ok).toBe(true)
  return r.document
}

describe('fencePosts', () => {
  it('puts a post at each end and none further apart than the spacing', () => {
    const spec = fenceSpec('palisade')
    const posts = fencePosts(10, spec)
    expect(posts[0]).toBe(0)
    expect(posts[posts.length - 1]).toBeCloseTo(10)
    for (let i = 1; i < posts.length; i++) expect(posts[i] - posts[i - 1]).toBeLessThanOrEqual(spec.postSpacing + 1e-9)
    expect(posts).toHaveLength(Math.ceil(10 / spec.postSpacing) + 1)
  })
})

describe('setFence', () => {
  it('puts a fence on a logical wall and takes it off again', () => {
    const doc = ring('logical')
    const floor = doc.building.floors[0]
    const wall = floor.walls[0]
    const fenced = setFence(doc, floor.id, wall.id, { type: 'mesh', height: 1.2 })
    expect(fenced.ok).toBe(true)
    expect(fenced.document.building.floors[0].walls[0].fence).toEqual({ type: 'mesh', height: 1.2 })
    const cleared = setFence(fenced.document, floor.id, wall.id, null)
    expect(cleared.ok).toBe(true)
    expect('fence' in cleared.document.building.floors[0].walls[0]).toBe(false)
  })

  it('refuses built walls, unknown fences and silly heights', () => {
    const built = ring('double')
    const floor = built.building.floors[0]
    expect(setFence(built, floor.id, floor.walls[0].id, { type: 'mesh', height: 1.8 }).ok).toBe(false)
    const doc = ring('logical')
    const id = doc.building.floors[0].walls[0].id
    expect(setFence(doc, floor.id, id, { type: 'wattle' as never, height: 1.8 }).ok).toBe(false)
    expect(setFence(doc, floor.id, id, { type: 'mesh', height: 12 }).ok).toBe(false)
  })
})

describe('buildFenceParts', () => {
  it('builds every fence type up to its height on the ground it is given', () => {
    const doc = ring('logical')
    const floor = doc.building.floors[0]
    const frame = fenceFrame(floor, floor.walls[0])!
    expect(frame.length).toBeCloseTo(6)
    for (const spec of FENCES) {
      const parts = buildFenceParts(frame, { type: spec.id, height: 1.5 }, () => 2)
      expect(parts.length).toBeGreaterThan(0)
      for (const part of parts) {
        part.geometry.computeBoundingBox()
        const box = part.geometry.boundingBox!
        expect(box.min.y).toBeGreaterThanOrEqual(1.94)
        expect(box.max.y).toBeLessThanOrEqual(3.56)
        part.geometry.dispose()
      }
    }
  })
})

describe('fence takeoff', () => {
  it('prices fencing by face area and counts its posts', () => {
    let doc = ring('logical')
    const floor = doc.building.floors[0]
    for (const wall of floor.walls) doc = setFence(doc, floor.id, wall.id, { type: 'palisade', height: 2 }).document
    const line = takeoff(doc).find((item) => item.id === 'fence:palisade')!
    expect(line.group).toBe('Fencing')
    expect(line.quantity).toBeCloseTo(20 * 2 * 1.05, 1)
    expect(line.note).toContain('20 m')
    expect(takeoff(ring('logical')).some((item) => item.group === 'Fencing')).toBe(false)
  })
})

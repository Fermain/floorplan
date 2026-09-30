import { describe, expect, it } from 'vitest'
import { fixtureDocument } from '../plot/fixture'
import { roofFacesForFloor } from '../geometry/roof'
import { isUnlandedWall } from '../geometry/support'
import { addStorey, addWallRing, removeWall, setRoof } from './mutations'
import type { Document, WallSkin } from './types'

const SQUARE = [
  { x: 4, z: 4 },
  { x: 10, z: 4 },
  { x: 10, z: 10 },
  { x: 4, z: 10 },
]
const NORTH_HALF = [
  { x: 4, z: 4 },
  { x: 10, z: 4 },
  { x: 10, z: 7 },
  { x: 4, z: 7 },
]
const SOUTH_HALF = [
  { x: 4, z: 7 },
  { x: 10, z: 7 },
  { x: 10, z: 10 },
  { x: 4, z: 10 },
]

function storey(doc: Document, index: number) {
  return doc.building.floors.find((floor) => floor.index === index)!
}

function wall(doc: Document, index: number, points: { x: number; z: number }[], skin: WallSkin = 'double') {
  const result = addWallRing(doc, storey(doc, index).id, points, skin)
  expect(result.ok).toBe(true)
  return result.document
}

function house(): Document {
  let d = wall(fixtureDocument(), 0, SQUARE)
  d = addStorey(d, storey(d, 0).id, storey(d, 0).corners[0].id).document
  return d
}

function southOf(doc: Document, index: number, z: number): Document {
  let d = doc
  const floor = storey(d, index)
  for (const item of floor.walls) {
    const a = floor.corners.find((corner) => corner.id === item.startCornerId)!
    const b = floor.corners.find((corner) => corner.id === item.endCornerId)!
    if ((a.z + b.z) / 2 > z + 1e-6) d = removeWall(d, floor.id, item.id).document
  }
  return d
}

function zRange(doc: Document) {
  const floor = storey(doc, 2)
  const faces = roofFacesForFloor(floor, { pitchDeg: 30, eaves: 0.5 })
  const zs = faces.flat().map((point) => point.z)
  return { min: Math.min(...zs), max: Math.max(...zs) }
}

describe('upper storey footprint', () => {
  it('follows the rooms walled below, even when they are walled after the storey is added', () => {
    let d = house()
    d = wall(d, 1, NORTH_HALF)
    d = addStorey(d, storey(d, 1).id).document
    const early = storey(d, 2).outline

    let late = wall(house(), 1, SQUARE, 'logical')
    late = addStorey(late, storey(late, 1).id).document
    expect(late.building.floors.length).toBe(d.building.floors.length)
    late = wall(late, 1, NORTH_HALF)
    late = southOf(late, 1, 7)
    expect(storey(late, 2).outline).toEqual(early)
    expect(zRange(late).max).toBeLessThan(7 + 1)
  })

  it('lets a roof stand on logical walls but not on open floor', () => {
    let d = house()
    d = wall(d, 1, NORTH_HALF)
    d = addStorey(d, storey(d, 1).id).document
    const walledOnly = zRange(d)
    d = wall(d, 1, SOUTH_HALF, 'logical')
    const withLogical = zRange(d)
    expect(withLogical.max).toBeGreaterThan(walledOnly.max + 2)
  })

  it('takes no storey or roof on a floor with nothing enclosed', () => {
    let d = house()
    expect(addStorey(d, storey(d, 1).id).ok).toBe(false)
    d = wall(d, 1, NORTH_HALF)
    d = addStorey(d, storey(d, 1).id).document
    const bare = { pitchDeg: 30, eaves: 0.5 }
    expect(setRoof(d, storey(d, 2).id, bare).ok).toBe(true)
    const open = southOf(d, 1, 3)
    expect(storey(open, 2).outline).toEqual([])
    expect(setRoof(open, storey(open, 2).id, bare).ok).toBe(false)
  })

  it('counts a logical wall below as support, open floor as none', () => {
    let d = wall(house(), 1, NORTH_HALF, 'logical')
    d = addStorey(d, storey(d, 1).id).document
    d = wall(d, 2, NORTH_HALF)
    const upper = storey(d, 2)
    expect(upper.walls.every((item) => !isUnlandedWall(d, upper, item))).toBe(true)
    let floating = house()
    floating = wall(floating, 1, SQUARE)
    floating = addStorey(floating, storey(floating, 1).id).document
    floating = wall(floating, 2, [
      { x: 5, z: 5 },
      { x: 8, z: 5 },
      { x: 8, z: 8 },
      { x: 5, z: 8 },
    ])
    const top = storey(floating, 2)
    expect(top.walls.some((item) => isUnlandedWall(floating, top, item))).toBe(true)
  })
})

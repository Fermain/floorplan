import { describe, expect, it } from 'vitest'
import { Group, Mesh } from 'three'
import { cut, isCutAway, NO_CUT_HEIGHT } from './cutaway'

describe('review cutaway', () => {
  it('cuts what is inside the cone ahead of the camera, and nothing beyond it or behind', () => {
    cut.origin.value.set(0, 0, 0)
    cut.direction.value.set(0, 0, -1)
    cut.length.value = 8
    cut.nearRadius.value = 0.4
    cut.farRadius.value = 3
    const mesh = new Mesh()
    expect(isCutAway({ x: 0, y: 0, z: -4 }, mesh)).toBe(true)
    // The cone widens: 1.5 m off the axis is inside at 7 m, outside at 1 m.
    expect(isCutAway({ x: 1.5, y: 0, z: -7 }, mesh)).toBe(true)
    expect(isCutAway({ x: 1.5, y: 0, z: -1 }, mesh)).toBe(false)
    expect(isCutAway({ x: 0, y: 0, z: -9 }, mesh)).toBe(false)
    expect(isCutAway({ x: 0, y: 0, z: 2 }, mesh)).toBe(false)
    cut.length.value = 0
    expect(isCutAway({ x: 0, y: 0, z: -4 }, mesh)).toBe(false)
  })

  it('cuts a mesh above the height set on it or on a group it is in', () => {
    cut.length.value = 0
    const group = new Group()
    const mesh = new Mesh()
    group.add(mesh)
    expect(isCutAway({ x: 0, y: 50, z: 0 }, mesh)).toBe(false)
    group.userData.cutAbove = 2
    expect(isCutAway({ x: 0, y: 2.5, z: 0 }, mesh)).toBe(true)
    expect(isCutAway({ x: 0, y: 1.5, z: 0 }, mesh)).toBe(false)
    group.userData.cutAbove = NO_CUT_HEIGHT
    expect(isCutAway({ x: 0, y: 2.5, z: 0 }, mesh)).toBe(false)
  })
})

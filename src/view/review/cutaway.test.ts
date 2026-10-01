import { describe, expect, it } from 'vitest'
import { Group, Mesh } from 'three'
import { Vector3 } from 'three'
import { aimCut, cut, isCutAway, NO_CUT_HEIGHT } from './cutaway'

describe('review cutaway', () => {
  it('cuts what is inside the cone ahead of the camera, and nothing beyond it or behind', () => {
    cut.origin.value.set(0, 0, 0)
    cut.direction.value.set(0, 0, -1)
    cut.length.value = 8
    cut.shape.value = 0
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

describe('review box cutaway', () => {
  it('cuts a box with upright sides that leans along the view', () => {
    // Looking down at 45° to the north from 10 m up.
    aimCut(new Vector3(0, 10, 0), new Vector3(0, -1, 1))
    cut.shape.value = 1
    cut.length.value = 8
    cut.halfWidth.value = 2
    cut.below.value = 1
    cut.above.value = 3
    const mesh = new Mesh()
    // On the line of sight, 4 m along it: cut.
    const on = new Vector3(0, 10 - 4 / Math.SQRT2, 4 / Math.SQRT2)
    expect(isCutAway(on, mesh)).toBe(true)
    // Straight above or below that point by less than the box's reach: cut; further below: not.
    expect(isCutAway(on.clone().add(new Vector3(0, 2.5, 0)), mesh)).toBe(true)
    expect(isCutAway(on.clone().add(new Vector3(0, -0.8, 0)), mesh)).toBe(true)
    expect(isCutAway(on.clone().add(new Vector3(0, -1.5, 0)), mesh)).toBe(false)
    // Off to the side: inside the half-width, cut; beyond it, not. The sides are upright, so height does not matter.
    expect(isCutAway(on.clone().add(new Vector3(1.9, 1, 0)), mesh)).toBe(true)
    expect(isCutAway(on.clone().add(new Vector3(2.1, 0, 0)), mesh)).toBe(false)
    // Beyond the box's length along the view: whole.
    const far = new Vector3(0, 10 - 9 / Math.SQRT2, 9 / Math.SQRT2)
    expect(isCutAway(far, mesh)).toBe(false)
  })

  it('still finds a frame looking straight down', () => {
    aimCut(new Vector3(0, 20, 0), new Vector3(0, -1, 0))
    cut.shape.value = 1
    cut.length.value = 8
    const below = new Vector3(0, 15, 0)
    expect(isCutAway(below, new Mesh())).toBe(true)
    expect(cut.frame.value.elements.every(Number.isFinite)).toBe(true)
  })
})

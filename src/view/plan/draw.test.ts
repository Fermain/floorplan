import { describe, expect, it } from 'vitest'
import { fixtureDocument } from '../../lib/plot/fixture'
import type { Floor } from '../../lib/model/types'
import { lengthReadout, resolveWallEnd } from './draw'
import { previewFloor, snapTurn } from './gesture'
import { storeyAddTarget } from './storey'

function floor(): Floor {
  return {
    id: 'f',
    index: 0,
    datumHeight: 0,
    corners: [
      { id: 'a', x: 4, z: 4 },
      { id: 'b', x: 6, z: 4 },
    ],
    walls: [{ id: 'w', startCornerId: 'a', endCornerId: 'b', skin: 'double', openings: [] }],
    roomFinishes: {},
  }
}

describe('resolveWallEnd', () => {
  const plot = fixtureDocument().plot

  it('lands on a nearby corner before the module', () => {
    const end = resolveWallEnd(plot, floor(), [], { x: 4, z: 4 }, 'a', 6.1, 4.05, null)
    expect(end.cornerId).toBe('b')
    expect(end.x).toBe(6)
    expect(end.z).toBe(4)
  })

  it('snaps a free end to the block module', () => {
    const end = resolveWallEnd(plot, floor(), [], { x: 4, z: 8 }, undefined, 6.34, 8, null)
    expect(end.cornerId).toBeUndefined()
    expect(end.x).toBeCloseTo(6.32, 5)
    expect(end.z).toBeCloseTo(8, 5)
  })
})

describe('lengthReadout', () => {
  it('labels the midpoint in metres', () => {
    const label = lengthReadout(0, 0, 3, 0, 3)
    expect(label?.text).toBe('3.00 m')
    expect(label?.x).toBeCloseTo(1.5, 5)
  })
})

describe('snapTurn', () => {
  it('locks a near-right angle', () => {
    const turned = snapTurn((88 * Math.PI) / 180)
    expect(turned.snapped).toBe(true)
    expect(turned.angle).toBeCloseTo(Math.PI / 2, 5)
  })
})

describe('previewFloor', () => {
  it('shifts the dragged corners only', () => {
    const shown = previewFloor(floor(), null, { cornerIds: ['b'], dx: 1, dz: 0 })
    expect(shown.corners.find((corner) => corner.id === 'a')).toMatchObject({ x: 4, z: 4 })
    expect(shown.corners.find((corner) => corner.id === 'b')).toMatchObject({ x: 7, z: 4 })
  })
})

describe('storeyAddTarget', () => {
  it('uses the selected wall start when no corner is selected', () => {
    const target = storeyAddTarget([floor()], null, 'w', null)
    expect(target).toEqual({ floorId: 'f', cornerId: 'a' })
  })
})

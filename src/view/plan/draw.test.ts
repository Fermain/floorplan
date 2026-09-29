import { describe, expect, it } from 'vitest'
import { fixtureDocument } from '../../lib/plot/fixture'
import type { Floor } from '../../lib/model/types'
import { lengthReadout, resolveRectangle, resolveWallEnd } from './draw'
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

describe('resolveRectangle', () => {
  const plot = fixtureDocument().plot

  it('snaps each side to the block module', () => {
    const rect = resolveRectangle(plot, floor(), [], { x: 4, z: 8 }, undefined, 6.34, 12.66, null)
    expect(rect?.width).toBeCloseTo(2.32, 5)
    expect(rect?.depth).toBeCloseTo(4.64, 5)
    expect(rect?.corners[2]).toEqual({ x: 6.32, z: 12.64 })
    expect(rect?.allowed).toBe(true)
  })

  it('uses a nearby corner as the opposite corner', () => {
    const rect = resolveRectangle(plot, floor(), [], { x: 4, z: 8 }, undefined, 6.08, 4.08, null)
    expect(rect?.cornerIds[2]).toBe('b')
    expect(rect?.corners[2]).toEqual({ x: 6, z: 4 })
    expect(rect?.width).toBeCloseTo(2, 5)
    expect(rect?.depth).toBeCloseTo(4, 5)
  })

  it('lines a side up with another corner', () => {
    const rect = resolveRectangle(plot, floor(), [{ x: 6.5, z: 8 }], { x: 4, z: 8 }, undefined, 6.4, 11, null)
    expect(rect?.width).toBeCloseTo(2.5, 5)
    expect(rect?.snap).toBe('align')
  })

  it('refuses a rectangle that leaves the plot', () => {
    const rect = resolveRectangle(plot, floor(), [], { x: 1, z: 2 }, undefined, -4, 8, null)
    expect(rect?.allowed).toBe(false)
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

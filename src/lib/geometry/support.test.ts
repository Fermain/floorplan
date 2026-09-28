import { describe, expect, it } from 'vitest'
import { fixtureHeightfield, fixturePlot } from '../plot/fixture'
import type { Document, Floor, Wall } from '../model/types'
import { isUnlandedWall, wallLandsOnBelow } from './support'

function wall(overrides: Partial<Wall> & Pick<Wall, 'startCornerId' | 'endCornerId'>): Wall {
  return {
    id: 'w1',
    skin: 'double',
    openings: [],
    ...overrides,
  }
}

function doc(floors: Floor[]): Document {
  return {
    plot: fixturePlot(),
    heightfield: fixtureHeightfield(),
    building: { floors },
  }
}

describe('wallLandsOnBelow', () => {
  it('lands when an upper wall sits on a wall below', () => {
    const ground: Floor = {
      id: 'f0',
      index: 0,
      datumHeight: 0,
      corners: [
        { id: 'a', x: 0, z: 0, unitId: 'u1' },
        { id: 'b', x: 4, z: 0, unitId: 'u1' },
      ],
      walls: [wall({ id: 'w0', startCornerId: 'a', endCornerId: 'b' })],
      roomFinishes: {},
    }
    const upper: Floor = {
      id: 'f1',
      index: 1,
      datumHeight: 2.8,
      unitId: 'u1',
      corners: [
        { id: 'a1', x: 0, z: 0 },
        { id: 'b1', x: 4, z: 0 },
      ],
      walls: [wall({ id: 'w1', startCornerId: 'a1', endCornerId: 'b1' })],
      roomFinishes: {},
    }
    const document = doc([ground, upper])
    expect(wallLandsOnBelow(document, upper, upper.walls[0])).toBe(true)
    expect(isUnlandedWall(document, upper, upper.walls[0])).toBe(false)
  })

  it('does not land when shifted sideways beyond tolerance', () => {
    const ground: Floor = {
      id: 'f0',
      index: 0,
      datumHeight: 0,
      corners: [
        { id: 'a', x: 0, z: 0, unitId: 'u1' },
        { id: 'b', x: 4, z: 0, unitId: 'u1' },
      ],
      walls: [wall({ id: 'w0', startCornerId: 'a', endCornerId: 'b' })],
      roomFinishes: {},
    }
    const upper: Floor = {
      id: 'f1',
      index: 1,
      datumHeight: 2.8,
      unitId: 'u1',
      corners: [
        { id: 'a1', x: 0, z: 0.2 },
        { id: 'b1', x: 4, z: 0.2 },
      ],
      walls: [wall({ id: 'w1', startCornerId: 'a1', endCornerId: 'b1' })],
      roomFinishes: {},
    }
    const document = doc([ground, upper])
    expect(wallLandsOnBelow(document, upper, upper.walls[0])).toBe(false)
    expect(isUnlandedWall(document, upper, upper.walls[0])).toBe(true)
  })

  it('does not report a ground-floor wall as unlanded', () => {
    const ground: Floor = {
      id: 'f0',
      index: 0,
      datumHeight: 0,
      corners: [
        { id: 'a', x: 0, z: 0 },
        { id: 'b', x: 4, z: 0 },
      ],
      walls: [wall({ id: 'w0', startCornerId: 'a', endCornerId: 'b' })],
      roomFinishes: {},
    }
    const document = doc([ground])
    expect(wallLandsOnBelow(document, ground, ground.walls[0])).toBe(true)
    expect(isUnlandedWall(document, ground, ground.walls[0])).toBe(false)
  })
})

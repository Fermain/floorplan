import { describe, expect, it } from 'vitest'
import type { Floor } from '../model/types'
import { BLOCK_THICKNESS, CAVITY } from '../plot/fixture'
import { hipRoofFaces, roofFacesForFloor, roofPlan } from './roof'

describe('hipRoofFaces', () => {
  it('raises a rectangle to a ridge at half the short side', () => {
    const faces = hipRoofFaces(
      [
        { x: 0, z: 0 },
        { x: 10, z: 0 },
        { x: 10, z: 6 },
        { x: 0, z: 6 },
      ],
      30,
      2,
    )
    expect(faces).toHaveLength(4)
    const heights = faces.flatMap((face) => face.map((vertex) => vertex.y))
    const rise = 3 * Math.tan((30 * Math.PI) / 180)
    expect(Math.min(...heights)).toBeCloseTo(2, 4)
    expect(Math.max(...heights)).toBeCloseTo(2 + rise, 4)
  })

  it('cuts a valley where two wings meet', () => {
    const faces = hipRoofFaces(
      [
        { x: 0, z: 0 },
        { x: 8, z: 0 },
        { x: 8, z: 4 },
        { x: 4, z: 4 },
        { x: 4, z: 8 },
        { x: 0, z: 8 },
      ],
      30,
      0,
    )
    expect(faces.length).toBeGreaterThan(4)
    const heights = faces.flatMap((face) => face.map((vertex) => vertex.y))
    expect(Math.min(...heights)).toBeCloseTo(0, 4)
    expect(Math.max(...heights)).toBeGreaterThan(0.5)
  })
})

describe('roofFacesForFloor', () => {
  it('meets the wall head at the outer face and drops only past it', () => {
    const floor: Floor = {
      id: 'f',
      index: 1,
      datumHeight: 2.8,
      corners: [],
      walls: [],
      roomFinishes: {},
      outline: [
        [
          { x: 0, z: 0 },
          { x: 10, z: 0 },
          { x: 10, z: 6 },
          { x: 0, z: 6 },
        ],
      ],
    }
    const eaves = 0.3
    const faces = roofFacesForFloor(floor, { pitchDeg: 30, eaves })
    expect(faces).toHaveLength(4)
    const rise = Math.tan((30 * Math.PI) / 180)
    const outer = CAVITY / 2 + BLOCK_THICKNESS
    const heights = faces.flatMap((face) => face.map((vertex) => vertex.y))
    expect(Math.min(...heights)).toBeCloseTo(-eaves * rise, 3)
    expect(Math.max(...heights)).toBeCloseTo((3 + outer) * rise, 3)
    expect(Math.min(...heights)).toBeLessThan(0)
    expect(Math.max(...heights)).toBeGreaterThan(0)
  })

  it('draws eaves outside the plate and hips inside it', () => {
    const floor: Floor = {
      id: 'f',
      index: 1,
      datumHeight: 2.8,
      corners: [],
      walls: [],
      roomFinishes: {},
      outline: [
        [
          { x: 0, z: 0 },
          { x: 10, z: 0 },
          { x: 10, z: 6 },
          { x: 0, z: 6 },
        ],
      ],
    }
    const eaves = 0.3
    const outer = CAVITY / 2 + BLOCK_THICKNESS
    const plan = roofPlan(floor, { pitchDeg: 30, eaves })
    expect(plan.footprints).toHaveLength(1)
    const xs = plan.footprints[0].outer.map((point) => point.x)
    const zs = plan.footprints[0].outer.map((point) => point.z)
    expect(Math.min(...xs)).toBeCloseTo(-(outer + eaves), 3)
    expect(Math.max(...xs)).toBeCloseTo(10 + outer + eaves, 3)
    expect(Math.min(...zs)).toBeCloseTo(-(outer + eaves), 3)
    expect(Math.max(...zs)).toBeCloseTo(6 + outer + eaves, 3)
    expect(plan.hips.length).toBeGreaterThanOrEqual(4)
    expect(
      plan.hips.some(
        (hip) =>
          (hip.a.x > 0 && hip.a.x < 10 && hip.a.z > 0 && hip.a.z < 6) ||
          (hip.b.x > 0 && hip.b.x < 10 && hip.b.z > 0 && hip.b.z < 6),
      ),
    ).toBe(true)
  })
})

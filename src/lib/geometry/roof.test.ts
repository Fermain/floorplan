import { describe, expect, it } from 'vitest'
import type { Floor } from '../model/types'
import { BLOCK_THICKNESS, CAVITY } from '../plot/fixture'
import { hipRoofFaces, roofFacesForFloor, roofInfills, roofPlan } from './roof'

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

describe('gable and mono-pitch roofs', () => {
  const plate: Floor = {
    id: 'roofed',
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
  const below: Floor = {
    id: 'below',
    index: 0,
    datumHeight: 0,
    corners: [
      { id: 'a', x: 0, z: 0 },
      { id: 'b', x: 10, z: 0 },
      { id: 'c', x: 10, z: 6 },
      { id: 'd', x: 0, z: 6 },
    ],
    walls: [
      { id: 'ab', startCornerId: 'a', endCornerId: 'b', skin: 'double', openings: [] },
      { id: 'bc', startCornerId: 'b', endCornerId: 'c', skin: 'double', openings: [] },
      { id: 'cd', startCornerId: 'c', endCornerId: 'd', skin: 'double', openings: [] },
      { id: 'da', startCornerId: 'd', endCornerId: 'a', skin: 'double', openings: [] },
    ],
    roomFinishes: {},
  }
  const pitch = 30
  const tan = Math.tan((pitch * Math.PI) / 180)
  const reach = CAVITY / 2 + BLOCK_THICKNESS

  function slopeArea(faces: ReturnType<typeof roofFacesForFloor>): number {
    let total = 0
    for (const face of faces) {
      let x = 0
      let y = 0
      let z = 0
      for (let i = 1; i < face.length - 1; i++) {
        const a = face[0]
        const b = face[i]
        const c = face[i + 1]
        const u = [b.x - a.x, b.y - a.y, b.z - a.z]
        const v = [c.x - a.x, c.y - a.y, c.z - a.z]
        x += u[1] * v[2] - u[2] * v[1]
        y += u[2] * v[0] - u[0] * v[2]
        z += u[0] * v[1] - u[1] * v[0]
      }
      total += Math.hypot(x, y, z) / 2
    }
    return total
  }

  it('runs a gable ridge along the long side, at half the span', () => {
    const roof = { pitchDeg: pitch, eaves: 0.3, form: 'gable' as const }
    const faces = roofFacesForFloor(plate, roof, reach)
    expect(faces).toHaveLength(2)
    const span = 6 + 2 * (reach + 0.3)
    const long = 10 + 2 * (reach + 0.3)
    const top = Math.max(...faces.flatMap((face) => face.map((v) => v.y)))
    expect(top).toBeCloseTo((span / 2) * tan - 0.3 * tan, 6)
    expect(slopeArea(faces)).toBeCloseTo((span * long) / Math.cos((pitch * Math.PI) / 180), 4)
    const { hips } = roofPlan(plate, roof, reach)
    expect(hips).toHaveLength(1)
    expect(Math.abs(hips[0].a.x - hips[0].b.x)).toBeCloseTo(long, 6)
  })

  it('turns the ridge across the building', () => {
    const faces = roofFacesForFloor(plate, { pitchDeg: pitch, eaves: 0.3, form: 'gable', turns: 1 }, reach)
    const top = Math.max(...faces.flatMap((face) => face.map((v) => v.y)))
    const span = 10 + 2 * (reach + 0.3)
    expect(top).toBeCloseTo((span / 2) * tan - 0.3 * tan, 6)
  })

  it('lays a mono-pitch as one plane across the short span', () => {
    const faces = roofFacesForFloor(plate, { pitchDeg: pitch, eaves: 0.3, form: 'mono' }, reach)
    expect(faces).toHaveLength(1)
    const heights = faces[0].map((v) => v.y)
    const span = 6 + 2 * (reach + 0.3)
    expect(Math.max(...heights) - Math.min(...heights)).toBeCloseTo(span * tan, 6)
  })

  it('builds the gable ends up to the roof, and nothing under a hip', () => {
    const gables = roofInfills(below, plate, { pitchDeg: pitch, eaves: 0.3, form: 'gable' }, reach)
    expect(gables.map((infill) => infill.wall.id).sort()).toEqual(['bc', 'da'])
    const rise = (6 / 2 + reach) * tan
    expect(Math.max(...gables[0].outer.map((v) => v.y))).toBeCloseTo(rise, 6)
    expect(gables[0].area).toBeCloseTo(6 * reach * tan + 0.5 * 6 * 3 * tan, 6)
    expect(roofInfills(below, plate, { pitchDeg: pitch, eaves: 0.3 }, reach)).toEqual([])
  })

  it('raises the high wall and the two sides of a mono-pitch', () => {
    const infills = roofInfills(below, plate, { pitchDeg: pitch, eaves: 0.3, form: 'mono' }, reach)
    expect(infills.map((infill) => infill.wall.id).sort()).toEqual(['bc', 'cd', 'da'])
  })
})

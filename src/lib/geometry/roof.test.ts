import { describe, expect, it } from 'vitest'
import type { Floor } from '../model/types'
import { BLOCK_THICKNESS, CAVITY } from '../plot/fixture'
import { buildRoofMeshes, hipRoofFaces, roofFacesForFloor, roofInfills, roofPlan } from './roof'
import { coveringOf } from './coverings'

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

  it('builds the gable ends up to the roof in courses, and nothing under a hip', () => {
    const roof = { pitchDeg: pitch, eaves: 0.3, form: 'gable' as const }
    const gables = roofInfills(below, plate, roof, reach)
    expect(gables.map((infill) => infill.wall.id).sort()).toEqual(['bc', 'da'])
    const [end] = gables
    const apex = (6 / 2) * tan
    const top = Math.max(...end.blocks.flatMap((block) => block.poly.map((p) => p.y)))
    expect(top).toBeCloseTo(apex, 6)
    expect(end.area).toBeCloseTo(0.5 * 6 * 3 * tan, 1)
    expect(roofInfills(below, plate, { pitchDeg: pitch, eaves: 0.3 }, reach)).toEqual([])
  })

  it('keeps every gable unit under the roof', () => {
    const gables = roofInfills(below, plate, { pitchDeg: pitch, eaves: 0.3, form: 'gable' }, reach)
    const half = 3 + reach + 0.3
    const roofAt = (z: number) => (half - Math.abs(z - 3)) * tan - 0.3 * tan
    for (const infill of gables) {
      const toZ = infill.wall.id === 'bc' ? (u: number) => u : (u: number) => 6 - u
      for (const block of infill.blocks) {
        for (const p of [...block.poly, ...block.face]) {
          expect(p.y).toBeLessThanOrEqual(roofAt(toZ(p.u)) - reach * tan + 1e-9)
        }
      }
    }
  })

  it('lays the covering a structure depth above the roof it bears on', () => {
    const roof = { pitchDeg: pitch, eaves: 0.3, form: 'gable' as const, covering: 'clay-tile' as const }
    const { top, under, edges } = buildRoofMeshes(plate, roof, reach)
    const lift = coveringOf(roof).depth / Math.cos((pitch * Math.PI) / 180)
    const ys = (g: typeof top) => Array.from({ length: g!.getAttribute('position').count }, (_, i) => g!.getAttribute('position').getY(i))
    expect(Math.max(...ys(top))).toBeCloseTo(Math.max(...ys(under)) + lift, 6)
    expect(Math.min(...ys(top))).toBeCloseTo(Math.min(...ys(under)) + lift, 6)
    expect(top!.getAttribute('uv').count).toBe(top!.getAttribute('position').count)
    expect(edges!.getAttribute('position').count).toBe(6 * 6)
  })

  it('lays the gable in the units and bond of the wall below', () => {
    const blockBelow: Floor = {
      ...below,
      walls: below.walls.map((wall) => ({ ...wall, skin: 'single' as const, systemId: 'block-140' as const })),
    }
    const [end] = roofInfills(blockBelow, plate, { pitchDeg: pitch, eaves: 0.3, form: 'gable' }, 0.07)
    for (const block of end.blocks) {
      const us = block.poly.map((p) => p.u)
      expect(Math.max(...us) - Math.min(...us)).toBeLessThanOrEqual(0.4 + 1e-9)
      const ys = block.poly.map((p) => p.y)
      expect(Math.max(...ys) - Math.min(...ys)).toBeLessThanOrEqual(0.2 + 1e-9)
    }
    const starts = (course: number) =>
      end.blocks
        .filter((block) => block.course === course)
        .map((block) => Math.min(...block.poly.map((p) => p.u)))
        .sort((a, b) => a - b)
    const courses = [...new Set(end.blocks.map((block) => block.course))].sort((a, b) => a - b)
    expect(courses.length).toBeGreaterThan(3)
    const even = starts(courses[0]).map((u) => Math.round(((u % 0.4) + 0.4) % 0.4 * 1000))
    const odd = starts(courses[1]).map((u) => Math.round(((u % 0.4) + 0.4) % 0.4 * 1000))
    expect(new Set(even.slice(1))).not.toEqual(new Set(odd.slice(1)))
  })

  it('raises the high wall and the two sides of a mono-pitch', () => {
    const infills = roofInfills(below, plate, { pitchDeg: pitch, eaves: 0.3, form: 'mono' }, reach)
    expect(infills.map((infill) => infill.wall.id).sort()).toEqual(['bc', 'cd', 'da'])
  })
})

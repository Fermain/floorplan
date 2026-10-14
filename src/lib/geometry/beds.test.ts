import { describe, expect, it } from 'vitest'
import {
  BED_MATERIALS,
  bedArea,
  bedMaterialSpec,
  bedPerimeter,
  bedProblem,
  bedSoilVolume,
  DEFAULT_RAISED_HEIGHT,
  IN_GROUND_DEPTH_M,
} from '../model/beds'
import { addBed, removeBed, updateBed } from '../model/mutations'
import type { BedMaterial, Document } from '../model/types'
import { bedAt, buildBedParts, BED_SOIL_COLOUR } from './beds'
import { pavingSnapTargets } from './paving'
import { takeoff } from '../cost/quantities'

function emptyDoc(): Document {
  return {
    plot: {
      ring: [
        [0, 0],
        [30, 0],
        [30, 30],
        [0, 30],
      ],
      northBearingDeg: 0,
      latitude: -29.85,
      longitude: 31.02,
    },
    heightfield: {
      originX: 0,
      originZ: 0,
      cellSize: 5,
      cols: 7,
      rows: 7,
      heights: Array(49).fill(10),
    },
    building: {
      floors: [
        {
          id: 'ground',
          index: 0,
          datumHeight: 10,
          corners: [],
          walls: [],
          roomFinishes: {},
        },
      ],
    },
  }
}

describe('beds model & calculations', () => {
  it('calculates polygon area and perimeter accurately', () => {
    // 4 m × 2 m rectangle
    const ring: [number, number][] = [
      [2, 2],
      [6, 2],
      [6, 4],
      [2, 4],
    ]
    expect(bedArea(ring)).toBeCloseTo(8, 4)
    expect(bedPerimeter(ring)).toBeCloseTo(12, 4)
  })

  it('calculates soil volume for in-ground and raised beds', () => {
    const ring: [number, number][] = [
      [0, 0],
      [4, 0],
      [4, 2],
      [0, 2],
    ] // 8 m² area, 12 m perimeter
    // In-ground bed
    const inGround = { ring, height: 0 }
    expect(bedSoilVolume(inGround)).toBeCloseTo(8 * IN_GROUND_DEPTH_M, 4)

    // Raised bed with timber (0.1 m wall thickness) and 0.4 m height
    const raised = { ring, height: 0.4, material: 'timber' as const }
    const timberSpec = bedMaterialSpec('timber')
    expect(timberSpec.thickness).toBe(0.1)
    const expectedInnerArea = Math.max(0.1 * 8, 8 - 12 * 0.1) // 8 - 1.2 = 6.8 m²
    const expectedSoilDepth = 0.4 - 0.03 // 0.37 m
    expect(bedSoilVolume(raised)).toBeCloseTo(expectedInnerArea * expectedSoilDepth, 3)
  })

  it('validates beds with bedProblem', () => {
    const doc = emptyDoc()
    const valid: [number, number][] = [
      [2, 2],
      [5, 2],
      [5, 4],
      [2, 4],
    ]
    expect(bedProblem(doc, { ring: valid, height: 0.3, material: 'timber' })).toBeNull()

    // Fewer than 3 points
    expect(bedProblem(doc, { ring: [[2, 2], [5, 2]], height: 0 })).toBe('a garden bed needs at least three corners')

    // Too small area
    expect(bedProblem(doc, { ring: [[2, 2], [2.1, 2], [2.1, 2.1]], height: 0 })).toBe('garden bed is too small')

    // Outside plot
    expect(bedProblem(doc, { ring: [[-5, 2], [5, 2], [5, 4]], height: 0 })).toBe('garden bed outside the plot')

    // Height out of bounds
    expect(bedProblem(doc, { ring: valid, height: -0.1 })).toContain('height must be between')
    expect(bedProblem(doc, { ring: valid, height: 2.0 })).toContain('height must be between')

    // Unknown material
    expect(bedProblem(doc, { ring: valid, height: 0.3, material: 'gold' as unknown as BedMaterial })).toBe('unknown bed material')
  })
})

describe('beds mutations', () => {
  it('adds, updates and removes garden beds', () => {
    let doc = emptyDoc()
    const ring: [number, number][] = [
      [2, 2],
      [6, 2],
      [6, 4],
      [2, 4],
    ]

    const added = addBed(doc, ring, DEFAULT_RAISED_HEIGHT, 'brick')
    expect(added.ok).toBe(true)
    doc = added.document
    expect(doc.beds).toHaveLength(1)
    const bed = doc.beds![0]
    expect(bed.height).toBe(DEFAULT_RAISED_HEIGHT)
    expect(bed.material).toBe('brick')

    // Update height and material
    const updated = updateBed(doc, bed.id, { height: 0.5, material: 'stone' })
    expect(updated.ok).toBe(true)
    doc = updated.document
    expect(doc.beds![0].height).toBe(0.5)
    expect(doc.beds![0].material).toBe('stone')

    // Remove bed
    const removed = removeBed(doc, bed.id)
    expect(removed.ok).toBe(true)
    expect(removed.document.beds).toBeUndefined()
  })
})

describe('beds geometry & 3D rendering', () => {
  it('builds triangulated soil mesh for in-ground beds', () => {
    let doc = emptyDoc()
    const ring: [number, number][] = [
      [2, 2],
      [6, 2],
      [6, 4],
      [2, 4],
    ]
    doc = addBed(doc, ring, 0).document

    const groundAt = () => 10
    const parts = buildBedParts(doc, groundAt)
    expect(parts.length).toBeGreaterThanOrEqual(1)
    const soilPart = parts.find((p) => p.colour === BED_SOIL_COLOUR)
    expect(soilPart).toBeDefined()
    const pos = soilPart!.geometry.getAttribute('position')
    expect(pos.count).toBeGreaterThan(0)
    // Vertices sit at 10 + 0.035
    for (let i = 0; i < pos.count; i++) {
      expect(pos.getY(i)).toBeCloseTo(10.035, 3)
    }
  })

  it('builds retaining wall and elevated soil meshes for raised beds of different materials', () => {
    const materials = BED_MATERIALS.map((m) => m.id)
    for (const mat of materials) {
      let doc = emptyDoc()
      const ring: [number, number][] = [
        [2, 2],
        [6, 2],
        [6, 4],
        [2, 4],
      ]
      doc = addBed(doc, ring, 0.4, mat).document

      const groundAt = () => 10
      const parts = buildBedParts(doc, groundAt)
      const spec = bedMaterialSpec(mat)
      const wallPart = parts.find((p) => p.colour === spec.colour)
      const soilPart = parts.find((p) => p.colour === BED_SOIL_COLOUR)

      expect(wallPart).toBeDefined()
      expect(soilPart).toBeDefined()

      // Wall reaches up to ground (10) + height (0.4) = 10.4
      const wallPos = wallPart!.geometry.getAttribute('position')
      let maxY = -Infinity
      for (let i = 0; i < wallPos.count; i++) {
        maxY = Math.max(maxY, wallPos.getY(i))
      }
      expect(maxY).toBeCloseTo(10.4, 2)

      // Soil sits at topY - 0.03 = 10.37
      const soilPos = soilPart!.geometry.getAttribute('position')
      for (let i = 0; i < soilPos.count; i++) {
        expect(soilPos.getY(i)).toBeCloseTo(10.37, 2)
      }
    }
  })

  it('detects bedAt for point-in-bed hit tests', () => {
    let doc = emptyDoc()
    const ring: [number, number][] = [
      [2, 2],
      [6, 2],
      [6, 4],
      [2, 4],
    ]
    doc = addBed(doc, ring, 0.3, 'steel').document

    expect(bedAt(doc, { x: 4, z: 3 })).not.toBeNull()
    expect(bedAt(doc, { x: 4, z: 3 })?.material).toBe('steel')
    expect(bedAt(doc, { x: 1, z: 1 })).toBeNull()
    expect(bedAt(doc, { x: 7, z: 3 })).toBeNull()
  })

  it('includes beds in pavingSnapTargets', () => {
    let doc = emptyDoc()
    const ring: [number, number][] = [
      [2, 2],
      [6, 2],
      [6, 4],
      [2, 4],
    ]
    doc = addBed(doc, ring, 0.3, 'timber').document

    const targets = pavingSnapTargets(doc)
    // Corner [2, 2] should be among the targets points
    const found = targets.points.some((p) => Math.hypot(p.x - 2, p.z - 2) < 1e-4)
    expect(found).toBe(true)
  })
})

describe('landscaping costing takeoff', () => {
  it('quantifies topsoil and raised bed edging', () => {
    let doc = emptyDoc()
    // In-ground bed: 4 × 2 = 8 m² -> 8 * 0.15 = 1.2 m³ soil
    doc = addBed(doc, [[2, 2], [6, 2], [6, 4], [2, 4]], 0).document
    // Raised timber bed: 3 × 2 = 6 m² area, 10 m perimeter, 0.4 m height
    doc = addBed(doc, [[8, 2], [11, 2], [11, 4], [8, 4]], 0.4, 'timber').document

    const lines = takeoff(doc)
    const landscapeLines = lines.filter((line) => line.group === 'Landscaping')
    expect(landscapeLines.length).toBeGreaterThanOrEqual(2)

    const topsoilLine = landscapeLines.find((l) => l.id === 'landscaping:topsoil')
    expect(topsoilLine).toBeDefined()
    expect(topsoilLine?.unit).toBe('m³')
    expect(topsoilLine?.rateKey).toBe('topsoil')
    expect(topsoilLine?.rate).toBe(550)
    expect(topsoilLine?.amount).toBeGreaterThan(0)

    const timberEdgeLine = landscapeLines.find((l) => l.id === 'bed-edge:timber')
    expect(timberEdgeLine).toBeDefined()
    expect(timberEdgeLine?.unit).toBe('m')
    expect(timberEdgeLine?.quantity).toBe(10) // 10 m perimeter
    expect(timberEdgeLine?.rateKey).toBe('bed-edge:timber')
    expect(timberEdgeLine?.rate).toBe(320)
    expect(timberEdgeLine?.amount).toBe(3200)
  })

  it('quantifies flush in-ground bed edging when specified', () => {
    let doc = emptyDoc()
    // Flat bed with brick-on-edge edging: 4 × 2 = 8 m², 12 m perimeter
    doc = addBed(doc, [[2, 2], [6, 2], [6, 4], [2, 4]], 0, 'brick').document
    // Flat bed without edging: 3 × 3 = 9 m², 12 m perimeter
    doc = addBed(doc, [[10, 2], [13, 2], [13, 5], [10, 5]], 0).document

    const lines = takeoff(doc)
    const landscapeLines = lines.filter((line) => line.group === 'Landscaping')

    // Topsoil covers both beds: (8 + 9) * 0.15 = 2.55 m³
    const topsoilLine = landscapeLines.find((l) => l.id === 'landscaping:topsoil')
    expect(topsoilLine).toBeDefined()

    // Flush brick edging for the first bed only
    const brickEdgeLine = landscapeLines.find((l) => l.id === 'bed-flat-edge:brick')
    expect(brickEdgeLine).toBeDefined()
    expect(brickEdgeLine?.unit).toBe('m')
    expect(brickEdgeLine?.quantity).toBe(12)
    expect(brickEdgeLine?.rateKey).toBe('bed-flat-edge:brick')
    expect(brickEdgeLine?.rate).toBe(150)
    expect(brickEdgeLine?.amount).toBe(1800)

    // No raised edge lines
    expect(landscapeLines.some((l) => l.id.startsWith('bed-edge:'))).toBe(false)
  })

  it('builds retaining walls and top rim cap for concave L-shaped beds without dropping the cap', () => {
    let doc = emptyDoc()
    // L-shaped concave bed
    const ring: [number, number][] = [
      [2, 2],
      [8, 2],
      [8, 4],
      [4, 4],
      [4, 8],
      [2, 8],
    ]
    doc = addBed(doc, ring, 0.4, 'brick').document

    const groundAt = () => 10
    const parts = buildBedParts(doc, groundAt)
    const spec = bedMaterialSpec('brick')
    const wallPart = parts.find((p) => p.colour === spec.colour)
    const soilPart = parts.find((p) => p.colour === BED_SOIL_COLOUR)

    expect(wallPart).toBeDefined()
    expect(soilPart).toBeDefined()

    // Check that horizontal top rim faces at topY (10.4) exist
    const wallPos = wallPart!.geometry.getAttribute('position')
    let topCapVertices = 0
    for (let i = 0; i < wallPos.count; i++) {
      if (Math.abs(wallPos.getY(i) - 10.4) < 1e-3) {
        topCapVertices++
      }
    }
    // The top cap rim must have vertices and not be skipped
    expect(topCapVertices).toBeGreaterThanOrEqual(6)
  })

  it('produces no landscaping lines if document has no beds', () => {
    const doc = emptyDoc()
    const lines = takeoff(doc)
    expect(lines.filter((l) => l.group === 'Landscaping')).toHaveLength(0)
  })
})

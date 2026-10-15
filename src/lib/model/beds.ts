import { signedPolygonArea } from './geom'
import { pointInPlot } from './plot-check'
import type { BedMaterial, Document, GardenBed } from './types'

export type BedMaterialSpec = {
  id: BedMaterial
  name: string
  text: string
  colour: string
  thickness: number
}

export const BED_MATERIALS: readonly BedMaterialSpec[] = [
  {
    id: 'timber',
    name: 'Treated timber',
    text: 'Treated timber sleepers or planks, pinned into the ground with steel stakes. Warm and natural.',
    colour: '#825633',
    thickness: 0.1,
  },
  {
    id: 'brick',
    name: 'Face brick',
    text: 'Single-skin clay face brick or plastered masonry on a concrete footing. Matches the house walls.',
    colour: '#a65f43',
    thickness: 0.11,
  },
  {
    id: 'stone',
    name: 'Stone walling',
    text: 'Dry-stacked natural stone or textured masonry blocks. Rugged, durable and frost-proof.',
    colour: '#87837d',
    thickness: 0.14,
  },
  {
    id: 'steel',
    name: 'Corten steel',
    text: 'Weathering Corten steel plate with a rolled safety edge. Slender, modern and rustic.',
    colour: '#7d4427',
    thickness: 0.025,
  },
]

export const DEFAULT_BED_MATERIAL: BedMaterial = 'timber'
export const DEFAULT_RAISED_HEIGHT = 0.3
export const IN_GROUND_DEPTH_M = 0.15
export const MIN_BED_AREA = 0.1
export const MAX_BED_HEIGHT = 1.2

export function bedMaterialSpec(material: BedMaterial | undefined): BedMaterialSpec {
  return BED_MATERIALS.find((item) => item.id === material) ?? BED_MATERIALS[0]
}

export function bedArea(ring: [number, number][]): number {
  return Math.abs(signedPolygonArea(ring.map(([x, z]) => ({ x, z }))))
}

export function bedPerimeter(ring: [number, number][]): number {
  let length = 0
  for (let i = 0; i < ring.length; i++) {
    const [ax, az] = ring[i]
    const [bx, bz] = ring[(i + 1) % ring.length]
    length += Math.hypot(bx - ax, bz - az)
  }
  return length
}

// Wall face area in square metres: on sloping ground, the retaining wall extends down from the level top cap
// to the terrain along each edge, matching the 3D geometry in Review.
export function bedWallArea(bed: Pick<GardenBed, 'ring' | 'height'>, groundAt?: (x: number, z: number) => number): number {
  if (bed.height <= 0.05) return 0
  const n = bed.ring.length
  if (n < 3) return 0

  if (!groundAt) {
    return bedPerimeter(bed.ring) * bed.height
  }

  const groundHeights = bed.ring.map(([x, z]) => groundAt(x, z))
  const maxGround = Math.max(...groundHeights)
  const topY = maxGround + bed.height

  let totalArea = 0
  for (let i = 0; i < n; i++) {
    const a = bed.ring[i]
    const b = bed.ring[(i + 1) % n]
    const length = Math.hypot(b[0] - a[0], b[1] - a[1])
    const ya = groundAt(a[0], a[1])
    const yb = groundAt(b[0], b[1])
    const hA = Math.max(0, topY - ya)
    const hB = Math.max(0, topY - yb)
    totalArea += (length * (hA + hB)) / 2
  }
  return totalArea
}

// Soil volume in cubic metres: for in-ground beds, a 150 mm cultivated topsoil layer; for raised beds, the inner
// volume inside the retaining walls, filled to 30 mm below the top rim.
export function bedSoilVolume(bed: Pick<GardenBed, 'ring' | 'height' | 'material'>, groundAt?: (x: number, z: number) => number): number {
  const area = bedArea(bed.ring)
  if (bed.height <= 0.05) {
    return area * IN_GROUND_DEPTH_M
  }
  const spec = bedMaterialSpec(bed.material)
  const innerArea = Math.max(0.1 * area, area - bedPerimeter(bed.ring) * spec.thickness)

  if (!groundAt) {
    const soilDepth = Math.max(0.05, bed.height - 0.03)
    return innerArea * soilDepth
  }

  const groundHeights = bed.ring.map(([x, z]) => groundAt(x, z))
  const maxGround = Math.max(...groundHeights)
  const avgGround = groundHeights.reduce((sum, h) => sum + h, 0) / groundHeights.length
  const topY = maxGround + bed.height
  const soilDepth = Math.max(0.05, topY - 0.03 - avgGround)
  return innerArea * soilDepth
}

export function bedProblem(document: Document, bed: Omit<GardenBed, 'id'>): string | null {
  if (bed.ring.length < 3 || bed.ring.some(([x, z]) => !Number.isFinite(x) || !Number.isFinite(z))) {
    return 'a garden bed needs at least three corners'
  }
  if (bedArea(bed.ring) < MIN_BED_AREA) return 'garden bed is too small'
  if (bed.ring.some(([x, z]) => !pointInPlot(document.plot, x, z))) return 'garden bed outside the plot'
  if (bed.height < 0 || bed.height > MAX_BED_HEIGHT) {
    return `height must be between 0 and ${Math.round(MAX_BED_HEIGHT * 1000)} mm`
  }
  if (bed.material && !BED_MATERIALS.some((m) => m.id === bed.material)) return 'unknown bed material'
  return null
}

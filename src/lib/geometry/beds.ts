import { BufferGeometry, Float32BufferAttribute, ShapeUtils, Vector2 } from 'three'
import { signedPolygonArea } from '../model/geom'
import { bedArea, bedMaterialSpec } from '../model/beds'
import type { Document, GardenBed } from '../model/types'
import { offsetEdges } from './outline'
import type { Ring } from './pad'

export const BED_SOIL_COLOUR = '#34261f'

export type BedPart = { geometry: BufferGeometry; colour: string }

type Point = { x: number; z: number }
type P3 = [number, number, number]

function quad(positions: number[], p0: P3, p1: P3, p2: P3, p3: P3) {
  positions.push(...p0, ...p1, ...p2, ...p0, ...p2, ...p3)
}

function triangulateRing(ring: [number, number][]): [number, number][][] {
  const contour = ring.map(([x, z]) => new Vector2(x, z))
  const out: [number, number][][] = []
  const split = (a: [number, number], b: [number, number], c: [number, number], depth: number) => {
    const longest = Math.max(
      Math.hypot(b[0] - a[0], b[1] - a[1]),
      Math.hypot(c[0] - b[0], c[1] - b[1]),
      Math.hypot(a[0] - c[0], a[1] - c[1]),
    )
    if (longest <= 1 || depth > 8) {
      out.push([a, b, c])
      return
    }
    const ab: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
    const bc: [number, number] = [(b[0] + c[0]) / 2, (b[1] + c[1]) / 2]
    const ca: [number, number] = [(c[0] + a[0]) / 2, (c[1] + a[1]) / 2]
    split(a, ab, ca, depth + 1)
    split(ab, b, bc, depth + 1)
    split(ca, bc, c, depth + 1)
    split(ab, bc, ca, depth + 1)
  }
  for (const [i, j, k] of ShapeUtils.triangulateShape(contour, [])) {
    split([contour[i].x, contour[i].y], [contour[j].x, contour[j].y], [contour[k].x, contour[k].y], 0)
  }
  return out
}

function insetRing(ring: [number, number][], thickness: number): [number, number][] {
  const asPoints: Ring = ring.map(([x, z]) => ({ x, z }))
  const ccw = signedPolygonArea(asPoints) < 0
  const normalized = ccw ? [...asPoints].reverse() : asPoints
  const inset = offsetEdges(normalized, normalized.map(() => -thickness))
  const insetCoords: [number, number][] = inset.map((p) => [p.x, p.z])
  // If insetting inverted or collapsed the ring, fall back to scale towards centroid
  if (inset.length < 3 || bedArea(insetCoords) < 0.05 * bedArea(ring)) {
    const cx = ring.reduce((sum, p) => sum + p[0], 0) / ring.length
    const cz = ring.reduce((sum, p) => sum + p[1], 0) / ring.length
    const area = bedArea(ring)
    const factor = Math.max(0.1, 1 - (thickness * 2) / Math.sqrt(area || 1))
    return ring.map(([x, z]) => [cx + (x - cx) * factor, cz + (z - cz) * factor])
  }
  return ccw ? insetCoords.reverse() : insetCoords
}

export function buildBedParts(doc: Document, heightAt: (x: number, z: number) => number): BedPart[] {
  const byColour = new Map<string, number[]>()
  const into = (colour: string) => {
    let positions = byColour.get(colour)
    if (!positions) {
      positions = []
      byColour.set(colour, positions)
    }
    return positions
  }

  for (const bed of doc.beds ?? []) {
    if (bed.ring.length < 3) continue
    const isRaised = bed.height > 0.05

    if (!isRaised) {
      // In-ground bed: triangulated soil surface draped over the terrain
      const soilPositions = into(BED_SOIL_COLOUR)
      const tris = triangulateRing(bed.ring)
      for (const [a, b, c] of tris) {
        soilPositions.push(
          a[0], heightAt(a[0], a[1]) + 0.035, a[1],
          b[0], heightAt(b[0], b[1]) + 0.035, b[1],
          c[0], heightAt(c[0], c[1]) + 0.035, c[1],
        )
      }
      continue
    }

    // Raised bed: retaining walls and elevated soil
    const spec = bedMaterialSpec(bed.material)
    const wallPositions = into(spec.colour)
    const soilPositions = into(BED_SOIL_COLOUR)

    const outer = bed.ring
    const n = outer.length
    const groundHeights = outer.map(([x, z]) => heightAt(x, z))
    const maxGround = Math.max(...groundHeights)
    const topY = maxGround + bed.height
    const soilY = topY - 0.03

    const inner = insetRing(outer, spec.thickness)

    // Outer wall faces: from ground down -0.05 up to topY
    for (let i = 0; i < n; i++) {
      const a = outer[i]
      const b = outer[(i + 1) % n]
      const ya = heightAt(a[0], a[1]) - 0.05
      const yb = heightAt(b[0], b[1]) - 0.05
      quad(
        wallPositions,
        [a[0], ya, a[1]],
        [b[0], yb, b[1]],
        [b[0], topY, b[1]],
        [a[0], topY, a[1]],
      )
    }

    // Inner wall faces: from soilY up to topY
    const m = inner.length
    for (let i = 0; i < m; i++) {
      const a = inner[i]
      const b = inner[(i + 1) % m]
      quad(
        wallPositions,
        [b[0], soilY, b[1]],
        [a[0], soilY, a[1]],
        [a[0], topY, a[1]],
        [b[0], topY, b[1]],
      )
    }

    // Top rim cap between outer and inner ring
    if (m === n) {
      for (let i = 0; i < n; i++) {
        const o1 = outer[i]
        const o2 = outer[(i + 1) % n]
        const i1 = inner[i]
        const i2 = inner[(i + 1) % n]
        quad(
          wallPositions,
          [o1[0], topY, o1[1]],
          [o2[0], topY, o2[1]],
          [i2[0], topY, i2[1]],
          [i1[0], topY, i1[1]],
        )
      }
    }

    // Soil fill across inner ring
    const soilTris = triangulateRing(inner)
    for (const [a, b, c] of soilTris) {
      soilPositions.push(
        a[0], soilY, a[1],
        b[0], soilY, b[1],
        c[0], soilY, c[1],
      )
    }
  }

  const parts: BedPart[] = []
  for (const [colour, positions] of byColour) {
    if (positions.length === 0) continue
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
    geometry.computeVertexNormals()
    parts.push({ geometry, colour })
  }
  return parts
}

function inside(ring: [number, number][], p: Point): boolean {
  let hit = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]
    const b = ring[j]
    if (a[1] > p.z !== b[1] > p.z && p.x < ((b[0] - a[0]) * (p.z - a[1])) / (b[1] - a[1]) + a[0]) hit = !hit
  }
  return hit
}

export function bedAt(doc: Document, p: Point): GardenBed | null {
  for (const item of [...(doc.beds ?? [])].reverse()) {
    if (inside(item.ring, p)) return item
  }
  return null
}

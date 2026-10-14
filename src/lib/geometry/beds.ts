import { BufferGeometry, Float32BufferAttribute, ShapeUtils, Vector2 } from 'three'
import { signedPolygonArea } from '../model/geom'
import { bedArea, bedMaterialSpec } from '../model/beds'
import type { Document, GardenBed } from '../model/types'
import { offsetEdges } from './outline'
import { pointInRing, type Ring } from './pad'

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

export function insetRing(ring: [number, number][], thickness: number): [number, number][] {
  const asPoints: Ring = ring.map(([x, z]) => ({ x, z }))
  const ccw = signedPolygonArea(asPoints) < 0
  const normalized = ccw ? [...asPoints].reverse() : asPoints
  const inset = offsetEdges(normalized, normalized.map(() => -thickness))
  const insetCoords: [number, number][] = inset.map((p) => [p.x, p.z])

  // Check if offsetEdges produced a clean, non-inverted ring strictly inside the bed
  const validOffset =
    inset.length >= 3 &&
    bedArea(insetCoords) >= 0.05 * bedArea(ring) &&
    insetCoords.every(([x, z]) => pointInRing(asPoints, x, z))

  if (validOffset) {
    return ccw ? insetCoords.reverse() : insetCoords
  }

  // Fallback: per-vertex inward bisector offset. For concave/awkward outlines, this guarantees
  // every inner vertex stays strictly inside the bed boundary without crossing outside.
  const n = normalized.length
  const fallbackPoints: Ring = []
  for (let i = 0; i < n; i++) {
    const prev = normalized[(i + n - 1) % n]
    const cur = normalized[i]
    const next = normalized[(i + 1) % n]

    const d1x = cur.x - prev.x
    const d1z = cur.z - prev.z
    const l1 = Math.hypot(d1x, d1z)
    const e1 = l1 > 1e-9 ? { x: d1x / l1, z: d1z / l1 } : { x: 1, z: 0 }

    const d2x = next.x - cur.x
    const d2z = next.z - cur.z
    const l2 = Math.hypot(d2x, d2z)
    const e2 = l2 > 1e-9 ? { x: d2x / l2, z: d2z / l2 } : { x: 1, z: 0 }

    // Inward normals (left of normalized edge since signedPolygonArea >= 0)
    const n1 = { x: -e1.z, z: e1.x }
    const n2 = { x: -e2.z, z: e2.x }

    const bx = n1.x + n2.x
    const bz = n1.z + n2.z
    const bl = Math.hypot(bx, bz)
    const bisector = bl > 1e-6 ? { x: bx / bl, z: bz / bl } : n1

    const cosHalf = bisector.x * n1.x + bisector.z * n1.z
    const factor = cosHalf > 0.1 ? 1 / cosHalf : 1
    let dist = Math.min(thickness * factor, Math.min(l1 || 1, l2 || 1) * 0.45)

    let candidate = { x: cur.x + bisector.x * dist, z: cur.z + bisector.z * dist }
    let attempts = 0
    while (!pointInRing(normalized, candidate.x, candidate.z) && attempts < 5) {
      dist *= 0.5
      candidate = { x: cur.x + bisector.x * dist, z: cur.z + bisector.z * dist }
      attempts++
    }
    fallbackPoints.push(candidate)
  }

  const fallbackCoords: [number, number][] = fallbackPoints.map((p) => [p.x, p.z])
  return ccw ? fallbackCoords.reverse() : fallbackCoords
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
      if (bed.material) {
        const spec = bedMaterialSpec(bed.material)
        const edgePositions = into(spec.colour)
        const inner = insetRing(bed.ring, spec.thickness)
        const n = bed.ring.length
        const m = inner.length
        if (m === n) {
          for (let i = 0; i < n; i++) {
            const o1 = bed.ring[i]
            const o2 = bed.ring[(i + 1) % n]
            const i1 = inner[i]
            const i2 = inner[(i + 1) % n]
            const yo1 = heightAt(o1[0], o1[1]) + 0.037
            const yo2 = heightAt(o2[0], o2[1]) + 0.037
            const yi1 = heightAt(i1[0], i1[1]) + 0.037
            const yi2 = heightAt(i2[0], i2[1]) + 0.037
            quad(edgePositions, [o1[0], yo1, o1[1]], [o2[0], yo2, o2[1]], [i2[0], yi2, i2[1]], [i1[0], yi1, i1[1]])
          }
        }
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
    const outerContour = outer.map(([x, z]) => new Vector2(x, z))
    const innerContour = inner.map(([x, z]) => new Vector2(x, z))
    const allContours = [...outerContour, ...innerContour]
    const rimTris = ShapeUtils.triangulateShape(outerContour, [innerContour])
    if (rimTris.length > 0) {
      for (const [i, j, k] of rimTris) {
        const a = allContours[i]
        const b = allContours[j]
        const c = allContours[k]
        wallPositions.push(a.x, topY, a.y, b.x, topY, b.y, c.x, topY, c.y)
      }
    } else if (m === n) {
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

    // Soil fill across inner ring (flat at soilY, no recursive draping subdivision needed)
    for (const [i, j, k] of ShapeUtils.triangulateShape(innerContour, [])) {
      const a = innerContour[i]
      const b = innerContour[j]
      const c = innerContour[k]
      soilPositions.push(
        a.x, soilY, a.y,
        b.x, soilY, b.y,
        c.x, soilY, c.y,
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

export function bedAt(doc: Document, p: Point): GardenBed | null {
  for (const item of [...(doc.beds ?? [])].reverse()) {
    if (pointInRing(item.ring.map(([x, z]) => ({ x, z })), p.x, p.z)) return item
  }
  return null
}

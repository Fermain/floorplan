import { BoxGeometry, BufferGeometry, Float32BufferAttribute, Matrix4, Vector3 } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { CARPORT_CLEAR_M, CARPORT_POST_M, carportPosts, carportRing, carportRoofSpec, carportSize } from '../model/carports'
import type { Carport, Document } from '../model/types'
import { pavingSnapTargets, snapPavingPoint } from './paving'

type Point = { x: number; z: number }

export type CarportPart = { geometry: BufferGeometry; colour: string; opacity: number }

const FRAME_COLOUR = '#3f4448'
const BEAM_M = 0.1

function pointInRing(ring: Point[], p: Point): boolean {
  let hit = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]
    const b = ring[j]
    if (a.z > p.z !== b.z > p.z && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) hit = !hit
  }
  return hit
}

// The carport under a point: the last placed first.
export function carportAt(doc: Document, p: Point): Carport | null {
  for (const carport of [...(doc.carports ?? [])].reverse()) {
    if (pointInRing(carportRing(carport), p)) return carport
  }
  return null
}

// Where a carport lands when its middle is put at a point: its corners snap to the plot, the house, paving and
// other carports, a corner first and then a side, and otherwise its middle goes to the nearest 50 mm.
export function snapCarport(doc: Document, carport: Omit<Carport, 'id'>, radius: number): Point {
  const targets = pavingSnapTargets(doc)
  let best: { dx: number; dz: number; d: number } | null = null
  for (const corner of carportRing(carport)) {
    const snapped = snapPavingPoint(corner, targets, radius)
    if (!snapped.snapped) continue
    const d = Math.hypot(snapped.point.x - corner.x, snapped.point.z - corner.z)
    if (!best || d < best.d) best = { dx: snapped.point.x - corner.x, dz: snapped.point.z - corner.z, d }
  }
  if (best) return { x: carport.x + best.dx, z: carport.z + best.dz }
  return { x: Math.round(carport.x * 20) / 20, z: Math.round(carport.z * 20) / 20 }
}

function box(centre: Vector3, along: Vector3, across: Vector3, size: [number, number, number]): BufferGeometry {
  const geometry = new BoxGeometry(1, 1, 1)
  const matrix = new Matrix4().makeBasis(along, new Vector3(0, 1, 0), across)
  matrix.scale(new Vector3(size[0], size[1], size[2]))
  matrix.setPosition(centre)
  geometry.applyMatrix4(matrix)
  return geometry
}

function surface(points: Vector3[], triangles: number[][]): BufferGeometry {
  const positions: number[] = []
  for (const [a, b, c] of triangles) for (const i of [a, b, c]) positions.push(points[i].x, points[i].y, points[i].z)
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.computeVertexNormals()
  return geometry
}

// The carports for Review: posts standing on the ground, a frame round their heads, and the roof. The roof is
// level on its posts, set by the highest ground under them, so a carport on a slope has longer posts downhill.
export function buildCarportParts(doc: Document, heightAt: (x: number, z: number) => number): CarportPart[] {
  const frames: BufferGeometry[] = []
  const roofs = new Map<string, { colour: string; opacity: number; parts: BufferGeometry[] }>()
  for (const carport of doc.carports ?? []) {
    const spec = carportRoofSpec(carport.roof)
    const { wide, deep } = carportSize(carport)
    const along = new Vector3(carport.dx, 0, carport.dz)
    const across = new Vector3(-carport.dz, 0, carport.dx)
    const posts = carportPosts(carport)
    const head = Math.max(...posts.map((p) => heightAt(p.x, p.z))) + CARPORT_CLEAR_M
    const centre = new Vector3(carport.x, head, carport.z)
    for (const post of posts) {
      const foot = heightAt(post.x, post.z)
      frames.push(box(new Vector3(post.x, (foot + head) / 2, post.z), along, across, [CARPORT_POST_M, head - foot, CARPORT_POST_M]))
    }
    // A beam down each side and across each end, at the heads of the posts.
    for (const side of [-1, 1]) {
      frames.push(box(centre.clone().addScaledVector(across, (side * (wide - BEAM_M)) / 2).setY(head + BEAM_M / 2), along, across, [deep, BEAM_M, BEAM_M]))
      frames.push(box(centre.clone().addScaledVector(along, (side * (deep - BEAM_M)) / 2).setY(head + BEAM_M / 2), along, across, [BEAM_M, BEAM_M, wide]))
    }
    const base = head + BEAM_M
    const rise = Math.tan((spec.pitchDeg * Math.PI) / 180)
    const over = 0.15
    const corner = (a: number, b: number, y: number) => centre.clone().addScaledVector(along, a).addScaledVector(across, b).setY(y)
    const [a0, a1, b0, b1] = [-deep / 2 - over, deep / 2 + over, -wide / 2 - over, wide / 2 + over]
    let roof: BufferGeometry
    if (carport.roof === 'sheet') {
      // One slope, falling across the cars to one side.
      const high = base + rise * (b1 - b0)
      roof = surface([corner(a0, b0, high), corner(a1, b0, high), corner(a1, b1, base), corner(a0, b1, base)], [[0, 1, 2], [0, 2, 3]])
    } else {
      // Cloth pulled up to a short ridge down the middle: a low hip.
      const half = (b1 - b0) / 2
      const top = base + rise * half
      const run = Math.max(0, (a1 - a0) / 2 - half)
      const [r0, r1] = [corner(-run, 0, top), corner(run, 0, top)]
      roof = surface(
        [corner(a0, b0, base), corner(a1, b0, base), corner(a1, b1, base), corner(a0, b1, base), r0, r1],
        [[0, 1, 5], [0, 5, 4], [1, 2, 5], [2, 3, 4], [2, 4, 5], [3, 0, 4]],
      )
    }
    const key = carport.roof
    const group = roofs.get(key) ?? { colour: spec.colour, opacity: carport.roof === 'shade-cloth' ? 0.92 : 1, parts: [] }
    group.parts.push(roof)
    roofs.set(key, group)
  }
  const out: CarportPart[] = []
  const merge = (parts: BufferGeometry[]) => {
    const merged = mergeGeometries(parts.map((part) => (part.index ? part.toNonIndexed() : part)), false)
    for (const part of parts) part.dispose()
    return merged
  }
  const frame = frames.length > 0 ? merge(frames) : null
  if (frame) out.push({ geometry: frame, colour: FRAME_COLOUR, opacity: 1 })
  for (const group of roofs.values()) {
    const merged = merge(group.parts)
    if (merged) out.push({ geometry: merged, colour: group.colour, opacity: group.opacity })
  }
  return out
}

// What a carport is made of, for Quantities: its posts, the steel round and across its roof, and the roof itself.
export function carportQuantities(carport: Carport): { posts: number; steel: number; roof: number } {
  const { wide, deep } = carportSize(carport)
  const pitch = (carportRoofSpec(carport.roof).pitchDeg * Math.PI) / 180
  // Beams round the edge, and purlins across at about 1.2 m.
  const purlins = Math.ceil(deep / 1.2) + 1
  return { posts: carportPosts(carport).length, steel: 2 * (wide + deep) + purlins * wide, roof: ((wide + 0.3) * (deep + 0.3)) / Math.cos(pitch) }
}

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

// A steel member from one point to another, square in section.
function member(from: Vector3, to: Vector3, size: number): BufferGeometry {
  const run = to.clone().sub(from)
  const length = run.length()
  const dir = run.clone().normalize()
  const flat = Math.abs(dir.y) > 0.99 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0)
  const side = new Vector3().crossVectors(dir, flat).normalize()
  const up = new Vector3().crossVectors(side, dir).normalize()
  const geometry = new BoxGeometry(1, 1, 1)
  const matrix = new Matrix4().makeBasis(dir, up, side)
  matrix.scale(new Vector3(length, size, size))
  matrix.setPosition(from.clone().add(to).multiplyScalar(0.5))
  geometry.applyMatrix4(matrix)
  return geometry
}

// A flat panel with some thickness, lying on three of its corners: a sheet of roofing.
function panel(p0: Vector3, p1: Vector3, p3: Vector3, thickness: number): BufferGeometry {
  const u = p1.clone().sub(p0)
  const w = p3.clone().sub(p0)
  const normal = new Vector3().crossVectors(w, u).normalize()
  if (normal.y < 0) normal.negate()
  const geometry = new BoxGeometry(1, 1, 1)
  const matrix = new Matrix4().makeBasis(u.clone().normalize(), normal, w.clone().normalize())
  matrix.scale(new Vector3(u.length(), thickness, w.length()))
  matrix.setPosition(p0.clone().add(u.clone().multiplyScalar(0.5)).add(w.clone().multiplyScalar(0.5)).addScaledVector(normal, thickness / 2))
  geometry.applyMatrix4(matrix)
  return geometry
}

const SHEET_M = 0.04

// The carports for Review: posts standing on the ground, a steel frame at their heads, and the roof on it. The
// low side of the roof is set by the highest ground under the posts, so a carport on a slope has longer posts
// downhill. A sheeted roof falls to one side: its posts are taller on the high side and rafters carry the slope.
// Shade cloth is pulled up over a ridge held on hip rafters from the corners.
export function buildCarportParts(doc: Document, heightAt: (x: number, z: number) => number): CarportPart[] {
  const frames: BufferGeometry[] = []
  const roofs = new Map<string, { colour: string; opacity: number; parts: BufferGeometry[] }>()
  for (const carport of doc.carports ?? []) {
    const spec = carportRoofSpec(carport.roof)
    const { wide, deep } = carportSize(carport)
    const along = new Vector3(carport.dx, 0, carport.dz)
    const across = new Vector3(-carport.dz, 0, carport.dx)
    const posts = carportPosts(carport)
    const low = Math.max(...posts.map((p) => heightAt(p.x, p.z))) + CARPORT_CLEAR_M
    const rise = Math.tan((spec.pitchDeg * Math.PI) / 180)
    const sheet = carport.roof === 'sheet'
    const centre = new Vector3(carport.x, 0, carport.z)
    // The height of the frame over a point b metres across the cars: a sheeted roof's frame slopes with it.
    const headAt = (b: number) => low + (sheet ? rise * (wide / 2 - b) : 0)
    const at = (a: number, b: number, lift = 0) => centre.clone().addScaledVector(along, a).addScaledVector(across, b).setY(headAt(b) + lift)
    for (const post of posts) {
      const foot = heightAt(post.x, post.z)
      const b = (post.x - carport.x) * across.x + (post.z - carport.z) * across.z
      const head = headAt(b)
      frames.push(box(new Vector3(post.x, (foot + head) / 2, post.z), along, across, [CARPORT_POST_M, head - foot, CARPORT_POST_M]))
    }
    const [a0, a1, b0, b1] = [-deep / 2, deep / 2, -wide / 2, wide / 2]
    const half = BEAM_M / 2
    // A beam down each side at the heads of its posts, and one across each end: a rafter, on a sheeted roof.
    for (const b of [b0 + half, b1 - half]) frames.push(member(at(a0, b, half), at(a1, b, half), BEAM_M))
    for (const a of [a0 + half, a1 - half]) frames.push(member(at(a, b0, half), at(a, b1, half), BEAM_M))
    const over = 0.15
    const parts: BufferGeometry[] = []
    if (sheet) {
      // Purlins along the cars at about 1.2 m, and the sheeting on top of them.
      const count = Math.max(1, Math.round(wide / 1.2))
      for (let i = 1; i < count; i++) {
        const b = b0 + (wide * i) / count
        frames.push(member(at(a0, b, half), at(a1, b, half), BEAM_M * 0.6))
      }
      const lift = BEAM_M
      const edge = (a: number, b: number) => centre.clone().addScaledVector(along, a).addScaledVector(across, b).setY(low + rise * (wide / 2 - b) + lift)
      parts.push(panel(edge(a0 - over, b0 - over), edge(a1 + over, b0 - over), edge(a0 - over, b1 + over), SHEET_M))
    } else {
      // A ridge down the middle, held up on hip rafters from the four corners, with the cloth over them.
      const halfWide = wide / 2
      const top = low + BEAM_M + rise * halfWide
      const run = Math.max(0, deep / 2 - halfWide)
      const ridge = [centre.clone().addScaledVector(along, -run).setY(top), centre.clone().addScaledVector(along, run).setY(top)]
      if (run > 0) frames.push(member(ridge[0], ridge[1], BEAM_M * 0.6))
      const corners = [at(a0, b0, BEAM_M), at(a1, b0, BEAM_M), at(a1, b1, BEAM_M), at(a0, b1, BEAM_M)]
      frames.push(member(corners[0], ridge[0], BEAM_M * 0.6), member(corners[3], ridge[0], BEAM_M * 0.6))
      frames.push(member(corners[1], ridge[1], BEAM_M * 0.6), member(corners[2], ridge[1], BEAM_M * 0.6))
      const lift = BEAM_M * 0.3
      const [r0, r1] = ridge.map((p) => p.clone().setY(p.y + lift))
      const c = corners.map((p) => p.clone().setY(p.y + lift))
      // Cloth has no thickness worth drawing: four faces up to the ridge, seen from both sides.
      parts.push(surface([c[0], c[1], c[2], c[3], r0, r1], [[0, 1, 5], [0, 5, 4], [1, 2, 5], [2, 3, 4], [2, 4, 5], [3, 0, 4]]))
    }
    const key = carport.roof
    const group = roofs.get(key) ?? { colour: spec.colour, opacity: sheet ? 1 : 0.92, parts: [] }
    group.parts.push(...parts)
    roofs.set(key, group)
  }
  const out: CarportPart[] = []
  const merge = (parts: BufferGeometry[]) => {
    const flat = parts.map((part) => {
      const plain = part.index ? part.toNonIndexed() : part
      // Boxes carry texture coordinates and plain surfaces do not; drop them so the two merge.
      plain.deleteAttribute('uv')
      return plain
    })
    const merged = mergeGeometries(flat, false)
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

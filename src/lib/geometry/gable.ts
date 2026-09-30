import { BufferGeometry, Float32BufferAttribute } from 'three'
import { courseCount, leafOffset, MORTAR_JOINT, systemOf } from '../model/systems'
import type { Floor, Wall } from '../model/types'
import { WALL_HEAD } from '../plot/fixture'
import { leafSigns, wallMeshURange } from './walls'

type PlanPoint = { x: number; z: number }
type UV = { u: number; y: number }

export type GableBlock = { leaf: number; course: number; poly: UV[]; face: UV[] }

const COURSE_FACE_DEPTH = 0.003
const EPS = 1e-6

type Frame = { start: PlanPoint; dir: PlanPoint; normal: PlanPoint; length: number }

function wallFrame(floor: Floor, wall: Wall): Frame | null {
  const a = floor.corners.find((corner) => corner.id === wall.startCornerId)
  const b = floor.corners.find((corner) => corner.id === wall.endCornerId)
  if (!a || !b) return null
  const length = Math.hypot(b.x - a.x, b.z - a.z)
  if (length < EPS) return null
  const dir = { x: (b.x - a.x) / length, z: (b.z - a.z) / length }
  return { start: { x: a.x, z: a.z }, dir, normal: { x: -dir.z, z: dir.x }, length }
}

type Piece = { a: number; b: number }

type RoofLine = { at: (u: number) => number; kink: number | null; pieces: Piece[] }

function roofLine(frame: Frame, offset: number, heightAt: (p: PlanPoint) => number): RoofLine {
  const at = (u: number) =>
    heightAt({
      x: frame.start.x + frame.dir.x * u + frame.normal.x * offset,
      z: frame.start.z + frame.dir.z * u + frame.normal.z * offset,
    })
  const step = Math.min(0.01, frame.length / 4)
  const h0 = at(0)
  const hL = at(frame.length)
  const s0 = (at(step) - h0) / step
  const s1 = (hL - at(frame.length - step)) / step
  if (Math.abs(s0 - s1) < 1e-6) return { at: (u) => h0 + s0 * u, kink: null, pieces: [{ a: h0, b: s0 }] }
  const kink = (hL - s1 * frame.length - h0) / (s0 - s1)
  return {
    at: (u) => (u <= kink ? h0 + s0 * u : hL + s1 * (u - frame.length)),
    kink,
    pieces: [
      { a: h0, b: s0 },
      { a: hL - s1 * frame.length, b: s1 },
    ],
  }
}

function peak(line: RoofLine, u0: number, u1: number): number {
  const knots = [u0, u1]
  if (line.kink !== null && line.kink > u0 && line.kink < u1) knots.push(line.kink)
  return Math.max(...knots.map((u) => line.at(u)))
}

function clipBelow(poly: UV[], piece: Piece): UV[] {
  const side = (p: UV) => piece.a + piece.b * p.u - p.y
  const out: UV[] = []
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]
    const q = poly[(i + 1) % poly.length]
    const sp = side(p)
    const sq = side(q)
    if (sp >= 0) out.push(p)
    if ((sp >= 0) !== (sq >= 0)) {
      const t = sp / (sp - sq)
      out.push({ u: p.u + (q.u - p.u) * t, y: p.y + (q.y - p.y) * t })
    }
  }
  return out
}

function clipUnder(u0: number, u1: number, y0: number, y1: number, line: RoofLine): UV[] {
  if (u1 - u0 < EPS || y1 - y0 < EPS) return []
  let poly: UV[] = [
    { u: u0, y: y0 },
    { u: u1, y: y0 },
    { u: u1, y: y1 },
    { u: u0, y: y1 },
  ]
  for (const piece of line.pieces) poly = clipBelow(poly, piece)
  const cleaned: UV[] = []
  for (const p of poly) {
    const last = cleaned[cleaned.length - 1]
    if (last && Math.abs(last.u - p.u) < EPS && Math.abs(last.y - p.y) < EPS) continue
    cleaned.push(p)
  }
  while (cleaned.length > 1) {
    const first = cleaned[0]
    const last = cleaned[cleaned.length - 1]
    if (Math.abs(first.u - last.u) >= EPS || Math.abs(first.y - last.y) >= EPS) break
    cleaned.pop()
  }
  return cleaned.length >= 3 && polygonArea(cleaned) > 1e-6 ? cleaned : []
}

export function polygonArea(poly: UV[]): number {
  let sum = 0
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    sum += a.u * b.y - b.u * a.y
  }
  return Math.abs(sum) / 2
}

export function gableBlocks(
  floor: Floor,
  wall: Wall,
  heightAt: (p: PlanPoint) => number,
  plate = 0,
): GableBlock[] {
  const frame = wallFrame(floor, wall)
  if (!frame || wall.skin === 'logical') return []
  const system = systemOf(wall)
  const base = courseCount(system, WALL_HEAD)
  const half = MORTAR_JOINT / 2
  const blocks: GableBlock[] = []
  leafSigns(wall.skin).forEach((sign, leaf) => {
    const line = roofLine(frame, 0, (p) => heightAt(p) - plate)
    const lowered: RoofLine = {
      at: (u) => line.at(u) - half,
      kink: line.kink,
      pieces: line.pieces.map((piece) => ({ a: piece.a - half, b: piece.b })),
    }
    for (let k = 0; k < 200; k++) {
      const course = base + k
      const y0 = k * system.courseHeight
      const y1 = y0 + system.courseHeight
      const { uMin, uMax } = wallMeshURange(floor, wall, sign, course)
      if (peak(line, uMin, uMax) <= y0 + EPS) break
      const shift = course % 2 === 1 ? system.moduleLength / 2 : 0
      const first = Math.floor((uMin - shift) / system.moduleLength)
      const last = Math.floor((uMax - EPS - shift) / system.moduleLength)
      for (let m = first; m <= last; m++) {
        const u0 = Math.max(uMin, shift + m * system.moduleLength)
        const u1 = Math.min(uMax, shift + (m + 1) * system.moduleLength)
        const poly = clipUnder(u0, u1, y0, y1, line)
        if (poly.length < 3) continue
        const face = clipUnder(u0 + half, u1 - half, y0 + half, y1 - half, lowered)
        blocks.push({ leaf, course, poly, face })
      }
    }
  })
  return blocks
}

function pushPrism(positions: number[], frame: Frame, poly: UV[], centre: number, depth: number): void {
  const ccw = (() => {
    let sum = 0
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i]
      const b = poly[(i + 1) % poly.length]
      sum += a.u * b.y - b.u * a.y
    }
    return sum >= 0 ? poly : [...poly].reverse()
  })()
  const point = (p: UV, n: number): [number, number, number] => [
    frame.start.x + frame.dir.x * p.u + frame.normal.x * n,
    p.y,
    frame.start.z + frame.dir.z * p.u + frame.normal.z * n,
  ]
  const near = centre - depth / 2
  const far = centre + depth / 2
  for (let i = 1; i < ccw.length - 1; i++) {
    positions.push(...point(ccw[0], far), ...point(ccw[i], far), ...point(ccw[i + 1], far))
    positions.push(...point(ccw[0], near), ...point(ccw[i + 1], near), ...point(ccw[i], near))
  }
  for (let i = 0; i < ccw.length; i++) {
    const p = ccw[i]
    const q = ccw[(i + 1) % ccw.length]
    positions.push(...point(p, near), ...point(q, near), ...point(q, far))
    positions.push(...point(p, near), ...point(q, far), ...point(p, far))
  }
}

function toGeometry(positions: number[]): BufferGeometry | null {
  if (positions.length < 9) return null
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.computeVertexNormals()
  return geometry
}

export function buildGableGeometries(
  floor: Floor,
  gables: { wall: Wall; blocks: GableBlock[] }[],
): { body: BufferGeometry | null; faces: BufferGeometry | null } {
  const body: number[] = []
  const faces: number[] = []
  for (const { wall, blocks } of gables) {
    const frame = wallFrame(floor, wall)
    if (!frame) continue
    const system = systemOf(wall)
    const signs = leafSigns(wall.skin)
    for (const block of blocks) {
      const sign = signs[block.leaf]
      const centre = sign * leafOffset(system)
      pushPrism(body, frame, block.poly, centre, system.leafThickness)
      if (block.face.length < 3) continue
      const reach = system.leafThickness / 2 + COURSE_FACE_DEPTH / 2
      const sides = sign === 0 ? [reach, -reach] : [Math.sign(sign) * reach]
      for (const side of sides) pushPrism(faces, frame, block.face, centre + side, COURSE_FACE_DEPTH)
    }
  }
  return { body: toGeometry(body), faces: toGeometry(faces) }
}

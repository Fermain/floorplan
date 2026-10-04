import { LINTEL_BEARING, WALL_HEAD } from '../plot/fixture'
import type { Floor, Opening, Wall } from '../model/types'
import { deriveRooms } from '../model/rooms'
import {
  courseCount,
  leafOffset,
  MORTAR_JOINT,
  outerReach,
  snapToCourse,
  systemOf,
  wallThickness,
  type WallSystem,
} from '../model/systems'
import { pointInRing, type Ring } from './pad'
import { BoxGeometry, BufferGeometry, Matrix4, Vector3 } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

const MITER_MAX_CORNER_DIST = 1

export type BottomSample = { u: number; y: number }

export type BlockSpan = {
  u0: number
  u1: number
  course: number
  leaf: number
  y0: number
  y1: number
}

export type LintelSpan = {
  u0: number
  u1: number
  y0: number
  y1: number
}

type Vec2 = { x: number; z: number }
type WallFrame = {
  start: Vec2
  dir: Vec2
  normal: Vec2
  length: number
}

function cornerById(floor: Floor, id: string): Vec2 {
  const c = floor.corners.find((x) => x.id === id)
  if (!c) {
    throw new Error(`missing corner ${id}`)
  }
  return { x: c.x, z: c.z }
}

function buildFrame(floor: Floor, wall: Wall): WallFrame {
  const start = cornerById(floor, wall.startCornerId)
  const end = cornerById(floor, wall.endCornerId)
  const dx = end.x - start.x
  const dz = end.z - start.z
  const length = Math.hypot(dx, dz)
  if (length < 1e-9) {
    return {
      start,
      dir: { x: 1, z: 0 },
      normal: { x: 0, z: 1 },
      length: 0,
    }
  }
  return {
    start,
    dir: { x: dx / length, z: dz / length },
    normal: { x: -dz / length, z: dx / length },
    length,
  }
}

export function leafSigns(skin: Wall['skin']): number[] {
  if (skin === 'single') {
    return [0]
  }
  if (skin === 'double') {
    return [-1, 1]
  }
  return []
}

function interpolateBottom(u: number, samples: BottomSample[] | undefined): number {
  if (!samples || samples.length === 0) {
    return 0
  }
  if (samples.length === 1) {
    return samples[0].y
  }
  const sorted = [...samples].sort((a, b) => a.u - b.u)
  if (u <= sorted[0].u) {
    return sorted[0].y
  }
  const last = sorted[sorted.length - 1]
  if (u >= last.u) {
    return last.y
  }
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]
    const b = sorted[i + 1]
    if (u >= a.u && u <= b.u) {
      const t = (u - a.u) / (b.u - a.u)
      return a.y + t * (b.y - a.y)
    }
  }
  return 0
}

function bottomOffsetForBlock(u0: number, u1: number, samples: BottomSample[] | undefined): number {
  const mid = (u0 + u1) / 2
  return interpolateBottom(mid, samples)
}

function courseVerticalRange(
  course: number,
  courseHeight: number,
  u0: number,
  u1: number,
  samples: BottomSample[] | undefined,
): { y0: number; y1: number } | null {
  if (course === 0) {
    const y0 = bottomOffsetForBlock(u0, u1, samples)
    const y1 = courseHeight
    if (y0 >= y1 - 1e-9) return null
    return { y0, y1 }
  }
  const y0 = course * courseHeight
  const grade = bottomOffsetForBlock(u0, u1, samples)
  if (grade >= y0 + courseHeight - 1e-9) return null
  return { y0: Math.max(y0, grade), y1: y0 + courseHeight }
}

function intervalsOverlap(a0: number, a1: number, b0: number, b1: number): boolean {
  return a0 < b1 && b0 < a1
}

function subtractInterval(
  solid: { u0: number; u1: number },
  gap: { u0: number; u1: number },
): { u0: number; u1: number }[] {
  if (!intervalsOverlap(solid.u0, solid.u1, gap.u0, gap.u1)) {
    return [solid]
  }
  const out: { u0: number; u1: number }[] = []
  if (solid.u0 < gap.u0) {
    out.push({ u0: solid.u0, u1: Math.min(solid.u1, gap.u0) })
  }
  if (solid.u1 > gap.u1) {
    out.push({ u0: Math.max(solid.u0, gap.u1), u1: solid.u1 })
  }
  return out.filter((i) => i.u1 - i.u0 > 1e-9)
}

function splitBlockRuns(
  u0: number,
  u1: number,
  moduleLength: number,
  uShift = 0,
): { u0: number; u1: number }[] {
  const spans: { u0: number; u1: number }[] = []
  const kStart = Math.floor((u0 - uShift) / moduleLength)
  const kEnd = Math.floor((u1 - 1e-9 - uShift) / moduleLength)
  for (let k = kStart; k <= kEnd; k++) {
    const b0 = uShift + k * moduleLength
    const b1 = b0 + moduleLength
    const s0 = Math.max(u0, b0)
    const s1 = Math.min(u1, b1)
    if (s1 - s0 > 1e-9) {
      spans.push({ u0: s0, u1: s1 })
    }
  }
  return spans
}

function openingGapU(opening: Opening): { u0: number; u1: number; v0: number; v1: number } {
  return {
    u0: opening.u,
    u1: opening.u + opening.width,
    v0: opening.v,
    v1: opening.v + opening.height,
  }
}

function openingAffectsCourse(
  opening: Opening,
  course: number,
  courseHeight: number,
  samples: BottomSample[] | undefined,
  u0: number,
  u1: number,
): boolean {
  const range = courseVerticalRange(course, courseHeight, u0, u1, samples)
  if (!range) return false
  const { v0, v1 } = openingGapU(opening)
  return intervalsOverlap(range.y0, range.y1, v0, v1)
}

function moduleBearing(edge: number, direction: -1 | 1, moduleLength: number): number {
  const step = moduleLength / 2
  const limit = edge + direction * LINTEL_BEARING
  const n =
    direction > 0
      ? Math.ceil((limit - 1e-9) / step)
      : Math.floor((limit + 1e-9) / step)
  return n * step
}

function lintelBox(
  system: WallSystem,
  opening: Opening,
  others: Opening[],
  uMin: number,
  uMax: number,
): { u0: number; u1: number; y0: number; y1: number } | null {
  const head = opening.v + opening.height
  if (head >= WALL_HEAD - 1e-6) return null
  const y0 = head
  const y1 = Math.min(WALL_HEAD, head + system.courseHeight)
  if (y1 - y0 <= 1e-4) return null
  let u0 = Math.max(uMin, moduleBearing(opening.u, -1, system.moduleLength))
  let u1 = Math.min(uMax, moduleBearing(opening.u + opening.width, 1, system.moduleLength))
  const openingEnd = opening.u + opening.width
  for (const other of others) {
    const otherEnd = other.u + other.width
    if (otherEnd <= opening.u + 1e-9) {
      const mid = (otherEnd + opening.u) / 2
      u0 = Math.max(u0, otherEnd, mid)
    } else if (other.u >= openingEnd - 1e-9) {
      const mid = (openingEnd + other.u) / 2
      u1 = Math.min(u1, other.u, mid)
    }
  }
  if (u1 - u0 <= 1e-4) return null
  return { u0, u1, y0, y1 }
}

export function collectLintelSpans(floor: Floor, wall: Wall): LintelSpan[] {
  if (wall.skin === 'logical') return []
  const { uMin, uMax } = wallMeshURange(floor, wall, 0)
  if (uMax - uMin <= 1e-9) return []
  const system = systemOf(wall)
  const spans: LintelSpan[] = []
  for (const opening of wall.openings) {
    const others = wall.openings.filter((item) => item.id !== opening.id)
    const box = lintelBox(system, opening, others, uMin, uMax)
    if (!box) continue
    spans.push(box)
  }
  return spans
}

function carveSpan(
  span: BlockSpan,
  box: { u0: number; u1: number; y0: number; y1: number },
): BlockSpan[] {
  if (span.u1 <= box.u0 + 1e-9 || span.u0 >= box.u1 - 1e-9) return [span]
  if (span.y1 <= box.y0 + 1e-9 || span.y0 >= box.y1 - 1e-9) return [span]
  const parts: BlockSpan[] = []
  const push = (u0: number, u1: number, y0: number, y1: number) => {
    if (u1 - u0 > 1e-4 && y1 - y0 > 1e-4) {
      parts.push({ ...span, u0, u1, y0, y1 })
    }
  }
  if (span.u0 < box.u0) push(span.u0, Math.min(span.u1, box.u0), span.y0, span.y1)
  if (span.u1 > box.u1) push(Math.max(span.u0, box.u1), span.u1, span.y0, span.y1)
  const u0 = Math.max(span.u0, box.u0)
  const u1 = Math.min(span.u1, box.u1)
  if (span.y0 < box.y0) push(u0, u1, span.y0, Math.min(span.y1, box.y0))
  if (span.y1 > box.y1) push(u0, u1, Math.max(span.y0, box.y1), span.y1)
  return parts
}

function awayFromCorner(frame: WallFrame, cornerIsStart: boolean): Vec2 {
  if (cornerIsStart) return frame.dir
  return { x: -frame.dir.x, z: -frame.dir.z }
}

function leftWhenWalking(dir: Vec2): Vec2 {
  return { x: -dir.z, z: dir.x }
}

function intersectLines(
  o1: Vec2,
  d1: Vec2,
  o2: Vec2,
  d2: Vec2,
): { t1: number; t2: number } | null {
  const cross = d1.x * d2.z - d1.z * d2.x
  if (Math.abs(cross) < 1e-9) {
    return null
  }
  const dx = o2.x - o1.x
  const dz = o2.z - o1.z
  const t1 = (dx * d2.z - dz * d2.x) / cross
  const t2 = (dx * d1.z - dz * d1.x) / cross
  return { t1, t2 }
}

function wallsAtCorner(floor: Floor, cornerId: string, exceptWallId: string): Wall[] {
  return floor.walls.filter(
    (w) =>
      w.id !== exceptWallId &&
      (w.startCornerId === cornerId || w.endCornerId === cornerId),
  )
}

type LeafFace = 'center' | 'far' | 'near'

function bondFace(wallId: string, otherId: string, course: number): LeafFace {
  const through = course % 2 === 0 ? wallId < otherId : wallId > otherId
  return through ? 'far' : 'near'
}

function faceOffset(wall: Wall, mateSide: number, face: LeafFace): number {
  const system = systemOf(wall)
  const offset = leafOffset(system)
  if (wall.skin === 'single' || face === 'center') {
    return wall.skin === 'single' ? 0 : mateSide * offset
  }
  const half = face === 'far' ? system.leafThickness / 2 : -system.leafThickness / 2
  return mateSide * (offset + half)
}

function miterUAtCorner(
  floor: Floor,
  wall: Wall,
  frame: WallFrame,
  cornerId: string,
  leafSign: number,
  faceFor: (otherId: string) => LeafFace,
): number | null {
  const cornerIsStart = wall.startCornerId === cornerId
  const cornerIsEnd = wall.endCornerId === cornerId
  if (!cornerIsStart && !cornerIsEnd) return null
  const corner = cornerById(floor, cornerId)
  const away = awayFromCorner(frame, cornerIsStart)
  const side = cornerIsStart ? leafSign : -leafSign
  const selfLeft = leftWhenWalking(away)
  const selfOffset = leafOffset(systemOf(wall))
  const selfOrigin = {
    x: corner.x + side * selfOffset * selfLeft.x,
    z: corner.z + side * selfOffset * selfLeft.z,
  }
  let best: {
    dist: number
    other: Wall
    otherAway: Vec2
    otherLeft: Vec2
    mateSide: number
  } | null = null
  for (const other of wallsAtCorner(floor, cornerId, wall.id)) {
    if (other.skin === 'logical') continue
    const otherFrame = buildFrame(floor, other)
    const otherIsStart = other.startCornerId === cornerId
    const otherAway = awayFromCorner(otherFrame, otherIsStart)
    const otherLeft = leftWhenWalking(otherAway)
    const cross = away.x * otherAway.z - away.z * otherAway.x
    if (Math.abs(cross) < 1e-8) continue
    const mateSide = -side
    const mateOffset = faceOffset(other, mateSide, 'center')
    const otherOrigin = {
      x: corner.x + mateOffset * otherLeft.x,
      z: corner.z + mateOffset * otherLeft.z,
    }
    const hit = intersectLines(selfOrigin, away, otherOrigin, otherAway)
    if (!hit) continue
    const px = selfOrigin.x + hit.t1 * away.x
    const pz = selfOrigin.z + hit.t1 * away.z
    const dist = Math.hypot(px - corner.x, pz - corner.z)
    if (dist > MITER_MAX_CORNER_DIST) continue
    if (!best || dist < best.dist) best = { dist, other, otherAway, otherLeft, mateSide }
  }
  if (!best) return null
  const mateOffset = faceOffset(best.other, best.mateSide, faceFor(best.other.id))
  const otherOrigin = {
    x: corner.x + mateOffset * best.otherLeft.x,
    z: corner.z + mateOffset * best.otherLeft.z,
  }
  const hit = intersectLines(selfOrigin, away, otherOrigin, best.otherAway)
  if (!hit) return null
  const px = selfOrigin.x + hit.t1 * away.x
  const pz = selfOrigin.z + hit.t1 * away.z
  if (Math.hypot(px - corner.x, pz - corner.z) > MITER_MAX_CORNER_DIST) return null
  return cornerIsStart ? hit.t1 : frame.length - hit.t1
}

export function wallMeshURange(
  floor: Floor,
  wall: Wall,
  leafSign: number,
  course?: number,
): { uMin: number; uMax: number } {
  const frame = buildFrame(floor, wall)
  const at = (cornerId: string, faceFor: (otherId: string) => LeafFace) =>
    miterUAtCorner(floor, wall, frame, cornerId, leafSign, faceFor)
  const resolve = (cornerId: string, pick: 'min' | 'max') => {
    if (leafSign === 0) {
      return at(cornerId, () => 'center')
    }
    if (course !== undefined) {
      return at(cornerId, (otherId) => bondFace(wall.id, otherId, course))
    }
    const values = [at(cornerId, () => 'far'), at(cornerId, () => 'near')].filter(
      (value): value is number => value !== null,
    )
    if (values.length === 0) return null
    return pick === 'min' ? Math.min(...values) : Math.max(...values)
  }
  return {
    uMin: resolve(wall.startCornerId, 'min') ?? 0,
    uMax: resolve(wall.endCornerId, 'max') ?? frame.length,
  }
}

function roomSideSign(floor: Floor, wall: Wall): number | null {
  const frame = buildFrame(floor, wall)
  if (frame.length < 1e-9) return null
  const rings: Ring[] = []
  for (const room of deriveRooms(floor)) {
    const ring: Ring = []
    for (const id of room.cornerIds) {
      const corner = floor.corners.find((item) => item.id === id)
      if (!corner) {
        ring.length = 0
        break
      }
      ring.push({ x: corner.x, z: corner.z })
    }
    if (ring.length >= 3) rings.push(ring)
  }
  if (rings.length === 0) return null
  const midX = frame.start.x + frame.dir.x * frame.length * 0.5
  const midZ = frame.start.z + frame.dir.z * frame.length * 0.5
  const probe = 0.05
  const inside = (sign: number) =>
    rings.some((ring) => pointInRing(ring, midX + frame.normal.x * sign * probe, midZ + frame.normal.z * sign * probe))
  const pos = inside(1)
  const neg = inside(-1)
  if (pos && !neg) return 1
  if (neg && !pos) return -1
  return null
}

function facadeLeafIndexes(floor: Floor, wall: Wall): number[] {
  const signs = leafSigns(wall.skin)
  if (wall.skin === 'single') return [0]
  const side = roomSideSign(floor, wall)
  if (side === null) return []
  const outer = -side
  const indexes: number[] = []
  signs.forEach((sign, index) => {
    if (sign === outer) indexes.push(index)
  })
  return indexes
}

export function collectWallBlockSpans(
  floor: Floor,
  wall: Wall,
  bottomSamples?: BottomSample[],
  facadeHead?: number,
): BlockSpan[] {
  if (wall.skin === 'logical') {
    return []
  }
  const system = systemOf(wall)
  const courseHeight = system.courseHeight
  const spans: BlockSpan[] = []
  const signs = leafSigns(wall.skin)
  const facing =
    facadeHead !== undefined && facadeHead > WALL_HEAD + 1e-6
      ? new Set(facadeLeafIndexes(floor, wall))
      : new Set<number>()
  for (let leaf = 0; leaf < signs.length; leaf++) {
    const leafSign = signs[leaf]
    const head = facing.has(leaf) && facadeHead !== undefined ? snapToCourse(system, facadeHead, 'ceil') : WALL_HEAD
    const courseLimit = courseCount(system, head)
    for (let course = 0; course < courseLimit; course++) {
      const { uMin, uMax } = wallMeshURange(floor, wall, leafSign, course)
      if (uMax - uMin <= 1e-9) {
        continue
      }
      let solids = [{ u0: uMin, u1: uMax }]
      for (const opening of wall.openings) {
        const gap = openingGapU(opening)
        const next: { u0: number; u1: number }[] = []
        for (const solid of solids) {
          if (!openingAffectsCourse(opening, course, courseHeight, bottomSamples, solid.u0, solid.u1)) {
            next.push(solid)
            continue
          }
          next.push(...subtractInterval(solid, { u0: gap.u0, u1: gap.u1 }))
        }
        solids = next
      }
      for (const solid of solids) {
        const uShift = course % 2 === 1 ? system.moduleLength / 2 : 0
        for (const block of splitBlockRuns(solid.u0, solid.u1, system.moduleLength, uShift)) {
          const range = courseVerticalRange(course, courseHeight, block.u0, block.u1, bottomSamples)
          if (!range) continue
          const y0 = range.y0
          const y1 = Math.min(range.y1, head)
          if (y1 - y0 <= 1e-4) continue
          spans.push({
            u0: block.u0,
            u1: block.u1,
            course,
            leaf,
            y0,
            y1,
          })
        }
      }
    }
  }
  for (const lintel of collectLintelSpans(floor, wall)) {
    const next: BlockSpan[] = []
    for (const span of spans) {
      next.push(...carveSpan(span, lintel))
    }
    spans.length = 0
    spans.push(...next)
  }
  return spans
}

function spanContainsPoint(span: BlockSpan, u: number, y: number, leaf: number): boolean {
  return span.leaf === leaf && u >= span.u0 && u <= span.u1 && y >= span.y0 && y <= span.y1
}

export function wallSolidContains(
  floor: Floor,
  wall: Wall,
  u: number,
  y: number,
  leaf: number,
  bottomSamples?: BottomSample[],
): boolean {
  const spans = collectWallBlockSpans(floor, wall, bottomSamples)
  return spans.some((s) => spanContainsPoint(s, u, y, leaf))
}

function placeBox(
  frame: WallFrame,
  u0: number,
  u1: number,
  y0: number,
  y1: number,
  unitBox: BoxGeometry,
  matrix: Matrix4,
  parts: BufferGeometry[],
  thickness: number,
  along: number,
): void {
  const uCenter = (u0 + u1) / 2
  const yCenter = (y0 + y1) / 2
  const blockLen = u1 - u0
  const blockH = y1 - y0
  const cx = frame.start.x + uCenter * frame.dir.x + along * frame.normal.x
  const cz = frame.start.z + uCenter * frame.dir.z + along * frame.normal.z
  const geom = unitBox.clone()
  matrix.identity()
  const xUnit = new Vector3(frame.dir.x, 0, frame.dir.z).normalize()
  const yUnit = new Vector3(0, 1, 0)
  const zUnit = new Vector3(frame.normal.x, 0, frame.normal.z).normalize()
  matrix.makeBasis(xUnit, yUnit, zUnit)
  matrix.scale(new Vector3(blockLen, blockH, thickness))
  matrix.setPosition(cx, yCenter, cz)
  geom.applyMatrix4(matrix)
  parts.push(geom)
}

export function buildWallGeometries(
  floor: Floor,
  wall: Wall,
  bottomSamples?: BottomSample[],
  facadeHead?: number,
): BufferGeometry[] {
  if (wall.skin === 'logical') {
    return []
  }
  const frame = buildFrame(floor, wall)
  const system = systemOf(wall)
  const signs = leafSigns(wall.skin)
  const spans = collectWallBlockSpans(floor, wall, bottomSamples, facadeHead)
  const unitBox = new BoxGeometry(1, 1, 1)
  const matrix = new Matrix4()
  const out: BufferGeometry[] = []

  for (let leaf = 0; leaf < signs.length; leaf++) {
    const along = signs[leaf] * leafOffset(system)
    const parts: BufferGeometry[] = []
    for (const span of spans) {
      if (span.leaf !== leaf) {
        continue
      }
      placeBox(frame, span.u0, span.u1, span.y0, span.y1, unitBox, matrix, parts, system.leafThickness, along)
    }
    if (parts.length === 0) {
      continue
    }
    const merged = mergeGeometries(parts, false)
    for (const g of parts) {
      g.dispose()
    }
    if (merged) {
      out.push(merged)
    }
  }
  unitBox.dispose()
  return out
}

const COURSE_FACE_DEPTH = 0.003

function insetBrick(span: BlockSpan): { u0: number; u1: number; y0: number; y1: number } | null {
  const half = MORTAR_JOINT / 2
  const u0 = span.u0 + half
  const u1 = span.u1 - half
  const y0 = span.y0 + half
  const y1 = span.y1 - half
  if (u1 - u0 > 1e-4 && y1 - y0 > 1e-4) return { u0, u1, y0, y1 }
  if (span.u1 - span.u0 <= 1e-4 || span.y1 - span.y0 <= 1e-4) return null
  return { u0: span.u0, u1: span.u1, y0: span.y0, y1: span.y1 }
}

function outerFaceCenters(system: WallSystem, leafSign: number): number[] {
  const reach = system.leafThickness / 2 + COURSE_FACE_DEPTH / 2
  if (leafSign === 0) return [reach, -reach]
  return [Math.sign(leafSign) * (leafOffset(system) + reach)]
}

export function buildCourseFaceGeometries(
  floor: Floor,
  wall: Wall,
  bottomSamples?: BottomSample[],
  facadeHead?: number,
): BufferGeometry[] {
  if (wall.skin === 'logical') return []
  const frame = buildFrame(floor, wall)
  const system = systemOf(wall)
  const signs = leafSigns(wall.skin)
  const spans = collectWallBlockSpans(floor, wall, bottomSamples, facadeHead)
  const unitBox = new BoxGeometry(1, 1, 1)
  const matrix = new Matrix4()
  const out: BufferGeometry[] = []
  for (let leaf = 0; leaf < signs.length; leaf++) {
    for (const center of outerFaceCenters(system, signs[leaf])) {
      const parts: BufferGeometry[] = []
      for (const span of spans) {
        if (span.leaf !== leaf) continue
        const face = insetBrick(span)
        if (!face) continue
        placeBox(frame, face.u0, face.u1, face.y0, face.y1, unitBox, matrix, parts, COURSE_FACE_DEPTH, center)
      }
      if (parts.length === 0) continue
      const merged = mergeGeometries(parts, false)
      for (const g of parts) g.dispose()
      if (merged) out.push(merged)
    }
  }
  unitBox.dispose()
  return out
}

// Plaster or bagging stands this proud of the masonry, enough to cover the brick faces.
export const FINISH_SKIN_M = 0.012

export type FaceRun = { u0: number; u1: number; y0: number; y1: number }

// The solid wall showing on one face: its blocks joined into runs along each course, and the lintels over openings.
export function faceRuns(floor: Floor, wall: Wall, side: 1 | -1, bottomSamples?: BottomSample[], facadeHead?: number): FaceRun[] {
  if (wall.skin === 'logical') return []
  const signs = leafSigns(wall.skin)
  const leaf = signs.length === 1 ? 0 : signs.indexOf(side)
  if (leaf < 0) return []
  const spans = collectWallBlockSpans(floor, wall, bottomSamples, facadeHead)
    .filter((span) => span.leaf === leaf)
    .sort((a, b) => a.y0 - b.y0 || a.y1 - b.y1 || a.u0 - b.u0)
  const runs: FaceRun[] = []
  for (const span of spans) {
    const last = runs[runs.length - 1]
    if (last && Math.abs(last.y0 - span.y0) < 1e-6 && Math.abs(last.y1 - span.y1) < 1e-6 && Math.abs(last.u1 - span.u0) < 1e-6) last.u1 = span.u1
    else runs.push({ u0: span.u0, u1: span.u1, y0: span.y0, y1: span.y1 })
  }
  for (const lintel of collectLintelSpans(floor, wall)) runs.push({ u0: lintel.u0, u1: lintel.u1, y0: lintel.y0, y1: lintel.y1 })
  return runs
}

export function faceArea(floor: Floor, wall: Wall, side: 1 | -1): number {
  return faceRuns(floor, wall, side).reduce((sum, run) => sum + (run.u1 - run.u0) * (run.y1 - run.y0), 0)
}

// A thin skin over one face of a wall, for plaster or bagging: the face's solid runs, standing just proud of it.
export function buildFinishSkin(floor: Floor, wall: Wall, side: 1 | -1, bottomSamples?: BottomSample[], facadeHead?: number): BufferGeometry | null {
  const runs = faceRuns(floor, wall, side, bottomSamples, facadeHead)
  if (runs.length === 0) return null
  const frame = buildFrame(floor, wall)
  const along = side * (outerReach(systemOf(wall)) + FINISH_SKIN_M / 2)
  const unitBox = new BoxGeometry(1, 1, 1)
  const matrix = new Matrix4()
  const parts: BufferGeometry[] = []
  for (const run of runs) placeBox(frame, run.u0, run.u1, run.y0, run.y1, unitBox, matrix, parts, FINISH_SKIN_M, along)
  const merged = mergeGeometries(parts, false)
  for (const part of parts) part.dispose()
  unitBox.dispose()
  return merged
}

export function buildLintelGeometry(
  floor: Floor,
  wall: Wall,
): BufferGeometry | null {
  if (wall.skin === 'logical') return null
  const spans = collectLintelSpans(floor, wall)
  if (spans.length === 0) return null
  const frame = buildFrame(floor, wall)
  const thickness = wallThickness(systemOf(wall))
  const unitBox = new BoxGeometry(1, 1, 1)
  const matrix = new Matrix4()
  const parts: BufferGeometry[] = []
  for (const span of spans) {
    placeBox(frame, span.u0, span.u1, span.y0, span.y1, unitBox, matrix, parts, thickness, 0)
  }
  unitBox.dispose()
  if (parts.length === 0) return null
  const merged = mergeGeometries(parts, false)
  for (const g of parts) g.dispose()
  return merged ?? null
}

export function geometryTriangleCount(geometry: BufferGeometry): number {
  const index = geometry.getIndex()
  if (index) {
    return index.count / 3
  }
  const pos = geometry.getAttribute('position')
  return pos ? pos.count / 3 : 0
}

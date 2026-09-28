import { BLOCK_THICKNESS, CAVITY } from '../plot/fixture'
import type { Floor, Wall } from '../model/types'
import { BoxGeometry, BufferGeometry, Matrix4, Vector3 } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

export const FRAME_SECTION = 0.05
export const FRAME_DEPTH = BLOCK_THICKNESS
export const GLASS_THICKNESS = 0.008
export const GLASS_INSET = 0.01
export const FRAME_COLOUR = '#4a4f54'
export const GLASS_COLOUR = '#9eb8c8'
export const GLASS_OPACITY = 0.35

const LEAF_OFFSET = CAVITY / 2 + BLOCK_THICKNESS / 2

export type OpeningRect = {
  u: number
  v: number
  width: number
  height: number
}

export type FrameMemberSpan = {
  u0: number
  u1: number
  y0: number
  y1: number
}

export type OpeningFrameLayout = {
  outer: FrameMemberSpan
  inner: FrameMemberSpan
  members: FrameMemberSpan[]
  glass: FrameMemberSpan
}

type Vec2 = { x: number; z: number }
type WallFrame = {
  start: Vec2
  dir: Vec2
  normal: Vec2
  length: number
}

export function openingFrameLayout(opening: OpeningRect): OpeningFrameLayout | null {
  if (opening.width < 2 * FRAME_SECTION + 2 * GLASS_INSET + 1e-6) return null
  if (opening.height < 2 * FRAME_SECTION + 2 * GLASS_INSET + 1e-6) return null
  const u0 = opening.u
  const u1 = opening.u + opening.width
  const y0 = opening.v
  const y1 = opening.v + opening.height
  const outer = { u0, u1, y0, y1 }
  const inner = {
    u0: u0 + FRAME_SECTION,
    u1: u1 - FRAME_SECTION,
    y0: y0 + FRAME_SECTION,
    y1: y1 - FRAME_SECTION,
  }
  const members: FrameMemberSpan[] = [
    { u0, u1, y0, y1: y0 + FRAME_SECTION },
    { u0, u1, y0: y1 - FRAME_SECTION, y1 },
    { u0, u1: u0 + FRAME_SECTION, y0: y0 + FRAME_SECTION, y1: y1 - FRAME_SECTION },
    { u0: u1 - FRAME_SECTION, u1, y0: y0 + FRAME_SECTION, y1: y1 - FRAME_SECTION },
  ]
  const glass = {
    u0: inner.u0 + GLASS_INSET,
    u1: inner.u1 - GLASS_INSET,
    y0: inner.y0 + GLASS_INSET,
    y1: inner.y1 - GLASS_INSET,
  }
  return { outer, inner, members, glass }
}

function cornerById(floor: Floor, id: string): Vec2 {
  const c = floor.corners.find((x) => x.id === id)
  if (!c) {
    throw new Error(`missing corner ${id}`)
  }
  return { x: c.x, z: c.z }
}

function buildWallFrame(floor: Floor, wall: Wall): WallFrame {
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

function outerLeafSign(skin: Wall['skin']): number {
  if (skin === 'single') return 0
  return 1
}

function placeBox(
  frame: WallFrame,
  u0: number,
  u1: number,
  y0: number,
  y1: number,
  leafSign: number,
  depth: number,
  depthBias: number,
  unitBox: BoxGeometry,
  matrix: Matrix4,
  parts: BufferGeometry[],
): void {
  const uCenter = (u0 + u1) / 2
  const yCenter = (y0 + y1) / 2
  const blockLen = u1 - u0
  const blockH = y1 - y0
  const cx =
    frame.start.x +
    uCenter * frame.dir.x +
    (leafSign * LEAF_OFFSET + depthBias) * frame.normal.x
  const cz =
    frame.start.z +
    uCenter * frame.dir.z +
    (leafSign * LEAF_OFFSET + depthBias) * frame.normal.z
  const geom = unitBox.clone()
  matrix.identity()
  const xUnit = new Vector3(frame.dir.x, 0, frame.dir.z).normalize()
  const yUnit = new Vector3(0, 1, 0)
  const zUnit = new Vector3(frame.normal.x, 0, frame.normal.z).normalize()
  matrix.makeBasis(xUnit, yUnit, zUnit)
  matrix.scale(new Vector3(blockLen, blockH, depth))
  matrix.setPosition(cx, yCenter, cz)
  geom.applyMatrix4(matrix)
  parts.push(geom)
}

function mergeParts(parts: BufferGeometry[], unitBox: BoxGeometry): BufferGeometry | null {
  unitBox.dispose()
  if (parts.length === 0) return null
  const merged = mergeGeometries(parts, false)
  for (const g of parts) g.dispose()
  return merged ?? null
}

export function buildOpeningFrameGeometry(
  floor: Floor,
  wall: Wall,
): BufferGeometry | null {
  if (wall.skin === 'logical') return null
  const openings = wall.openings
  if (openings.length === 0) return null
  const wallFrame = buildWallFrame(floor, wall)
  const leafSign = outerLeafSign(wall.skin)
  const unitBox = new BoxGeometry(1, 1, 1)
  const matrix = new Matrix4()
  const parts: BufferGeometry[] = []
  for (const opening of openings) {
    const layout = openingFrameLayout(opening)
    if (!layout) continue
    for (const member of layout.members) {
      placeBox(
        wallFrame,
        member.u0,
        member.u1,
        member.y0,
        member.y1,
        leafSign,
        FRAME_DEPTH,
        0,
        unitBox,
        matrix,
        parts,
      )
    }
  }
  return mergeParts(parts, unitBox)
}

export function buildOpeningGlassGeometry(
  floor: Floor,
  wall: Wall,
): BufferGeometry | null {
  if (wall.skin === 'logical') return null
  const openings = wall.openings
  if (openings.length === 0) return null
  const wallFrame = buildWallFrame(floor, wall)
  const leafSign = outerLeafSign(wall.skin)
  const depthBias = -(FRAME_DEPTH / 2 - GLASS_THICKNESS / 2 - 0.004)
  const unitBox = new BoxGeometry(1, 1, 1)
  const matrix = new Matrix4()
  const parts: BufferGeometry[] = []
  for (const opening of openings) {
    const layout = openingFrameLayout(opening)
    if (!layout) continue
    placeBox(
      wallFrame,
      layout.glass.u0,
      layout.glass.u1,
      layout.glass.y0,
      layout.glass.y1,
      leafSign,
      GLASS_THICKNESS,
      depthBias,
      unitBox,
      matrix,
      parts,
    )
  }
  return mergeParts(parts, unitBox)
}

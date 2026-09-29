import { BLOCK_HEIGHT, BLOCK_THICKNESS, CAVITY } from '../plot/fixture'
import type { Floor, OpeningKind, Wall } from '../model/types'
import { BoxGeometry, BufferGeometry, Matrix4, Vector3 } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

export const FRAME_SECTION = 0.05
export const FRAME_DEPTH = BLOCK_THICKNESS
export const GLASS_THICKNESS = 0.008
export const GLASS_INSET = 0.01
export const WINDOW_PANE_MAX = 0.9
export const DOOR_PANEL_MAX = 1.2
export const EXTERNAL_LEAF_MAX = 1
export const INTERNAL_LEAF_MAX = 0.9
export const GARAGE_PANEL_MAX = 0.5
const DOOR_STILE = 0.09
const DOOR_MUNTIN = 0.09
const DOOR_TOP_RAIL = 0.09
const DOOR_LOCK_RAIL = 0.14
const DOOR_BOTTOM_RAIL = 0.18
const DOOR_PANEL_MIN = 0.05
export const FRAME_COLOUR = '#4a4f54'
export const GLASS_COLOUR = '#9eb8c8'
export const GLASS_OPACITY = 0.35
export const EXTERNAL_DOOR_COLOUR = '#ffffff'
export const INTERNAL_DOOR_COLOUR = '#d7c4a3'
export const GARAGE_DOOR_COLOUR = '#e4e7ea'

const LEAF_OFFSET = CAVITY / 2 + BLOCK_THICKNESS / 2

export type OpeningRect = {
  u: number
  v: number
  width: number
  height: number
  kind?: OpeningKind
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
  glass: FrameMemberSpan[]
  panels: FrameMemberSpan[]
}

type Vec2 = { x: number; z: number }
type WallFrame = {
  start: Vec2
  dir: Vec2
  normal: Vec2
  length: number
}

function paneLimit(kind: OpeningKind | undefined): number {
  return kind === 'door' ? DOOR_PANEL_MAX : WINDOW_PANE_MAX
}

function panelCount(innerWidth: number, maxPane: number): number {
  let count = 1
  while (count < 12) {
    const pane = (innerWidth - (count - 1) * FRAME_SECTION) / count
    if (pane <= maxPane + 1e-9) return count
    count += 1
  }
  return count
}

function splitSpan(
  span: FrameMemberSpan,
  count: number,
  along: 'u' | 'y',
): { bars: FrameMemberSpan[]; cells: FrameMemberSpan[] } {
  const bars: FrameMemberSpan[] = []
  const cells: FrameMemberSpan[] = []
  const extent = along === 'u' ? span.u1 - span.u0 : span.y1 - span.y0
  const cell = (extent - (count - 1) * FRAME_SECTION) / count
  for (let i = 0; i < count; i++) {
    const start = (along === 'u' ? span.u0 : span.y0) + i * (cell + FRAME_SECTION)
    const end = start + cell
    if (i > 0) {
      bars.push(
        along === 'u'
          ? { u0: start - FRAME_SECTION, u1: start, y0: span.y0, y1: span.y1 }
          : { u0: span.u0, u1: span.u1, y0: start - FRAME_SECTION, y1: start },
      )
    }
    cells.push(
      along === 'u'
        ? { u0: start, u1: end, y0: span.y0, y1: span.y1 }
        : { u0: span.u0, u1: span.u1, y0: start, y1: end },
    )
  }
  return { bars, cells }
}

function fourPanelLeaf(leaf: FrameMemberSpan): { bars: FrameMemberSpan[]; cells: FrameMemberSpan[] } {
  const width = leaf.u1 - leaf.u0
  const height = leaf.y1 - leaf.y0
  const bars: FrameMemberSpan[] = []
  const cells: FrameMemberSpan[] = []
  if (
    width < DOOR_STILE * 2 + DOOR_MUNTIN + 2 * DOOR_PANEL_MIN ||
    height < DOOR_TOP_RAIL + DOOR_LOCK_RAIL + DOOR_BOTTOM_RAIL + 2 * DOOR_PANEL_MIN
  ) {
    cells.push(leaf)
    return { bars, cells }
  }
  const innerU0 = leaf.u0 + DOOR_STILE
  const innerU1 = leaf.u1 - DOOR_STILE
  const upper = (height - DOOR_TOP_RAIL - DOOR_LOCK_RAIL - DOOR_BOTTOM_RAIL) / 3
  const lockY0 = leaf.y0 + DOOR_BOTTOM_RAIL + upper * 2
  const lockY1 = lockY0 + DOOR_LOCK_RAIL
  const topY0 = leaf.y1 - DOOR_TOP_RAIL
  const midU0 = (leaf.u0 + leaf.u1) / 2 - DOOR_MUNTIN / 2
  const midU1 = midU0 + DOOR_MUNTIN
  const bottomY1 = leaf.y0 + DOOR_BOTTOM_RAIL
  bars.push(
    { u0: leaf.u0, u1: innerU0, y0: leaf.y0, y1: leaf.y1 },
    { u0: innerU1, u1: leaf.u1, y0: leaf.y0, y1: leaf.y1 },
    { u0: innerU0, u1: innerU1, y0: topY0, y1: leaf.y1 },
    { u0: innerU0, u1: innerU1, y0: lockY0, y1: lockY1 },
    { u0: innerU0, u1: innerU1, y0: leaf.y0, y1: bottomY1 },
    { u0: midU0, u1: midU1, y0: lockY1, y1: topY0 },
    { u0: midU0, u1: midU1, y0: bottomY1, y1: lockY0 },
  )
  cells.push(
    { u0: innerU0, u1: midU0, y0: lockY1, y1: topY0 },
    { u0: midU1, u1: innerU1, y0: lockY1, y1: topY0 },
    { u0: innerU0, u1: midU0, y0: bottomY1, y1: lockY0 },
    { u0: midU1, u1: innerU1, y0: bottomY1, y1: lockY0 },
  )
  return { bars, cells }
}

function insetGlass(cell: FrameMemberSpan): FrameMemberSpan {
  return {
    u0: cell.u0 + GLASS_INSET,
    u1: cell.u1 - GLASS_INSET,
    y0: cell.y0 + GLASS_INSET,
    y1: cell.y1 - GLASS_INSET,
  }
}

function sillBearingY(openingV: number): number {
  const joint = Math.floor((openingV + 1e-9) / BLOCK_HEIGHT) * BLOCK_HEIGHT
  if (joint < openingV) return joint
  return openingV
}

export function openingFrameLayout(opening: OpeningRect): OpeningFrameLayout | null {
  if (opening.width < 2 * FRAME_SECTION + 2 * GLASS_INSET + 1e-6) return null
  if (opening.height < 2 * FRAME_SECTION + 2 * GLASS_INSET + 1e-6) return null
  const u0 = opening.u
  const u1 = opening.u + opening.width
  const openingY0 = opening.v
  const y0 = sillBearingY(opening.v)
  const y1 = opening.v + opening.height
  const innerY0 = openingY0 + FRAME_SECTION
  const outer = { u0, u1, y0, y1 }
  const inner = {
    u0: u0 + FRAME_SECTION,
    u1: u1 - FRAME_SECTION,
    y0: innerY0,
    y1: y1 - FRAME_SECTION,
  }
  const members: FrameMemberSpan[] = [
    { u0, u1, y0, y1: innerY0 },
    { u0, u1, y0: y1 - FRAME_SECTION, y1 },
    { u0, u1: u0 + FRAME_SECTION, y0, y1: y1 - FRAME_SECTION },
    { u0: u1 - FRAME_SECTION, u1, y0, y1: y1 - FRAME_SECTION },
  ]
  const glass: FrameMemberSpan[] = []
  const panels: FrameMemberSpan[] = []
  const bay = { u0: inner.u0, u1: inner.u1, y0: inner.y0, y1: inner.y1 }
  if (opening.kind === 'external-door' || opening.kind === 'internal-door') {
    const maxLeaf = opening.kind === 'internal-door' ? INTERNAL_LEAF_MAX : EXTERNAL_LEAF_MAX
    const leaves = splitSpan(bay, panelCount(inner.u1 - inner.u0, maxLeaf), 'u')
    members.push(...leaves.bars)
    for (const leaf of leaves.cells) {
      const door = fourPanelLeaf(leaf)
      members.push(...door.bars)
      panels.push(...door.cells)
    }
  } else if (opening.kind === 'garage') {
    const split = splitSpan(bay, panelCount(inner.y1 - inner.y0, GARAGE_PANEL_MAX), 'y')
    members.push(...split.bars)
    panels.push(...split.cells)
  } else {
    const split = splitSpan(bay, panelCount(inner.u1 - inner.u0, paneLimit(opening.kind)), 'u')
    members.push(...split.bars)
    glass.push(...split.cells.map(insetGlass))
  }
  return { outer, inner, members, glass, panels }
}

function gradeAt(u: number, samples: { u: number; y: number }[] | undefined): number {
  if (!samples || samples.length === 0) return -Infinity
  const sorted = [...samples].sort((a, b) => a.u - b.u)
  if (u <= sorted[0].u) return sorted[0].y
  const last = sorted[sorted.length - 1]
  if (u >= last.u) return last.y
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]
    const b = sorted[i + 1]
    if (u >= a.u && u <= b.u) {
      const t = (u - a.u) / (b.u - a.u)
      return a.y + t * (b.y - a.y)
    }
  }
  return sorted[0].y
}

function clipToWallBottom(
  span: FrameMemberSpan,
  samples: { u: number; y: number }[] | undefined,
): FrameMemberSpan | null {
  const y0 = Math.max(span.y0, gradeAt((span.u0 + span.u1) / 2, samples))
  if (span.y1 - y0 <= 1e-4) return null
  return { ...span, y0 }
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
  bottomSamples?: { u: number; y: number }[],
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
      const visible = clipToWallBottom(member, bottomSamples)
      if (!visible) continue
      placeBox(
        wallFrame,
        visible.u0,
        visible.u1,
        visible.y0,
        visible.y1,
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
  bottomSamples?: { u: number; y: number }[],
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
    for (const pane of layout.glass) {
      const glass = clipToWallBottom(pane, bottomSamples)
      if (!glass) continue
      placeBox(
        wallFrame,
        glass.u0,
        glass.u1,
        glass.y0,
        glass.y1,
        leafSign,
        GLASS_THICKNESS,
        depthBias,
        unitBox,
        matrix,
        parts,
      )
    }
  }
  return mergeParts(parts, unitBox)
}

export type OpeningPanelMesh = { color: string; geometry: BufferGeometry; emissive: string }

function panelFinish(kind: OpeningKind | undefined): { color: string; emissive: string } | null {
  if (kind === 'external-door') return { color: EXTERNAL_DOOR_COLOUR, emissive: '#ffffff' }
  if (kind === 'internal-door') return { color: INTERNAL_DOOR_COLOUR, emissive: '#000000' }
  if (kind === 'garage') return { color: GARAGE_DOOR_COLOUR, emissive: '#000000' }
  return null
}

function panelDepth(kind: OpeningKind | undefined): number {
  if (kind === 'internal-door') return 0.028
  if (kind === 'garage') return 0.032
  return 0.044
}

export function buildOpeningPanelMeshes(
  floor: Floor,
  wall: Wall,
  bottomSamples?: { u: number; y: number }[],
): OpeningPanelMesh[] {
  if (wall.skin === 'logical') return []
  const openings = wall.openings
  if (openings.length === 0) return []
  const wallFrame = buildWallFrame(floor, wall)
  const leafSign = outerLeafSign(wall.skin)
  const groups = new Map<string, { color: string; emissive: string; depth: number; spans: FrameMemberSpan[] }>()
  for (const opening of openings) {
    const finish = panelFinish(opening.kind)
    const layout = openingFrameLayout(opening)
    if (!finish || !layout) continue
    const group = groups.get(finish.color) ?? { ...finish, depth: panelDepth(opening.kind), spans: [] }
    for (const panel of layout.panels) {
      const visible = clipToWallBottom(panel, bottomSamples)
      if (visible) group.spans.push(visible)
    }
    groups.set(finish.color, group)
  }
  const meshes: OpeningPanelMesh[] = []
  for (const group of groups.values()) {
    if (group.spans.length === 0) continue
    const unitBox = new BoxGeometry(1, 1, 1)
    const matrix = new Matrix4()
    const parts: BufferGeometry[] = []
    for (const span of group.spans) {
      placeBox(
        wallFrame,
        span.u0,
        span.u1,
        span.y0,
        span.y1,
        leafSign,
        group.depth,
        0,
        unitBox,
        matrix,
        parts,
      )
    }
    const geometry = mergeParts(parts, unitBox)
    if (geometry) meshes.push({ color: group.color, emissive: group.emissive, geometry })
  }
  return meshes
}

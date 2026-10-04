import { BoxGeometry, BufferGeometry, Matrix4, Vector3 } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { fencePosts, fenceSpec } from '../model/fences'
import type { Fence, Floor, Wall } from '../model/types'

export type FencePart = {
  geometry: BufferGeometry
  colour: string
  opacity: number
  roughness?: number
  metalness?: number
  emissive?: string
  emissiveIntensity?: number
}

type Frame = { start: { x: number; z: number }; dir: { x: number; z: number }; normal: { x: number; z: number }; length: number }

export function fenceFrame(floor: Floor, wall: Wall): Frame | null {
  const a = floor.corners.find((corner) => corner.id === wall.startCornerId)
  const b = floor.corners.find((corner) => corner.id === wall.endCornerId)
  if (!a || !b) return null
  const length = Math.hypot(b.x - a.x, b.z - a.z)
  if (length < 1e-6) return null
  const dir = { x: (b.x - a.x) / length, z: (b.z - a.z) / length }
  return { start: { x: a.x, z: a.z }, dir, normal: { x: -dir.z, z: dir.x }, length }
}

type Box = { u0: number; u1: number; y0: number; y1: number; depth: number; offset?: number }

function place(frame: Frame, boxes: Box[]): BufferGeometry | null {
  if (boxes.length === 0) return null
  const unit = new BoxGeometry(1, 1, 1)
  const matrix = new Matrix4()
  const along = new Vector3(frame.dir.x, 0, frame.dir.z)
  const up = new Vector3(0, 1, 0)
  const side = new Vector3(frame.normal.x, 0, frame.normal.z)
  const parts: BufferGeometry[] = []
  for (const box of boxes) {
    const w = box.u1 - box.u0
    const h = box.y1 - box.y0
    if (w <= 1e-5 || h <= 1e-5) continue
    const u = (box.u0 + box.u1) / 2
    const n = box.offset ?? 0
    const geometry = unit.clone()
    matrix.makeBasis(along, up, side)
    matrix.scale(new Vector3(w, h, box.depth))
    matrix.setPosition(
      frame.start.x + frame.dir.x * u + frame.normal.x * n,
      (box.y0 + box.y1) / 2,
      frame.start.z + frame.dir.z * u + frame.normal.z * n,
    )
    geometry.applyMatrix4(matrix)
    parts.push(geometry)
  }
  unit.dispose()
  if (parts.length === 0) return null
  const merged = mergeGeometries(parts, false)
  for (const part of parts) part.dispose()
  return merged ?? null
}

function repeat(u0: number, u1: number, pitch: number, width: number): number[] {
  const out: number[] = []
  const count = Math.floor((u1 - u0 - width) / pitch)
  const used = count * pitch + width
  const start = u0 + (u1 - u0 - used) / 2
  for (let i = 0; i <= count; i++) out.push(start + i * pitch)
  return out
}

export function buildFenceParts(frame: Frame, fence: Fence, baseAt: (u: number) => number): FencePart[] {
  const spec = fenceSpec(fence.type)
  const posts = fencePosts(frame.length, spec)
  const h = fence.height
  const half = spec.postSize / 2
  const postBoxes: Box[] = posts.map((u) => ({
    u0: Math.max(0, u - half),
    u1: Math.min(frame.length, u + half),
    y0: baseAt(u) - 0.05,
    y1: baseAt(u) + h + (fence.type === 'precast' ? 0.05 : 0),
    depth: spec.postSize,
  }))
  const infill: Box[] = []
  const rails: Box[] = []
  const panel: Box[] = []
  if (fence.type === 'half-wall') {
    // One length of wall, stepped down the slope in 1.2 m lengths, under a coping a little wider than it.
    const lengths = Math.max(1, Math.ceil(frame.length / 1.2))
    for (let i = 0; i < lengths; i++) {
      const [a, b] = [(frame.length * i) / lengths, (frame.length * (i + 1)) / lengths]
      const base = Math.min(baseAt(a), baseAt(b))
      const top = Math.max(baseAt(a), baseAt(b)) + h
      infill.push({ u0: a, u1: b, y0: base - 0.05, y1: top - 0.05, depth: spec.postSize })
      rails.push({ u0: a, u1: b, y0: top - 0.05, y1: top, depth: spec.postSize + 0.06 })
    }
  }
  for (let i = 0; i < posts.length - 1; i++) {
    const a = posts[i] + half
    const b = posts[i + 1] - half
    const base = baseAt((a + b) / 2)
    if (fence.type === 'palisade' || fence.type === 'timber') {
      const railDepth = fence.type === 'palisade' ? 0.04 : 0.05
      for (const level of [0.25, h - 0.3]) {
        rails.push({ u0: a, u1: b, y0: base + level, y1: base + level + 0.06, depth: railDepth, offset: 0.03 })
      }
      const pitch = fence.type === 'palisade' ? 0.14 : 0.1
      const width = fence.type === 'palisade' ? 0.065 : 0.07
      for (const u of repeat(a, b, pitch, width)) {
        const ground = baseAt(u + width / 2)
        infill.push({ u0: u, u1: u + width, y0: ground + 0.05, y1: ground + h - 0.06, depth: 0.02, offset: -0.01 })
        const tip = fence.type === 'palisade' ? 0.022 : width / 2
        infill.push({ u0: u + width / 2 - tip, u1: u + width / 2 + tip, y0: ground + h - 0.06, y1: ground + h, depth: 0.02, offset: -0.01 })
      }
    } else if (fence.type === 'precast') {
      const course = 0.5
      const slabs = Math.max(1, Math.round((h - 0.05) / course))
      const step = (h - 0.05) / slabs
      for (let k = 0; k < slabs; k++) {
        infill.push({ u0: a, u1: b, y0: base + k * step, y1: base + (k + 1) * step - 0.012, depth: 0.05 })
      }
    } else {
      for (const u of repeat(a, b, 0.076, 0.004)) {
        const ground = baseAt(u)
        infill.push({ u0: u, u1: u + 0.004, y0: ground + 0.03, y1: ground + h - 0.03, depth: 0.004 })
      }
      panel.push({ u0: a, u1: b, y0: base + 0.03, y1: base + h - 0.03, depth: 0.003 })
    }
  }
  const out: FencePart[] = []
  const postGeometry = place(frame, [...postBoxes, ...rails])
  if (postGeometry) out.push({ geometry: postGeometry, colour: spec.colour, opacity: 1 })
  const infillGeometry = place(frame, infill)
  if (infillGeometry) out.push({ geometry: infillGeometry, colour: spec.infill, opacity: 1 })
  const panelGeometry = place(frame, panel)
  if (panelGeometry) out.push({ geometry: panelGeometry, colour: spec.infill, opacity: 0.35 })
  return out
}

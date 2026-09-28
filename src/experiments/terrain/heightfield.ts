export const HEIGHTFIELD_ORIGIN_X = -4
export const HEIGHTFIELD_ORIGIN_Z = -4
export const HEIGHTFIELD_COLS = 28
export const HEIGHTFIELD_ROWS = 28
export const HEIGHTFIELD_CELL_SIZE = 1

export const BLOCK_HEIGHT = 0.215
export const DEFAULT_STOREY_HEIGHT = 2.4
export const BLOCK_THICKNESS = 0.1
export const CAVITY = 0.05
export const LEAF_CENTERLINE_OFFSET = CAVITY / 2 + BLOCK_THICKNESS / 2
export const WALL_SAMPLE_SPACING = Math.min(HEIGHTFIELD_CELL_SIZE, 0.25)

export function smoothstep(t: number): number {
  const c = Math.max(0, Math.min(1, t))
  return c * c * (3 - 2 * c)
}

export function heightAtGrid(c: number, r: number): number {
  return 0.04 * c + 1.6 * smoothstep((c + r) / 54)
}

function clampGridIndex(i: number): number {
  return Math.max(0, Math.min(HEIGHTFIELD_COLS - 1, i))
}

export function bilinearHeight(worldX: number, worldZ: number): number {
  const u = worldX - HEIGHTFIELD_ORIGIN_X
  const v = worldZ - HEIGHTFIELD_ORIGIN_Z
  const c0 = Math.floor(u)
  const r0 = Math.floor(v)
  const c1 = c0 + 1
  const r1 = r0 + 1
  const fu = u - c0
  const fv = v - r0
  const h00 = heightAtGrid(clampGridIndex(c0), clampGridIndex(r0))
  const h10 = heightAtGrid(clampGridIndex(c1), clampGridIndex(r0))
  const h01 = heightAtGrid(clampGridIndex(c0), clampGridIndex(r1))
  const h11 = heightAtGrid(clampGridIndex(c1), clampGridIndex(r1))
  const h0 = h00 * (1 - fu) + h10 * fu
  const h1 = h01 * (1 - fu) + h11 * fu
  return h0 * (1 - fv) + h1 * fv
}

export function sampleCenterlineXZ(
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  spacing: number,
): { x: number; z: number }[] {
  const dx = x1 - x0
  const dz = z1 - z0
  const len = Math.hypot(dx, dz)
  if (len === 0) {
    return [{ x: x0, z: z0 }]
  }
  const segments = Math.max(1, Math.ceil(len / spacing))
  const points: { x: number; z: number }[] = []
  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    points.push({ x: x0 + dx * t, z: z0 + dz * t })
  }
  return points
}

export function wallRunNormal(x0: number, z0: number, x1: number, z1: number): {
  nx: number
  nz: number
} {
  const dx = x1 - x0
  const dz = z1 - z0
  const len = Math.hypot(dx, dz)
  const tx = dx / len
  const tz = dz / len
  return { nx: -tz, nz: tx }
}

export function topYForBottom(bottomY: number): number {
  return Math.max(DEFAULT_STOREY_HEIGHT, bottomY + BLOCK_HEIGHT)
}

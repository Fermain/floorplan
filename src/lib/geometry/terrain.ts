import type { Heightfield } from '../model/types'
import {
  BufferGeometry,
  Float32BufferAttribute,
  Uint32BufferAttribute,
} from 'three'

function heightAtCell(field: Heightfield, c: number, r: number): number {
  return field.heights[r * field.cols + c]
}

function clampCol(field: Heightfield, c: number): number {
  return Math.max(0, Math.min(field.cols - 1, c))
}

function clampRow(field: Heightfield, r: number): number {
  return Math.max(0, Math.min(field.rows - 1, r))
}

export function bilinearHeight(
  field: Heightfield,
  worldX: number,
  worldZ: number,
): number {
  const u = (worldX - field.originX) / field.cellSize
  const v = (worldZ - field.originZ) / field.cellSize
  const c0 = Math.floor(u)
  const r0 = Math.floor(v)
  const c1 = c0 + 1
  const r1 = r0 + 1
  const fu = u - c0
  const fv = v - r0
  const h00 = heightAtCell(field, clampCol(field, c0), clampRow(field, r0))
  const h10 = heightAtCell(field, clampCol(field, c1), clampRow(field, r0))
  const h01 = heightAtCell(field, clampCol(field, c0), clampRow(field, r1))
  const h11 = heightAtCell(field, clampCol(field, c1), clampRow(field, r1))
  const h0 = h00 * (1 - fu) + h10 * fu
  const h1 = h01 * (1 - fu) + h11 * fu
  return h0 * (1 - fv) + h1 * fv
}

// The ground as a mesh; colourAt, if given, tints each point (as linear RGB, 0 to 1).
export function buildGroundGeometry(field: Heightfield, colourAt?: (x: number, z: number) => [number, number, number]): BufferGeometry {
  const positions: number[] = []
  const colours: number[] = []
  const indices: number[] = []
  for (let r = 0; r < field.rows; r++) {
    for (let c = 0; c < field.cols; c++) {
      const x = field.originX + c * field.cellSize
      const z = field.originZ + r * field.cellSize
      const y = heightAtCell(field, c, r)
      positions.push(x, y, z)
      if (colourAt) colours.push(...colourAt(x, z))
    }
  }
  const cols = field.cols
  for (let r = 0; r < field.rows - 1; r++) {
    for (let c = 0; c < field.cols - 1; c++) {
      const i00 = r * cols + c
      const i10 = i00 + 1
      const i01 = i00 + cols
      const i11 = i01 + 1
      indices.push(i00, i01, i10, i10, i01, i11)
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setIndex(new Uint32BufferAttribute(indices, 1))
  if (colourAt) geometry.setAttribute('color', new Float32BufferAttribute(colours, 3))
  geometry.computeVertexNormals()
  return geometry
}

export function bottomSamplesAlong(
  field: Heightfield,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
): { u: number; y: number }[] {
  const spacing = Math.min(field.cellSize, 0.25)
  const dx = x1 - x0
  const dz = z1 - z0
  const len = Math.hypot(dx, dz)
  if (len === 0) {
    return [{ u: 0, y: bilinearHeight(field, x0, z0) }]
  }
  const segments = Math.max(1, Math.ceil(len / spacing))
  const samples: { u: number; y: number }[] = []
  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    const x = x0 + dx * t
    const z = z0 + dz * t
    samples.push({ u: t * len, y: bilinearHeight(field, x, z) })
  }
  return samples
}

// The ground carried on past the survey by its edge heights, so the site sits in a landscape rather than on a tile.
export function padField(field: Heightfield, margin: number): Heightfield {
  const extra = Math.ceil(margin / field.cellSize)
  const cols = field.cols + extra * 2
  const rows = field.rows + extra * 2
  const originX = field.originX - extra * field.cellSize
  const originZ = field.originZ - extra * field.cellSize
  const heights: number[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) heights.push(bilinearHeight(field, originX + c * field.cellSize, originZ + r * field.cellSize))
  }
  return { originX, originZ, cellSize: field.cellSize, cols, rows, heights }
}

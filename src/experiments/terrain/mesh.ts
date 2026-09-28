import {
  BufferGeometry,
  Float32BufferAttribute,
  Uint32BufferAttribute,
} from 'three'
import {
  HEIGHTFIELD_COLS,
  HEIGHTFIELD_ORIGIN_X,
  HEIGHTFIELD_ORIGIN_Z,
  HEIGHTFIELD_ROWS,
  LEAF_CENTERLINE_OFFSET,
  WALL_SAMPLE_SPACING,
  bilinearHeight,
  heightAtGrid,
  sampleCenterlineXZ,
  topYForBottom,
  wallRunNormal,
} from './heightfield'

export type Vec3 = { x: number; y: number; z: number }

export function buildGroundGeometry(): BufferGeometry {
  const positions: number[] = []
  const indices: number[] = []
  for (let r = 0; r < HEIGHTFIELD_ROWS; r++) {
    for (let c = 0; c < HEIGHTFIELD_COLS; c++) {
      const x = HEIGHTFIELD_ORIGIN_X + c
      const z = HEIGHTFIELD_ORIGIN_Z + r
      const y = heightAtGrid(c, r)
      positions.push(x, y, z)
    }
  }
  const cols = HEIGHTFIELD_COLS
  for (let r = 0; r < HEIGHTFIELD_ROWS - 1; r++) {
    for (let c = 0; c < HEIGHTFIELD_COLS - 1; c++) {
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
  geometry.computeVertexNormals()
  return geometry
}

function buildLeafStrip(centerline: { x: number; z: number }[]): {
  geometry: BufferGeometry
  bottomVertices: Vec3[]
} {
  const positions: number[] = []
  const indices: number[] = []
  const bottomVertices: Vec3[] = []
  for (const p of centerline) {
    const bottomY = bilinearHeight(p.x, p.z)
    bottomVertices.push({ x: p.x, y: bottomY, z: p.z })
  }
  for (let i = 0; i < centerline.length - 1; i++) {
    const p0 = centerline[i]
    const p1 = centerline[i + 1]
    const b0 = bilinearHeight(p0.x, p0.z)
    const b1 = bilinearHeight(p1.x, p1.z)
    const t0 = topYForBottom(b0)
    const t1 = topYForBottom(b1)
    const base = positions.length / 3
    positions.push(p0.x, b0, p0.z, p1.x, b1, p1.z, p1.x, t1, p1.z, p0.x, t0, p0.z)
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setIndex(new Uint32BufferAttribute(indices, 1))
  geometry.computeVertexNormals()
  return { geometry, bottomVertices }
}

export function buildDoubleSkinWall(
  x0: number,
  z0: number,
  x1: number,
  z1: number,
): { leafGeometries: BufferGeometry[]; bottomVertices: Vec3[] } {
  const centerline = sampleCenterlineXZ(x0, z0, x1, z1, WALL_SAMPLE_SPACING)
  const { nx, nz } = wallRunNormal(x0, z0, x1, z1)
  const outer = centerline.map((p) => ({
    x: p.x + nx * LEAF_CENTERLINE_OFFSET,
    z: p.z + nz * LEAF_CENTERLINE_OFFSET,
  }))
  const inner = centerline.map((p) => ({
    x: p.x - nx * LEAF_CENTERLINE_OFFSET,
    z: p.z - nz * LEAF_CENTERLINE_OFFSET,
  }))
  const leafA = buildLeafStrip(outer)
  const leafB = buildLeafStrip(inner)
  return {
    leafGeometries: [leafA.geometry, leafB.geometry],
    bottomVertices: [...leafA.bottomVertices, ...leafB.bottomVertices],
  }
}

export function bottomVerticesForCenterline(
  x0: number,
  z0: number,
  x1: number,
  z1: number,
): Vec3[] {
  return buildDoubleSkinWall(x0, z0, x1, z1).bottomVertices
}

export function maxBottomVertexGap(bottomVertices: Vec3[]): number {
  let maxGap = 0
  for (const v of bottomVertices) {
    const expected = bilinearHeight(v.x, v.z)
    maxGap = Math.max(maxGap, Math.abs(v.y - expected))
  }
  return maxGap
}

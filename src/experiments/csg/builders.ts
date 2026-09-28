import {
  BoxGeometry,
  ExtrudeGeometry,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Path,
  Shape,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { CSG } from 'three-csg-ts'
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg'
import {
  BLOCK_COUNT_X,
  BLOCK_HEIGHT_M,
  BLOCK_LENGTH_M,
  BLOCK_THICKNESS_M,
  COURSE_COUNT,
  LEAF_OFFSET_Z_M,
  OPENING_HEIGHT_M,
  OPENING_WIDTH_M,
  WALL_DEPTH_M,
  WALL_HEIGHT_M,
  WALL_LENGTH_M,
  blockOverlapsAnyOpening,
  openingRects,
  type OpeningRect,
} from './params.js'

const wallMaterial = new MeshStandardMaterial({ color: '#b8b0a4' })
const unitBox = new BoxGeometry(1, 1, 1)
const evaluator = new Evaluator()

function mergeBlockBoxes(omitOpenings: boolean) {
  const openings = openingRects()
  const parts: BoxGeometry[] = []
  const matrix = new Matrix4()
  const leafCentersZ = [-LEAF_OFFSET_Z_M, LEAF_OFFSET_Z_M]

  for (const zCenter of leafCentersZ) {
    for (let course = 0; course < COURSE_COUNT; course++) {
      const minY = course * BLOCK_HEIGHT_M
      const maxY = minY + BLOCK_HEIGHT_M
      for (let block = 0; block < BLOCK_COUNT_X; block++) {
        const minX = block * BLOCK_LENGTH_M
        const maxX = minX + BLOCK_LENGTH_M
        if (
          omitOpenings &&
          blockOverlapsAnyOpening(minX, maxX, minY, maxY, openings)
        ) {
          continue
        }
        const geom = unitBox.clone()
        matrix.makeScale(BLOCK_LENGTH_M, BLOCK_HEIGHT_M, BLOCK_THICKNESS_M)
        matrix.setPosition(
          minX + BLOCK_LENGTH_M / 2,
          minY + BLOCK_HEIGHT_M / 2,
          zCenter,
        )
        geom.applyMatrix4(matrix)
        parts.push(geom)
      }
    }
  }

  const merged = mergeGeometries(parts, false)
  for (const g of parts) {
    g.dispose()
  }
  return merged
}

export function buildBlockGapGeometry() {
  return mergeBlockBoxes(true)
}

export function buildFullWallMeshFromBlocks(): Mesh {
  const geometry = mergeBlockBoxes(false)
  const mesh = new Mesh(geometry, wallMaterial)
  mesh.updateMatrix()
  return mesh
}

export function buildWindowMeshes(): Mesh[] {
  const openings = openingRects()
  const meshes: Mesh[] = []
  for (const o of openings) {
    const cx = (o.minX + o.maxX) / 2
    const cy = (o.minY + o.maxY) / 2
    const mesh = new Mesh(
      new BoxGeometry(OPENING_WIDTH_M, OPENING_HEIGHT_M, WALL_DEPTH_M + 0.02),
      wallMaterial,
    )
    mesh.position.set(cx, cy, 0)
    mesh.updateMatrix()
    meshes.push(mesh)
  }
  return meshes
}

function subtractWindowsThreeCsgTs(wall: Mesh, windows: Mesh[]): Mesh {
  let result = wall
  for (const windowMesh of windows) {
    windowMesh.updateMatrix()
    result.updateMatrix()
    result = CSG.subtract(result, windowMesh)
  }
  return result
}

function subtractWindowsThreeBvhCsg(wallMesh: Mesh, windows: Mesh[]): Brush {
  let wallBrush = new Brush(wallMesh.geometry.clone(), wallMaterial)
  wallBrush.updateMatrixWorld(true)
  for (const windowMesh of windows) {
    const windowBrush = new Brush(windowMesh.geometry.clone(), wallMaterial)
    windowBrush.position.copy(windowMesh.position)
    windowBrush.updateMatrixWorld(true)
    wallBrush = evaluator.evaluate(wallBrush, windowBrush, SUBTRACTION)
  }
  return wallBrush
}

export function runThreeCsgTsPunch(): Mesh {
  const wall = buildFullWallMeshFromBlocks()
  const windows = buildWindowMeshes()
  wall.updateMatrix()
  for (const windowMesh of windows) {
    windowMesh.updateMatrix()
  }
  return subtractWindowsThreeCsgTs(wall, windows)
}

export function runThreeBvhCsgPunch(): Brush {
  const wall = buildFullWallMeshFromBlocks()
  const windows = buildWindowMeshes()
  wall.updateMatrix()
  for (const windowMesh of windows) {
    windowMesh.updateMatrix()
  }
  return subtractWindowsThreeBvhCsg(wall, windows)
}

export function punchThreeCsgTs(): Mesh {
  return runThreeCsgTsPunch()
}

export function punchThreeBvhCsg(): Brush {
  return runThreeBvhCsgPunch()
}

export function buildExtrudeWallGeometry() {
  const shape = new Shape()
  shape.moveTo(0, 0)
  shape.lineTo(WALL_LENGTH_M, 0)
  shape.lineTo(WALL_LENGTH_M, WALL_HEIGHT_M)
  shape.lineTo(0, WALL_HEIGHT_M)
  shape.lineTo(0, 0)

  for (const o of openingRects()) {
    const hole = new Path()
    hole.moveTo(o.minX, o.minY)
    hole.lineTo(o.maxX, o.minY)
    hole.lineTo(o.maxX, o.maxY)
    hole.lineTo(o.minX, o.maxY)
    hole.lineTo(o.minX, o.minY)
    shape.holes.push(hole)
  }

  const geometry = new ExtrudeGeometry(shape, {
    depth: WALL_DEPTH_M,
    bevelEnabled: false,
  })
  geometry.translate(0, 0, -WALL_DEPTH_M / 2)
  return geometry
}

export function buildThreeCsgTsWallMesh(): Mesh {
  return punchThreeCsgTs()
}

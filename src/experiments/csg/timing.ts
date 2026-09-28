import {
  buildBlockGapGeometry,
  buildExtrudeWallGeometry,
  buildFullWallMeshFromBlocks,
  buildWindowMeshes,
} from './builders.js'
import { CSG } from 'three-csg-ts'
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg'
import { MeshStandardMaterial } from 'three'

const punchMaterial = new MeshStandardMaterial()
const bvhEvaluator = new Evaluator()

const RUNS = 5

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]!
}

function measureMedianMs(operation: () => void): number {
  operation()
  const samples: number[] = []
  for (let i = 0; i < RUNS; i++) {
    const t0 = performance.now()
    operation()
    samples.push(performance.now() - t0)
  }
  return Math.round(median(samples) * 100) / 100
}

function timeCsgPunchMs(
  punch: (wall: ReturnType<typeof buildFullWallMeshFromBlocks>, windows: ReturnType<typeof buildWindowMeshes>) => void,
): number {
  const warmupWall = buildFullWallMeshFromBlocks()
  const warmupWindows = buildWindowMeshes()
  warmupWall.updateMatrix()
  for (const w of warmupWindows) {
    w.updateMatrix()
  }
  punch(warmupWall, warmupWindows)

  const samples: number[] = []
  for (let i = 0; i < RUNS; i++) {
    const wall = buildFullWallMeshFromBlocks()
    const windows = buildWindowMeshes()
    wall.updateMatrix()
    for (const w of windows) {
      w.updateMatrix()
    }
    const t0 = performance.now()
    punch(wall, windows)
    samples.push(performance.now() - t0)
  }
  return Math.round(median(samples) * 100) / 100
}

export function timeThreeCsgTsMs(): number {
  return timeCsgPunchMs((wall, windows) => {
    let result = wall
    for (const windowMesh of windows) {
      windowMesh.updateMatrix()
      result.updateMatrix()
      result = CSG.subtract(result, windowMesh)
    }
  })
}

export function timeThreeBvhCsgMs(): number {
  return timeCsgPunchMs((wall, windows) => {
    let wallBrush = new Brush(wall.geometry.clone(), punchMaterial)
    wallBrush.updateMatrixWorld(true)
    for (const windowMesh of windows) {
      const windowBrush = new Brush(windowMesh.geometry.clone(), punchMaterial)
      windowBrush.position.copy(windowMesh.position)
      windowBrush.updateMatrixWorld(true)
      wallBrush = bvhEvaluator.evaluate(wallBrush, windowBrush, SUBTRACTION)
    }
  })
}

export function timeExtrudeHolesMs(): number {
  return measureMedianMs(() => {
    const geometry = buildExtrudeWallGeometry()
    geometry.dispose()
  })
}

export function timeBlockGapsMs(): number {
  return measureMedianMs(() => {
    const geometry = buildBlockGapGeometry()
    geometry?.dispose()
  })
}

export type CsgResults = {
  wallLengthM: number
  courses: number
  openingCount: number
  opening: { widthM: number; heightM: number; sillM: number }
  runs: number
  warmupExcluded: boolean
  medianMs: {
    'three-csg-ts': number
    'three-bvh-csg': number
    'extrude-holes': number
    'block-gaps': number
  }
}

export function collectResults(): CsgResults {
  return {
    wallLengthM: 3.96,
    courses: 11,
    openingCount: 10,
    opening: { widthM: 0.28, heightM: 1.2, sillM: 0.9 },
    runs: RUNS,
    warmupExcluded: true,
    medianMs: {
      'three-csg-ts': timeThreeCsgTsMs(),
      'three-bvh-csg': timeThreeBvhCsgMs(),
      'extrude-holes': timeExtrudeHolesMs(),
      'block-gaps': timeBlockGapsMs(),
    },
  }
}

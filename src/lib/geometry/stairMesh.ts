import { BoxGeometry, BufferGeometry, Matrix4, Vector3 } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Stair } from '../model/types'
import { stairLayout } from './stairs'

export function buildStairGeometry(stair: Stair, floorIndex: number): BufferGeometry | null {
  const layout = stairLayout(stair, floorIndex)
  const unit = new BoxGeometry(1, 1, 1)
  const matrix = new Matrix4()
  const along = new Vector3(stair.dx, 0, stair.dz)
  const up = new Vector3(0, 1, 0)
  const side = new Vector3(-stair.dz, 0, stair.dx)
  const parts: BufferGeometry[] = []
  for (const step of layout.steps) {
    const height = step.top
    const centreU = (step.u0 + step.u1) / 2
    const box = unit.clone()
    matrix.makeBasis(along, up, side)
    matrix.scale(new Vector3(step.u1 - step.u0, height, stair.width))
    matrix.setPosition(stair.x + stair.dx * centreU, height / 2, stair.z + stair.dz * centreU)
    box.applyMatrix4(matrix)
    parts.push(box)
  }
  unit.dispose()
  if (parts.length === 0) return null
  const merged = mergeGeometries(parts, false)
  for (const part of parts) part.dispose()
  return merged ?? null
}

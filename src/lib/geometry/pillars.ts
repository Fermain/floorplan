import { BoxGeometry, BufferGeometry, CylinderGeometry, Matrix4 } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { MORTAR_JOINT, type WallSystem } from '../model/systems'
import { pierCourses, pierSide, SUPPORT_HEIGHT_M, supportSpec } from '../model/supports'
import type { SupportType } from '../model/types'

export type PillarPart = { geometry: BufferGeometry; colour: string }

export type PillarSpot = { x: number; z: number; dir: { x: number; z: number } }

const MORTAR_COLOUR = '#6e6256'
const GALVANISED = '#9aa0a6'

type Piece = { geometry: BufferGeometry; y0: number; y1: number; colour: string }

function box(width: number, depth: number, y0: number, y1: number, colour: string): Piece {
  return { geometry: new BoxGeometry(width, y1 - y0, depth), y0, y1, colour }
}

function drum(r0: number, r1: number, y0: number, y1: number, colour: string): Piece {
  return { geometry: new CylinderGeometry(r1, r0, y1 - y0, 24), y0, y1, colour }
}

function pieces(type: SupportType, system: WallSystem, height: number): Piece[] {
  const colour = supportSpec(type).colour
  if (type === 'column') {
    const top = height
    return [
      box(0.34, 0.34, 0, 0.12, colour),
      drum(0.155, 0.15, 0.12, 0.17, colour),
      drum(0.12, 0.105, 0.17, top - 0.17, colour),
      drum(0.125, 0.125, top - 0.17, top - 0.14, colour),
      drum(0.115, 0.16, top - 0.14, top - 0.07, colour),
      box(0.36, 0.36, top - 0.07, top, colour),
    ]
  }
  if (type === 'pier') {
    const side = pierSide(system)
    const out: Piece[] = [box(side - 0.012, side - 0.012, 0, height, MORTAR_COLOUR)]
    const courses = pierCourses(system)
    for (let i = 0; i < courses; i++) {
      const y0 = i * system.courseHeight
      const y1 = Math.min(height, y0 + system.courseHeight - MORTAR_JOINT)
      if (y1 - y0 > 1e-4) out.push(box(side, side, y0, y1, supportSpec('pier').colour))
    }
    return out
  }
  if (type === 'steel') {
    return [
      box(0.25, 0.25, 0, 0.012, colour),
      box(0.1, 0.1, 0.012, height - 0.01, colour),
      box(0.2, 0.2, height - 0.01, height, colour),
    ]
  }
  return [box(0.1, 0.1, 0, 0.15, GALVANISED), drum(0.075, 0.07, 0.15, height, colour)]
}

// Pillars stand from baseY up to the wall head, squared to the wall they stand on.
export function buildPillarParts(
  type: SupportType,
  spots: PillarSpot[],
  system: WallSystem,
  baseY = 0,
  height = SUPPORT_HEIGHT_M,
): PillarPart[] {
  const byColour = new Map<string, BufferGeometry[]>()
  const matrix = new Matrix4()
  const turn = new Matrix4()
  for (const spot of spots) {
    for (const piece of pieces(type, system, height)) {
      turn.makeRotationY(-Math.atan2(spot.dir.z, spot.dir.x))
      matrix.makeTranslation(spot.x, baseY + (piece.y0 + piece.y1) / 2, spot.z).multiply(turn)
      piece.geometry.applyMatrix4(matrix)
      const list = byColour.get(piece.colour) ?? []
      list.push(piece.geometry.index ? piece.geometry.toNonIndexed() : piece.geometry)
      if (piece.geometry.index) piece.geometry.dispose()
      byColour.set(piece.colour, list)
    }
  }
  const out: PillarPart[] = []
  for (const [colour, list] of byColour) {
    const merged = mergeGeometries(list, false)
    for (const geometry of list) geometry.dispose()
    if (merged) out.push({ geometry: merged, colour })
  }
  return out
}

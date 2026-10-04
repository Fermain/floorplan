import { cornerById } from '../model/geom'
import type { Document, Floor, Wall } from '../model/types'
import { siteField } from './fixtures'
import { floorWorldDatum, groundPad, wallDatum } from './pad'
import { bilinearHeight } from './terrain'

// The ground along a wall, for its elevation: u is measured along the wall from its start and v up from the
// level the wall stands on. Finished is the ground as built, with the pad under the house levelled; natural is
// the ground as surveyed, before any of that.
export type GroundLine = {
  finished: [number, number][]
  natural: [number, number][]
  // The most the natural ground stands above the finished ground along the wall, and the most it falls below it.
  cut: number
  fill: number
  // The lowest and highest the finished ground gets, against the level the wall stands on.
  lowest: number
  highest: number
}

const STEP_M = 0.25
// How far past each end of the wall the ground is followed.
export const GROUND_LINE_RUN_M = 0.6

export function groundLine(doc: Document, floor: Floor, wall: Wall): GroundLine | null {
  if (floor.index !== 0) return null
  const a = cornerById(floor.corners, wall.startCornerId)
  const b = cornerById(floor.corners, wall.endCornerId)
  if (!a || !b) return null
  const length = Math.hypot(b.x - a.x, b.z - a.z)
  if (length < 1e-6) return null
  const t = { x: (b.x - a.x) / length, z: (b.z - a.z) / length }
  const base = floorWorldDatum(floor.datumHeight, wallDatum(floor, wall, groundPad(doc)) ?? 0)
  const built = siteField(doc)
  const steps = Math.ceil((length + GROUND_LINE_RUN_M * 2) / STEP_M)
  const finished: [number, number][] = []
  const natural: [number, number][] = []
  let cut = 0
  let fill = 0
  for (let i = 0; i <= steps; i++) {
    const u = -GROUND_LINE_RUN_M + ((length + GROUND_LINE_RUN_M * 2) * i) / steps
    const x = a.x + t.x * u
    const z = a.z + t.z * u
    const now = bilinearHeight(built, x, z) - base
    const before = bilinearHeight(doc.heightfield, x, z) - base
    finished.push([u, now])
    natural.push([u, before])
    if (u >= 0 && u <= length) {
      cut = Math.max(cut, before - now)
      fill = Math.max(fill, now - before)
    }
  }
  const along = finished.filter(([u]) => u >= 0 && u <= length).map(([, v]) => v)
  return { finished, natural, cut, fill, lowest: Math.min(...along), highest: Math.max(...along) }
}

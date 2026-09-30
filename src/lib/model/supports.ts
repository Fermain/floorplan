import { cornerById } from './geom'
import { courseCount, type WallSystem } from './systems'
import { WALL_HEAD } from '../plot/fixture'
import type { Floor, Support, SupportType } from './types'

export type SupportSpec = {
  id: SupportType
  name: string
  text: string
  spacing: number
  size: number
  round: boolean
  colour: string
}

export const SUPPORTS: readonly SupportSpec[] = [
  {
    id: 'column',
    name: 'Classical column',
    text: 'Precast concrete column with a square base and capital, painted. The township stoep favourite.',
    spacing: 2.4,
    size: 0.34,
    round: true,
    colour: '#e7e1d5',
  },
  {
    id: 'pier',
    name: 'Block pier',
    text: 'A square pier built in the project’s own brick or block, coursed like the walls.',
    spacing: 3,
    size: 0.4,
    round: false,
    colour: '#c4b5a0',
  },
  {
    id: 'steel',
    name: 'Steel post',
    text: '100 × 100 square hollow steel on bolted base and cap plates. Slim, quick and strong.',
    spacing: 3,
    size: 0.1,
    round: false,
    colour: '#3a3f44',
  },
  {
    id: 'pole',
    name: 'Timber pole',
    text: 'Treated gum pole, 150 mm across. Cheap and common for carports and stoeps; keep it off the ground.',
    spacing: 2.4,
    size: 0.15,
    round: true,
    colour: '#8b6b4a',
  },
]

export const SUPPORT_MIN_SPACING_M = 1
export const SUPPORT_MAX_SPACING_M = 6
export const SUPPORT_HEIGHT_M = WALL_HEAD

export function supportSpec(type: SupportType): SupportSpec {
  return SUPPORTS.find((item) => item.id === type) ?? SUPPORTS[0]
}

export function defaultSupport(type: SupportType): Support {
  return { type, spacing: supportSpec(type).spacing }
}

export function supportProblem(support: Support): string | null {
  if (!SUPPORTS.some((item) => item.id === support.type)) return 'unknown support'
  if (!(support.spacing >= SUPPORT_MIN_SPACING_M - 1e-9 && support.spacing <= SUPPORT_MAX_SPACING_M + 1e-9)) {
    return 'support spacing out of range'
  }
  return null
}

export function evenPositions(length: number, spacing: number): number[] {
  if (length <= 1e-6) return []
  const bays = Math.max(1, Math.ceil(length / spacing - 1e-9))
  return Array.from({ length: bays + 1 }, (_, i) => (length * i) / bays)
}

// A pier is one brick-and-a-half square in clay, or one block length square in block.
export function pierSide(system: WallSystem): number {
  return system.moduleLength < 0.3 ? system.moduleLength * 1.5 : system.moduleLength
}

export function pierUnitsPerCourse(system: WallSystem): number {
  const side = pierSide(system)
  return Math.ceil((side * side) / (system.moduleLength * system.leafThickness) - 1e-6)
}

export function pierCourses(system: WallSystem): number {
  return courseCount(system, SUPPORT_HEIGHT_M)
}

export type SupportPoint = { x: number; z: number; dir: { x: number; z: number }; support: Support; wallId: string }

// Every support on a floor, one per spot: where supported walls meet, the first wall's support stands.
export function floorSupports(floor: Floor): SupportPoint[] {
  const points: SupportPoint[] = []
  for (const wall of floor.walls) {
    if (wall.skin !== 'logical' || !wall.support) continue
    const a = cornerById(floor.corners, wall.startCornerId)
    const b = cornerById(floor.corners, wall.endCornerId)
    if (!a || !b) continue
    const length = Math.hypot(b.x - a.x, b.z - a.z)
    if (length <= 1e-6) continue
    const dir = { x: (b.x - a.x) / length, z: (b.z - a.z) / length }
    for (const u of evenPositions(length, wall.support.spacing)) {
      const t = u / length
      const x = a.x + (b.x - a.x) * t
      const z = a.z + (b.z - a.z) * t
      if (points.some((point) => Math.hypot(point.x - x, point.z - z) < 0.05)) continue
      points.push({ x, z, dir, support: wall.support, wallId: wall.id })
    }
  }
  return points
}

import { pointInPlot } from './plot-check'
import type { Document, RetainingType, RetainingWall } from './types'

export type RetainingSpec = { id: RetainingType; name: string; text: string; colour: string; thickness: number }

export const RETAINING_TYPES: readonly RetainingSpec[] = [
  { id: 'blocks', name: 'Retaining blocks', text: 'Löffelstein-type concrete retaining blocks, dry-stacked, each course stepped back up the bank and filled with soil. Can be planted.', colour: '#a9a69e', thickness: 0.45 },
  { id: 'masonry', name: 'Brick or block wall', text: 'A reinforced masonry wall on a concrete footing, with weep holes and a drain behind it.', colour: '#9c7c66', thickness: 0.29 },
  { id: 'concrete', name: 'Concrete wall', text: 'A reinforced concrete wall cast on a footing, with weep holes and a drain behind it.', colour: '#b6b3ac', thickness: 0.25 },
]

// Over this much retained, a wall wants an engineer's design.
export const RETAINING_ENGINEER_M = 1
export const RETAINING_MIN_LENGTH_M = 0.5

export function retainingSpec(type: RetainingType): RetainingSpec {
  return RETAINING_TYPES.find((item) => item.id === type) ?? RETAINING_TYPES[0]
}

export function retainingLength(points: [number, number][]): number {
  let length = 0
  for (let i = 0; i < points.length - 1; i++) length += Math.hypot(points[i + 1][0] - points[i][0], points[i + 1][1] - points[i][1])
  return length
}

export function retainingProblem(document: Document, wall: Omit<RetainingWall, 'id'>): string | null {
  if (!RETAINING_TYPES.some((item) => item.id === wall.type)) return 'unknown kind of retaining wall'
  if (wall.points.length < 2 || wall.points.some(([x, z]) => !Number.isFinite(x) || !Number.isFinite(z))) return 'a retaining wall needs at least two points'
  if (retainingLength(wall.points) < RETAINING_MIN_LENGTH_M) return 'retaining wall is too short'
  if (wall.points.some(([x, z]) => !pointInPlot(document.plot, x, z))) return 'retaining wall outside the plot'
  return null
}

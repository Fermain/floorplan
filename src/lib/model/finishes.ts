import type { FaceFinish, WallFinish, WallSystemId } from './types'

export type FinishSpec = { id: WallFinish; name: string; text: string }

export const WALL_FINISHES: readonly FinishSpec[] = [
  { id: 'exposed', name: 'Exposed', text: 'Left as built: face brick, or fair-faced block. Nothing to maintain, but every joint shows.' },
  { id: 'bagged', name: 'Bagged', text: 'A thin cement slurry rubbed over the wall with a sack. Cheaper than plaster; the coursing still shows through.' },
  { id: 'plastered', name: 'Plastered', text: 'About 15 mm of plaster ("dagga"), floated smooth. The usual finish on block, and inside most houses.' },
]

export type PaintSpec = { id: string; name: string; colour: string }

// A short palette of the colours houses here are usually painted.
export const PAINTS: readonly PaintSpec[] = [
  { id: 'white', name: 'White', colour: '#f4f2ec' },
  { id: 'cream', name: 'Cream', colour: '#ece2c8' },
  { id: 'sandstone', name: 'Sandstone', colour: '#d8c3a0' },
  { id: 'ochre', name: 'Ochre', colour: '#c99a4e' },
  { id: 'terracotta', name: 'Terracotta', colour: '#b9694a' },
  { id: 'sage', name: 'Sage', colour: '#a9b39a' },
  { id: 'sky', name: 'Sky', colour: '#b9cfdc' },
  { id: 'stone', name: 'Stone grey', colour: '#b3b0a8' },
  { id: 'charcoal', name: 'Charcoal', colour: '#55575a' },
]

export const NO_PAINT = 'none'
// Bare plaster and bare bagging, before any paint.
export const BARE_PLASTER = '#b7b2a8'
export const BARE_BAGGING = '#c6c0b4'
export const PLASTER_M = 0.015

export function isWallFinish(value: unknown): value is WallFinish {
  return WALL_FINISHES.some((item) => item.id === value)
}

export function isPaint(value: unknown): boolean {
  return value === NO_PAINT || PAINTS.some((item) => item.id === value)
}

export function paintSpec(id: string): PaintSpec | null {
  return PAINTS.find((item) => item.id === id) ?? null
}

export function finishSpec(id: WallFinish): FinishSpec {
  return WALL_FINISHES.find((item) => item.id === id) ?? WALL_FINISHES[0]
}

// What a wall gets when nothing is chosen: block and maxi brick are plastered both sides; clay brick is left as
// face brick outside and plastered inside.
export function autoFinish(systemId: WallSystemId, outside: boolean): WallFinish {
  const clay = systemId.startsWith('clay')
  return clay && outside ? 'exposed' : 'plastered'
}

export function finishProblem(patch: { finish?: WallFinish | null; paint?: string | null }): string | null {
  if (patch.finish !== undefined && patch.finish !== null && !isWallFinish(patch.finish)) return 'unknown wall finish'
  if (patch.paint !== undefined && patch.paint !== null && !isPaint(patch.paint)) return 'unknown paint colour'
  return null
}

export type { FaceFinish }

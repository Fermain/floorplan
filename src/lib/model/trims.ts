import type { CorniceType, Document, FaceTrim, SkirtingType, Wall } from './types'
import { projectDefaults } from './defaults'

type Profile = [number, number][]

export type TrimSpec<T extends string> = { id: T; name: string; text: string; profile: Profile }

// Profiles in metres: x out from the wall, y up from the floor for skirting, down from the ceiling (negative) for cornice.
function arc(cx: number, cy: number, r: number, from: number, to: number, steps = 8): Profile {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const a = ((from + ((to - from) * i) / steps) * Math.PI) / 180
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r] as [number, number]
  })
}

export const SKIRTINGS: readonly TrimSpec<SkirtingType>[] = [
  {
    id: 'rounded',
    name: 'Rounded',
    text: 'A bullnose skirting with a rounded top edge. Soft and easy to clean.',
    profile: [[0, 0], [0.015, 0], ...arc(0, 0.06, 0.015, 0, 90), [0, 0.075]],
  },
  {
    id: 'square',
    name: 'Square',
    text: 'A plain square-edged board. Clean lines, cheapest to buy.',
    profile: [[0, 0], [0.012, 0], [0.012, 0.075], [0, 0.075]],
  },
  {
    id: 'angled',
    name: 'Angled',
    text: 'A splayed skirting with a bevelled top, so dust has less to settle on.',
    profile: [[0, 0], [0.015, 0], [0.015, 0.05], [0.004, 0.075], [0, 0.075]],
  },
]

export const CORNICES: readonly TrimSpec<CorniceType>[] = [
  {
    id: 'rounded',
    name: 'Rounded',
    text: 'A 75 mm cove that curves from the wall into the ceiling.',
    profile: [[0, 0], [0.075, 0], ...arc(0.075, -0.075, 0.075, 90, 180), [0, -0.075]],
  },
  {
    id: 'coral',
    name: 'Coral',
    text: 'A simplified coral cornice: stepped beads and a cove, for a more formal room.',
    profile: [
      [0, 0],
      [0.1, 0],
      [0.1, -0.012],
      [0.085, -0.016],
      ...arc(0.085, -0.03, 0.014, 90, 200, 5),
      [0.06, -0.038],
      ...arc(0.06, -0.06, 0.022, 90, 180, 6),
      [0.03, -0.068],
      [0.018, -0.072],
      ...arc(0.018, -0.084, 0.012, 90, 180, 4),
      [0, -0.1],
    ],
  },
]

export type FaceSide = 'front' | 'back'

export function faceKey(side: 1 | -1): FaceSide {
  return side === 1 ? 'front' : 'back'
}

export function skirtingSpec(type: SkirtingType): TrimSpec<SkirtingType> {
  return SKIRTINGS.find((item) => item.id === type) ?? SKIRTINGS[0]
}

export function corniceSpec(type: CorniceType): TrimSpec<CorniceType> {
  return CORNICES.find((item) => item.id === type) ?? CORNICES[0]
}

// The trim on one face of a wall: the face's own choice, or the project's default.
export function faceTrim(doc: Document, wall: Wall, side: 1 | -1): { skirting: SkirtingType | 'none'; cornice: CorniceType | 'none' } {
  const defaults = projectDefaults(doc)
  const own: FaceTrim = wall.trim?.[faceKey(side)] ?? {}
  return { skirting: own.skirting ?? defaults.skirting, cornice: own.cornice ?? defaults.cornice }
}

export function trimProblem(trim: FaceTrim): string | null {
  if (trim.skirting !== undefined && trim.skirting !== 'none' && !SKIRTINGS.some((item) => item.id === trim.skirting)) return 'unknown skirting'
  if (trim.cornice !== undefined && trim.cornice !== 'none' && !CORNICES.some((item) => item.id === trim.cornice)) return 'unknown cornice'
  return null
}

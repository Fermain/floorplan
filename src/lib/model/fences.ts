import type { Fence, FenceType } from './types'

export type FenceSpec = {
  id: FenceType
  name: string
  text: string
  postSpacing: number
  postSize: number
  colour: string
  infill: string
}

export const FENCES: readonly FenceSpec[] = [
  {
    id: 'palisade',
    name: 'Steel palisade',
    text: 'Pointed steel pales on two rails. Hard to climb and see-through.',
    postSpacing: 3,
    postSize: 0.1,
    colour: '#2f3337',
    infill: '#3b4045',
  },
  {
    id: 'mesh',
    name: 'Welded mesh',
    text: 'Fine welded mesh on steel posts, in the style of ClearVu. Hard to cut or climb, easy to see through.',
    postSpacing: 2.5,
    postSize: 0.06,
    colour: '#26292c',
    infill: '#4a4f54',
  },
  {
    id: 'precast',
    name: 'Precast concrete',
    text: 'Concrete slabs slotted between precast posts. Solid, private and quick to put up.',
    postSpacing: 2.4,
    postSize: 0.14,
    colour: '#a8a29e',
    infill: '#c4bfb9',
  },
  {
    id: 'timber',
    name: 'Timber slats',
    text: 'Treated timber slats on two rails. Softer looking; needs treating now and then.',
    postSpacing: 2.4,
    postSize: 0.1,
    colour: '#7c5a3a',
    infill: '#9a7048',
  },
  {
    id: 'half-wall',
    name: 'Half wall',
    text: 'A low wall of plastered brick or block with a coping, round a garden, a deck or a stoep.',
    postSpacing: 3,
    postSize: 0.14,
    colour: '#a8a39a',
    infill: '#b7b2a8',
  },
]

export const FENCE_MIN_HEIGHT_M = 0.3
export const FENCE_MAX_HEIGHT_M = 3
export const DEFAULT_FENCE_HEIGHT_M = 1.8

export function fenceSpec(type: FenceType): FenceSpec {
  return FENCES.find((item) => item.id === type) ?? FENCES[0]
}

export function fenceProblem(fence: Fence): string | null {
  if (!FENCES.some((item) => item.id === fence.type)) return 'unknown fence'
  if (!(fence.height >= FENCE_MIN_HEIGHT_M - 1e-9 && fence.height <= FENCE_MAX_HEIGHT_M + 1e-9)) {
    return 'fence height out of range'
  }
  return null
}

export function fencePosts(length: number, spec: FenceSpec): number[] {
  // A half wall is one length of masonry; it has no posts.
  if (length <= 1e-6 || spec.id === 'half-wall') return []
  const bays = Math.max(1, Math.ceil(length / spec.postSpacing - 1e-9))
  return Array.from({ length: bays + 1 }, (_, i) => (length * i) / bays)
}

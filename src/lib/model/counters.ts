import type { Counter, CounterKind, CounterTop } from './types'

export type CounterKindSpec = { id: CounterKind; name: string; text: string; depth: number; height: number }

export const COUNTER_KINDS: readonly CounterKindSpec[] = [
  { id: 'base', name: 'Counter', text: 'Base cupboards under a worktop, against a wall. 600 mm deep and 900 mm high.', depth: 0.6, height: 0.9 },
  { id: 'island', name: 'Island', text: 'A counter standing free in the room, worked at from both sides. 900 mm deep.', depth: 0.9, height: 0.9 },
  { id: 'bar', name: 'Bar', text: 'A narrow, higher counter to sit at on stools. 400 mm deep and 1050 mm high.', depth: 0.4, height: 1.05 },
]

export type CounterTopSpec = { id: CounterTop; name: string; colour: string }

export const COUNTER_TOPS: readonly CounterTopSpec[] = [
  { id: 'laminate', name: 'Laminate', colour: '#d8d4cc' },
  { id: 'granite', name: 'Granite', colour: '#4a4a4f' },
  { id: 'timber', name: 'Timber', colour: '#a9794a' },
]

export const COUNTER_MIN_LENGTH_M = 0.3
export const COUNTER_MIN_DEPTH_M = 0.3
export const COUNTER_MAX_DEPTH_M = 1.5
// The worktop: how thick it is, and how far it sails past the cupboard fronts.
export const WORKTOP_M = 0.04
export const WORKTOP_OVERHANG_M = 0.02
// Cupboards on the wall: how far up they start and stop, and how deep they are.
export const WALL_UNIT_BOTTOM_M = 1.45
export const WALL_UNIT_TOP_M = 2.15
export const WALL_UNIT_DEPTH_M = 0.35

export function counterKindSpec(kind: CounterKind): CounterKindSpec {
  return COUNTER_KINDS.find((item) => item.id === kind) ?? COUNTER_KINDS[0]
}

export function counterTopSpec(top: CounterTop): CounterTopSpec {
  return COUNTER_TOPS.find((item) => item.id === top) ?? COUNTER_TOPS[0]
}

// Its four corners: the back edge first, from its start to its end, then the front edge back again.
export function counterRing(counter: Pick<Counter, 'x' | 'z' | 'dx' | 'dz' | 'length' | 'depth'>): { x: number; z: number }[] {
  const out = { x: -counter.dz, z: counter.dx }
  const end = { x: counter.x + counter.dx * counter.length, z: counter.z + counter.dz * counter.length }
  return [
    { x: counter.x, z: counter.z },
    end,
    { x: end.x + out.x * counter.depth, z: end.z + out.z * counter.depth },
    { x: counter.x + out.x * counter.depth, z: counter.z + out.z * counter.depth },
  ]
}

// The counter a point stands in, if any: the last drawn first.
export function counterUnder(counters: Counter[] | undefined, x: number, z: number): Counter | null {
  for (const counter of [...(counters ?? [])].reverse()) {
    const along = (x - counter.x) * counter.dx + (z - counter.z) * counter.dz
    const out = (x - counter.x) * -counter.dz + (z - counter.z) * counter.dx
    if (along > -0.01 && along < counter.length + 0.01 && out > -0.01 && out < counter.depth + 0.01) return counter
  }
  return null
}

export function counterProblem(counter: Omit<Counter, 'id'>): string | null {
  if (!COUNTER_KINDS.some((item) => item.id === counter.kind)) return 'unknown kind of counter'
  if (!COUNTER_TOPS.some((item) => item.id === counter.top)) return 'unknown worktop'
  if (![counter.x, counter.z, counter.dx, counter.dz, counter.length, counter.depth].every(Number.isFinite)) return 'counter is not a number'
  if (Math.abs(Math.hypot(counter.dx, counter.dz) - 1) > 1e-6) return 'counter direction must be a unit vector'
  if (counter.length < COUNTER_MIN_LENGTH_M - 1e-9) return 'counter is too short'
  if (counter.depth < COUNTER_MIN_DEPTH_M - 1e-9 || counter.depth > COUNTER_MAX_DEPTH_M + 1e-9) return 'counter depth out of range'
  if (counter.wallUnits && counter.kind !== 'base') return 'only a counter against a wall takes wall cupboards'
  return null
}

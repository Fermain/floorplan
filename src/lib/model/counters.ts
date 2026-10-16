import { WALL_HEAD } from '../plot/fixture'
import type { Counter, CounterKind, CounterTop } from './types'

export type CounterKindSpec = { id: CounterKind; name: string; text: string; depth: number; height: number }

export const COUNTER_KINDS: readonly CounterKindSpec[] = [
  { id: 'base', name: 'Counter', text: 'Base cupboards under a worktop, against a wall. 600 mm deep and 900 mm high.', depth: 0.6, height: 0.9 },
  { id: 'island', name: 'Island', text: 'A counter standing free in the room, worked at from both sides. 900 mm deep.', depth: 0.9, height: 0.9 },
  { id: 'bar', name: 'Bar', text: 'A narrow, higher counter to sit at on stools. 400 mm deep and 1050 mm high.', depth: 0.4, height: 1.05 },
  { id: 'cupboard', name: 'Built-in cupboard', text: 'Full-height cupboards along a wall for clothes, linen or storage. 600 mm deep and 2.4 m high.', depth: 0.6, height: WALL_HEAD },
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

export const CABINET_MODULE_M = 0.6
export const CABINET_MIN_BAY_M = 0.3
export const CABINET_MAX_BAY_M = 0.8

export type CupboardBay = {
  p1: { x: number; z: number }
  p2: { x: number; z: number }
  p3: { x: number; z: number }
  p4: { x: number; z: number }
}

// Subdivides a cupboard along its length into standard wardrobe bays (~600mm wide) with their four corners in plan.
export function cupboardBays(counter: Pick<Counter, 'x' | 'z' | 'dx' | 'dz' | 'length' | 'depth'>): CupboardBay[] {
  const numBays = Math.max(1, Math.round(counter.length / CABINET_MODULE_M))
  const bayLength = counter.length / numBays
  const out = { x: -counter.dz, z: counter.dx }
  const bays: CupboardBay[] = []
  for (let i = 0; i < numBays; i++) {
    const s0 = i * bayLength
    const s1 = (i + 1) * bayLength
    const p1 = { x: counter.x + counter.dx * s0, z: counter.z + counter.dz * s0 }
    const p2 = { x: counter.x + counter.dx * s1, z: counter.z + counter.dz * s1 }
    const p3 = { x: p2.x + out.x * counter.depth, z: p2.z + out.z * counter.depth }
    const p4 = { x: p1.x + out.x * counter.depth, z: p1.z + out.z * counter.depth }
    bays.push({ p1, p2, p3, p4 })
  }
  return bays
}

export type CounterBaySeam = {
  p1: { x: number; z: number }
  p2: { x: number; z: number }
  u: number
}

// Subdivides a counter along its length into discrete cabinet units (~600mm modulo) with their seam lines.
export function counterBays(counter: Pick<Counter, 'x' | 'z' | 'dx' | 'dz' | 'length' | 'depth'>, moduleWidth = CABINET_MODULE_M): CounterBaySeam[] {
  const numBays = Math.max(1, Math.round(counter.length / moduleWidth))
  if (numBays <= 1) return []
  const bayLength = counter.length / numBays
  const out = { x: -counter.dz, z: counter.dx }
  const seams: CounterBaySeam[] = []
  for (let i = 1; i < numBays; i++) {
    const u = i * bayLength
    const p1 = { x: counter.x + counter.dx * u, z: counter.z + counter.dz * u }
    const p2 = { x: p1.x + out.x * counter.depth, z: p1.z + out.z * counter.depth }
    seams.push({ p1, p2, u })
  }
  return seams
}

export type CornerSeam = {
  miter: { p1: { x: number; z: number }; p2: { x: number; z: number } }
  carcass?: { p1: { x: number; z: number }; p2: { x: number; z: number } }
  counterIds: [string, string]
}

// Detects perpendicular counter pairs meeting at an L-corner and calculates their 45° miter seam
// and internal carcass boundary line.
export function counterCornerSeams(counters: readonly Counter[] | undefined): CornerSeam[] {
  if (!counters || counters.length < 2) return []
  const seams: CornerSeam[] = []
  for (let i = 0; i < counters.length; i++) {
    const a = counters[i]
    if (a.kind === 'cupboard') continue
    const outA = { x: -a.dz, z: a.dx }
    for (let j = i + 1; j < counters.length; j++) {
      const b = counters[j]
      if (b.kind === 'cupboard') continue
      // Perpendicular check
      if (Math.abs(a.dx * b.dx + a.dz * b.dz) > 0.05) continue
      const outB = { x: -b.dz, z: b.dx }

      // Outer back corner intersection O
      const uA = (b.x - a.x) * a.dx + (b.z - a.z) * a.dz
      const uB = (a.x - b.x) * b.dx + (a.z - b.z) * b.dz
      const O = { x: a.x + a.dx * uA, z: a.z + a.dz * uA }

      // Check if O is near an end of each counter's back edge
      const reachA = Math.max(0.15, b.depth + 0.15)
      const reachB = Math.max(0.15, a.depth + 0.15)
      const nearStartA = Math.abs(uA) <= reachA
      const nearEndA = Math.abs(uA - a.length) <= reachA
      const nearStartB = Math.abs(uB) <= reachB
      const nearEndB = Math.abs(uB - b.length) <= reachB
      if ((!nearStartA && !nearEndA) || (!nearStartB && !nearEndB)) continue

      // Inner front corner intersection I
      const frontAx = a.x + outA.x * a.depth
      const frontAz = a.z + outA.z * a.depth
      const frontBx = b.x + outB.x * b.depth
      const frontBz = b.z + outB.z * b.depth
      const wA = (frontBx - frontAx) * a.dx + (frontBz - frontAz) * a.dz
      const I = { x: frontAx + a.dx * wA, z: frontAz + a.dz * wA }

      // Distance from O to I must match hypot(depthA, depthB)
      const expectedDist = Math.hypot(a.depth, b.depth)
      const actualDist = Math.hypot(I.x - O.x, I.z - O.z)
      if (Math.abs(actualDist - expectedDist) > 0.08) continue

      // Internal carcass seam line across the corner square
      let carcass: { p1: { x: number; z: number }; p2: { x: number; z: number } } | undefined
      const ptEndA = { x: a.x + a.dx * a.length, z: a.z + a.dz * a.length }
      const ptEndB = { x: b.x + b.dx * b.length, z: b.z + b.dz * b.length }

      if (Math.hypot(a.x - (O.x + a.dx * b.depth), a.z - (O.z + a.dz * b.depth)) < 0.15) {
        carcass = { p1: { x: a.x, z: a.z }, p2: I }
      } else if (Math.hypot(ptEndA.x - (O.x - a.dx * b.depth), ptEndA.z - (O.z - a.dz * b.depth)) < 0.15) {
        carcass = { p1: ptEndA, p2: I }
      } else if (Math.hypot(b.x - (O.x + b.dx * a.depth), b.z - (O.z + b.dz * a.depth)) < 0.15) {
        carcass = { p1: { x: b.x, z: b.z }, p2: I }
      } else if (Math.hypot(ptEndB.x - (O.x - b.dx * a.depth), ptEndB.z - (O.z - b.dz * a.depth)) < 0.15) {
        carcass = { p1: ptEndB, p2: I }
      }

      seams.push({ miter: { p1: O, p2: I }, carcass, counterIds: [a.id, b.id] })
    }
  }
  return seams
}

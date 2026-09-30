import type { Wall, WallSystemId } from './types'

export const MORTAR_JOINT = 0.01

export type UnitKey = 'clay-brick' | 'maxi-brick' | 'block-140' | 'block-90'

export type WallSystem = {
  id: WallSystemId
  name: string
  unitKey: UnitKey
  unitName: string
  hollow: boolean
  moduleLength: number
  courseHeight: number
  leafThickness: number
  leaves: 1 | 2
  cavity: number
}

export const WALL_SYSTEMS: readonly WallSystem[] = [
  {
    id: 'clay-cavity',
    name: 'Clay brick cavity',
    unitKey: 'clay-brick',
    hollow: false,
    unitName: 'Clay brick 222 × 106 × 73',
    moduleLength: 0.232,
    courseHeight: 0.083,
    leafThickness: 0.106,
    leaves: 2,
    cavity: 0.05,
  },
  {
    id: 'clay-solid',
    name: 'Clay brick solid 220',
    unitKey: 'clay-brick',
    hollow: false,
    unitName: 'Clay brick 222 × 106 × 73',
    moduleLength: 0.232,
    courseHeight: 0.083,
    leafThickness: 0.106,
    leaves: 2,
    cavity: MORTAR_JOINT,
  },
  {
    id: 'clay-single',
    name: 'Clay brick half 110',
    unitKey: 'clay-brick',
    hollow: false,
    unitName: 'Clay brick 222 × 106 × 73',
    moduleLength: 0.232,
    courseHeight: 0.083,
    leafThickness: 0.106,
    leaves: 1,
    cavity: 0,
  },
  {
    id: 'maxi-140',
    name: 'Maxi brick 140',
    unitKey: 'maxi-brick',
    hollow: false,
    unitName: 'Maxi brick 290 × 140 × 90',
    moduleLength: 0.3,
    courseHeight: 0.1,
    leafThickness: 0.14,
    leaves: 1,
    cavity: 0,
  },
  {
    id: 'block-140',
    name: 'Concrete block 140',
    unitKey: 'block-140',
    hollow: true,
    unitName: 'Hollow block 390 × 140 × 190',
    moduleLength: 0.4,
    courseHeight: 0.2,
    leafThickness: 0.14,
    leaves: 1,
    cavity: 0,
  },
  {
    id: 'block-90',
    name: 'Concrete block 90',
    unitKey: 'block-90',
    hollow: true,
    unitName: 'Hollow block 390 × 90 × 190',
    moduleLength: 0.4,
    courseHeight: 0.2,
    leafThickness: 0.09,
    leaves: 1,
    cavity: 0,
  },
]

export const DEFAULT_WALL_SYSTEM_ID: WallSystemId = 'clay-cavity'

const SINGLE_FALLBACK_ID: WallSystemId = 'clay-single'

export function wallSystem(id: WallSystemId | undefined): WallSystem {
  return WALL_SYSTEMS.find((system) => system.id === id) ?? WALL_SYSTEMS[0]
}

export function systemOf(wall: Pick<Wall, 'skin' | 'systemId'>): WallSystem {
  if (wall.systemId) return wallSystem(wall.systemId)
  return wallSystem(wall.skin === 'single' ? SINGLE_FALLBACK_ID : DEFAULT_WALL_SYSTEM_ID)
}

export function skinFor(system: WallSystem): 'single' | 'double' {
  return system.leaves === 2 ? 'double' : 'single'
}

export function leafOffset(system: WallSystem): number {
  return system.leaves === 2 ? system.cavity / 2 + system.leafThickness / 2 : 0
}

export function wallThickness(system: WallSystem): number {
  return system.leaves * system.leafThickness + (system.leaves === 2 ? system.cavity : 0)
}

export function outerReach(system: WallSystem): number {
  return leafOffset(system) + system.leafThickness / 2
}

export function courseCount(system: WallSystem, head: number): number {
  return Math.ceil(head / system.courseHeight - 1e-9)
}

export function snapToCourse(system: WallSystem, v: number, mode: 'round' | 'ceil' | 'floor' = 'round'): number {
  const n = v / system.courseHeight
  const k = mode === 'ceil' ? Math.ceil(n - 1e-9) : mode === 'floor' ? Math.floor(n + 1e-9) : Math.round(n)
  return k * system.courseHeight
}

export function snapToHalfModule(system: WallSystem, u: number, mode: 'round' | 'ceil' = 'round'): number {
  const half = system.moduleLength / 2
  const n = u / half
  return (mode === 'ceil' ? Math.ceil(n - 1e-9) : Math.round(n)) * half
}

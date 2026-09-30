import { DEFAULT_RATES } from '$lib/cost/rates'
import type { WallSystem } from '$lib/model/systems'
import { wallThickness } from '$lib/model/systems'
import type { WallSystemId } from '$lib/model/types'

export const WALL_BLURBS: Record<WallSystemId, { use: string; text: string }> = {
  'clay-cavity': {
    use: 'External walls',
    text: 'Two leaves of clay brick with a 50 mm cavity between them. The cavity keeps driven rain off the inside face.',
  },
  'clay-solid': {
    use: 'External or load-bearing walls',
    text: 'Two leaves of clay brick laid tight together into one solid wall, about 220 mm thick.',
  },
  'clay-single': {
    use: 'Internal partitions',
    text: 'A single leaf of clay brick, about 110 mm. Light partitions between rooms.',
  },
  'maxi-140': {
    use: 'External walls, low-cost housing',
    text: 'Larger clay bricks laid one leaf thick. Fewer units and joints than standard brick, so quicker to lay.',
  },
  'block-140': {
    use: 'External walls, low-cost housing',
    text: 'Hollow concrete blocks one leaf thick, usually plastered. Fast and economical to build.',
  },
  'block-90': {
    use: 'Internal partitions',
    text: 'Thin hollow concrete blocks for partitions between rooms.',
  },
}

export function unitsPerSquareMetre(system: WallSystem): number {
  return (system.leaves / (system.moduleLength * system.courseHeight))
}

export function unitCostPerSquareMetre(system: WallSystem): number {
  return unitsPerSquareMetre(system) * (DEFAULT_RATES[`unit:${system.unitKey}`] ?? 0)
}

export function thicknessMm(system: WallSystem): number {
  return Math.round(wallThickness(system) * 1000)
}

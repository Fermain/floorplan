import type { CostAssumptions, Costing } from '../model/types'

export const DEFAULT_ASSUMPTIONS: CostAssumptions = {
  wastePct: 5,
  mortarAllowancePct: 25,
  cementBagsPerM3: 5.5,
  sandM3PerM3: 1.1,
  footingWidth: 0.6,
  footingDepth: 0.2,
}

export const DEFAULT_RATES: Record<string, number> = {
  'unit:clay-brick': 3.5,
  'unit:maxi-brick': 7,
  'unit:block-140': 15,
  'unit:block-90': 11,
  'cement-bag': 105,
  'sand-m3': 550,
  'concrete-m3': 2200,
  'lintel-m': 60,
  'window-m2': 2800,
  'opening:door': 9000,
  'opening:external-door': 4500,
  'opening:internal-door': 2200,
  'opening:garage': 12000,
  'opening:portal': 0,
  'roof:concrete-tile': 280,
  'roof:clay-tile': 450,
  'roof:ibr': 260,
  'roof:corrugated': 220,
  'finish:screed': 120,
  'finish:tiles': 350,
  'finish:timber': 650,
  'finish:vinyl': 300,
  'finish:carpet': 280,
}

export function assumptionsOf(costing: Costing | undefined): CostAssumptions {
  return { ...DEFAULT_ASSUMPTIONS, ...(costing?.assumptions ?? {}) }
}

export function rateOf(costing: Costing | undefined, key: string): number {
  return costing?.rates?.[key] ?? DEFAULT_RATES[key] ?? 0
}

export function rateIsDefault(costing: Costing | undefined, key: string): boolean {
  return costing?.rates?.[key] === undefined
}

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
  'cable:1.5': 12,
  'cable:2.5': 18,
  'cable:6': 48,
  'conduit-20': 9,
  'flush-box': 14,
  'breaker:10': 85,
  'breaker:20': 90,
  'breaker:32': 120,
  'earth-leakage': 650,
  'pipe:110': 95,
  'pipe:50': 45,
  'pipe:22': 70,
  'pipe:15': 45,
  'pipe:15-hot': 60,
  'inspection-eye': 250,
  gully: 450,
  trench: 180,
  'fixture:socket': 180,
  'fixture:switch': 90,
  'fixture:light': 250,
  'fixture:outdoor-light': 350,
  'fixture:stove-isolator': 450,
  'fixture:extractor': 900,
  'fixture:db-board': 3500,
  'fixture:wc': 2500,
  'fixture:basin': 1200,
  'fixture:shower': 3500,
  'fixture:bath': 4000,
  'fixture:sink': 2800,
  'fixture:washing-machine': 450,
  'fixture:geyser': 9000,
  'fixture:solar-geyser': 22000,
  'fixture:outside-tap': 250,
  'support:column': 1600,
  'support:pier': 0,
  'support:steel': 950,
  'support:pole': 450,
  'fence:palisade': 650,
  'fence:mesh': 320,
  'fence:precast': 420,
  'fence:timber': 560,
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

import type { Roof, RoofCovering } from '../model/types'

export type CoveringSpec = {
  id: RoofCovering
  name: string
  kind: 'tile' | 'sheet'
  minPitchDeg: number
  depth: number
  across: number
  along: number
  colour: string
  shade: string
}

export const COVERINGS: readonly CoveringSpec[] = [
  {
    id: 'concrete-tile',
    name: 'Concrete tiles',
    kind: 'tile',
    minPitchDeg: 17.5,
    depth: 0.22,
    across: 0.3,
    along: 0.345,
    colour: '#5b5552',
    shade: '#3a3533',
  },
  {
    id: 'clay-tile',
    name: 'Clay tiles',
    kind: 'tile',
    minPitchDeg: 25,
    depth: 0.22,
    across: 0.2,
    along: 0.33,
    colour: '#a9532f',
    shade: '#6f3119',
  },
  {
    id: 'ibr',
    name: 'IBR steel sheeting',
    kind: 'sheet',
    minPitchDeg: 5,
    depth: 0.16,
    across: 0.186,
    along: 1,
    colour: '#8b9299',
    shade: '#5f666d',
  },
  {
    id: 'corrugated',
    name: 'Corrugated sheeting',
    kind: 'sheet',
    minPitchDeg: 10,
    depth: 0.16,
    across: 0.076,
    along: 1,
    colour: '#9aa1a7',
    shade: '#6c7379',
  },
]

export const DEFAULT_COVERING: RoofCovering = 'concrete-tile'

export function coveringOf(roof: Pick<Roof, 'covering'>): CoveringSpec {
  return COVERINGS.find((item) => item.id === (roof.covering ?? DEFAULT_COVERING)) ?? COVERINGS[0]
}

export function tilesPerM2(spec: CoveringSpec): number {
  return spec.kind === 'tile' ? 1 / (spec.across * spec.along) : 0
}

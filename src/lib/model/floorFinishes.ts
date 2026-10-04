import type { FloorFinish } from './types'

// How a floor finish looks: its colour, the colour of its joints, and the size of one tile or plank in metres.
// A finish with no module is laid in one piece.
export type FloorFinishSpec = {
  id: FloorFinish
  name: string
  text: string
  colour: string
  joint: string
  module: { along: number; across: number; staggered: boolean } | null
}

export const FLOOR_FINISHES: readonly FloorFinishSpec[] = [
  { id: 'screed', name: 'Screed', text: 'A smooth cement topping, left as the floor or sealed.', colour: '#b9b6ae', joint: '#a5a29a', module: null },
  { id: 'tiles', name: 'Floor tiles', text: '600 mm tiles on adhesive, with grouted joints.', colour: '#ddd8cd', joint: '#a39d92', module: { along: 0.6, across: 0.6, staggered: false } },
  { id: 'timber', name: 'Timber flooring', text: 'Boards laid in staggered rows.', colour: '#b68958', joint: '#855c33', module: { along: 1.2, across: 0.14, staggered: true } },
  { id: 'vinyl', name: 'Vinyl flooring', text: 'Vinyl planks clicked or glued over the screed.', colour: '#cdbf9f', joint: '#a8997a', module: { along: 1.2, across: 0.18, staggered: true } },
  { id: 'carpet', name: 'Carpet', text: 'Carpet on underfelt, wall to wall.', colour: '#8f8a99', joint: '#7b7686', module: null },
  { id: 'none', name: 'No finish', text: 'The bare slab.', colour: '#a3a3a3', joint: '#a3a3a3', module: null },
]

export function floorFinishSpec(id: FloorFinish): FloorFinishSpec {
  return FLOOR_FINISHES.find((item) => item.id === id) ?? FLOOR_FINISHES[0]
}

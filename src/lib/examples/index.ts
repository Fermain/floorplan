import type { Document } from '../model/types'

// Example projects people can open a copy of from the home page. An example is either a saved project file in
// this folder (export one from a project's menu) or a function that builds one; add an entry here for each.
export type Example = {
  id: string
  name: string
  place: string
  description: string
  highlights: string[]
  author: string
  load: () => Promise<Document>
}

export const EXAMPLES: readonly Example[] = [
  {
    id: 'pretoria-stoep-house',
    name: 'Pretoria stoep house',
    place: 'Pretoria, on a gentle north-facing slope',
    description: 'A two-storey family house with a wraparound stoep and balcony, a carport, solar panels and a full set of services.',
    highlights: ['Two storeys', 'Stoep and balcony', 'Solar and backup'],
    author: 'Floorplan',
    load: async () => (await import('./pretoria-stoep-house.json')).default as unknown as Document,
  },
  {
    id: 'eco-off-grid',
    name: 'Off-grid farmhouse',
    place: 'Limpopo, on a rolling hectare',
    description:
      'Living faces north under a mono-pitch roof carrying twenty panels and a day of battery. Rainwater in two 10,000 L tanks, gas for cooking, a solar geyser and a septic tank.',
    highlights: ['11 kWp solar', '20,000 L rainwater', 'Septic tank', 'Gas cooking'],
    author: 'Floorplan',
    load: async () => (await import('./ecoOffGrid')).ecoOffGrid(),
  },
  {
    id: 'granny-flat',
    name: 'House over a granny flat',
    place: 'Cape Town, on half an acre',
    description:
      'A two-bedroom family home upstairs over a self-contained flat and a garage, sharing a hall and stair. The flat has its own gas geyser.',
    highlights: ['Two storeys', 'Self-contained flat', 'Half an acre'],
    author: 'Floorplan',
    load: async () => (await import('./grannyFlat')).grannyFlat(),
  },
  {
    id: 'tight-urban',
    name: 'Tight city house',
    place: 'Johannesburg, on a 7.5 × 22 m stand',
    description:
      'Two storeys squeezed onto a narrow stand: parking in front, kitchen and stair at the street, living onto a small yard, two bedrooms upstairs.',
    highlights: ['165 m² stand', 'Two storeys', '140 mm block'],
    author: 'Floorplan',
    load: async () => (await import('./tightUrban')).tightUrban(),
  },
]

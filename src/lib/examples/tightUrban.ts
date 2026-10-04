import * as mutations from '../model/mutations'
import type { Document } from '../model/types'
import { Builder, terrain } from './build'

// A two-storey house squeezed onto a 7.5 × 22 m city stand: parking in front, a small yard behind, the kitchen
// and stair at the street, living opening onto the yard, and the bedrooms upstairs under a mono-pitch roof.
export function tightUrban(): Document {
  const ring: [number, number][] = [
    [0, 0],
    [7.5, 0],
    [7.5, 22],
    [0, 22],
  ]
  const levels = (x: number, z: number) => 1 - z * 0.02 + 0.02 * Math.sin(x)
  const b = new Builder(
    { ring, northBearingDeg: 0, latitude: -26.19, longitude: 28.03, roads: [0] },
    terrain(ring, levels),
    'block-140',
    { roofForm: 'mono', roofCovering: 'ibr', roofPitchDeg: 10, roofEaves: 0.3, apronWidth: 0.6, apronSurface: 'concrete' },
  )

  // 6.5 × 11 m, half a metre in from the side boundaries, set back 5 m for a parking bay.
  const [w, e, s, n] = [0.5, 7, 5, 16]
  const [hall, front] = [4.5, 10]
  b.rect(0, w, s, e, n)
  b.walls(0, [{ x: w, z: front }, { x: e, z: front }])
  b.walls(0, [{ x: hall, z: s }, { x: hall, z: front }])

  b.opening(0, 'external-door', { x: 5.2, z: s })
  b.opening(0, 'window', { x: 2.5, z: s })
  b.opening(0, 'internal-door', { x: 2.5, z: front })
  b.opening(0, 'internal-door', { x: 5.2, z: front })
  b.opening(0, 'door', { x: 2.5, z: n }, 1.8)
  b.opening(0, 'window', { x: 5.5, z: n })
  b.opening(0, 'window', { x: w, z: 12.5 })

  b.room(0, { x: 2.5, z: 7 }, 'Kitchen', 'kitchen')
  b.room(0, { x: 5.75, z: 7 }, 'Hall', 'passage')
  b.room(0, { x: 3.75, z: 12.5 }, 'Living', 'living')

  // Upstairs: a landing down the east side, the bathroom at its end, the bedrooms off it.
  b.storey(0, { x: w, z: s })
  b.stair(0, { x: 6.3, z: 5.6 }, { x: 0, z: 1 }, 1)
  b.rect(1, w, s, e, n)
  b.walls(1, [{ x: hall, z: s }, { x: hall, z: n }])
  b.walls(1, [{ x: w, z: front }, { x: hall, z: front }])
  b.walls(1, [{ x: hall, z: 12.5 }, { x: e, z: 12.5 }])

  b.opening(1, 'window', { x: 2.5, z: s })
  b.opening(1, 'window', { x: 5.75, z: s })
  b.opening(1, 'internal-door', { x: hall, z: 7.5 })
  b.opening(1, 'internal-door', { x: hall, z: 11.25 })
  b.opening(1, 'internal-door', { x: 5.75, z: 12.5 })
  b.opening(1, 'window', { x: 2.5, z: n }, 1.6)
  b.opening(1, 'window', { x: 5.75, z: n }, 0.6)
  b.opening(1, 'window', { x: w, z: 12.75 })

  b.room(1, { x: 2.5, z: 7 }, 'Bedroom 2', 'bedroom')
  b.room(1, { x: 5.75, z: 9 }, 'Landing', 'passage')
  b.room(1, { x: 5.75, z: 14.25 }, 'Bathroom', 'bathroom')
  b.room(1, { x: 2.5, z: 12.75 }, 'Main bedroom', 'bedroom')

  b.storey(1, { x: w, z: s })
  b.roof(2, { pitchDeg: 10, eaves: 0.3, form: 'mono', covering: 'ibr', turns: 2 })

  // The roof falls to the yard. A slimline tank under its downpipe, and the geyser solar to meet SANS 10400-XA.
  b.fixture(0, 'water-tank', { x: 1.2, z: n + 0.8 }, { x: 0, z: 1 }, { litres: 1000 })
  // The parking bay in front, in pavers from boundary to boundary.
  b.paving([[0, 0], [7.5, 0], [7.5, 4.2], [0, 4.2]], 'cement-pavers')
  // The wastes leave on the east side, along the 0.5 m strip, round the corner and back to the sewer.
  b.apply(mutations.setServiceBends(b.doc, 'sewer', [{ x: 7.3, z: 16.7 }]), 'drain round the house')
  for (const floor of b.doc.building.floors) {
    for (const fixture of floor.fixtures ?? []) {
      if (fixture.kind === 'geyser') b.apply(mutations.setFixtureKind(b.doc, floor.id, fixture.id, 'solar-geyser'), 'solar geyser')
    }
  }
  return b.doc
}

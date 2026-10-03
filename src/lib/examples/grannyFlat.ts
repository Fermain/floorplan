import * as mutations from '../model/mutations'
import type { Document } from '../model/types'
import { Builder, terrain } from './build'

// A family house over a self-contained granny flat on a half-acre stand: the flat and a garage on the ground,
// the main house upstairs, sharing a hall and stair, under a tiled hip roof.
export function grannyFlat(): Document {
  const ring: [number, number][] = [
    [0, 0],
    [45, 0],
    [45, 45],
    [0, 45],
  ]
  // Falls gently to the north, with a slight swale down the middle of the stand.
  const levels = (x: number, z: number) => 3 - z * 0.06 - 0.3 * Math.exp(-((x - 30) ** 2) / 120) + 0.05 * Math.sin(x / 5)
  const b = new Builder(
    { ring, northBearingDeg: 0, latitude: -33.95, longitude: 18.47, roads: [0] },
    terrain(ring, levels),
    'clay-cavity',
    { roofForm: 'hip', roofCovering: 'concrete-tile', roofPitchDeg: 26, roofEaves: 0.6, apronWidth: 0.6, apronSurface: 'concrete' },
  )

  // 14 × 10 m. Ground: the flat to the west, the hall and stair in the middle, the garage to the east.
  const [w, e, s, n] = [15.5, 29.5, 18, 28]
  const [flatEnd, hallEnd, split] = [22.5, 24.5, 23]
  b.rect(0, w, s, e, n)
  b.walls(0, [{ x: flatEnd, z: s }, { x: flatEnd, z: n }])
  b.walls(0, [{ x: hallEnd, z: s }, { x: hallEnd, z: n }])
  b.walls(0, [{ x: w, z: split }, { x: flatEnd, z: split }])
  b.walls(0, [{ x: 20, z: s }, { x: 20, z: split }])

  b.opening(0, 'external-door', { x: 18.5, z: n })
  b.opening(0, 'window', { x: 21, z: n })
  b.opening(0, 'window', { x: w, z: 25.5 })
  b.opening(0, 'window', { x: 17.75, z: s })
  b.opening(0, 'window', { x: 21.25, z: s }, 0.6)
  b.opening(0, 'internal-door', { x: 17.75, z: split })
  b.opening(0, 'internal-door', { x: 21.25, z: split })
  b.opening(0, 'external-door', { x: 23.5, z: s })
  b.opening(0, 'internal-door', { x: hallEnd, z: 26.5 })
  b.opening(0, 'garage', { x: 27, z: n }, 2.6)
  b.opening(0, 'window', { x: e, z: 23 })

  b.room(0, { x: 19, z: 25.5 }, 'Flat living and kitchen', 'living')
  b.room(0, { x: 17.75, z: 20.5 }, 'Flat bedroom', 'bedroom')
  b.room(0, { x: 21.25, z: 20.5 }, 'Flat bathroom', 'bathroom')
  b.room(0, { x: 23.5, z: 23 }, 'Hall', 'passage')
  b.room(0, { x: 27, z: 23 }, 'Garage', 'garage')
  // The flat's kitchenette along the north wall of its living room.
  b.fixture(0, 'sink', { x: 16.6, z: 27.5 }, { x: 0, z: -1 })

  // Upstairs, the main house over the same footprint, up a stair in the hall.
  b.storey(0, { x: w, z: s })
  b.stair(0, { x: 23.5, z: 19 }, { x: 0, z: 1 }, 1)
  b.rect(1, w, s, e, n)
  b.walls(1, [{ x: flatEnd, z: s }, { x: flatEnd, z: n }])
  b.walls(1, [{ x: hallEnd, z: s }, { x: hallEnd, z: n }])
  b.walls(1, [{ x: w, z: split }, { x: flatEnd, z: split }])
  b.walls(1, [{ x: 20, z: s }, { x: 20, z: split }])
  b.walls(1, [{ x: hallEnd, z: split }, { x: e, z: split }])

  b.opening(1, 'window', { x: 18, z: n }, 2)
  b.opening(1, 'window', { x: 21, z: n })
  b.opening(1, 'window', { x: 27, z: n }, 1.6)
  b.opening(1, 'window', { x: 17.75, z: s })
  b.opening(1, 'window', { x: 21.25, z: s }, 0.6)
  b.opening(1, 'window', { x: 27, z: s })
  b.opening(1, 'window', { x: w, z: 25.5 })
  b.opening(1, 'window', { x: e, z: 20.5 })
  b.opening(1, 'portal', { x: flatEnd, z: 26 }, 1.6)
  b.opening(1, 'portal', { x: hallEnd, z: 26 }, 1.6)
  b.opening(1, 'internal-door', { x: 17.75, z: split })
  b.opening(1, 'internal-door', { x: 21.25, z: split })
  b.opening(1, 'internal-door', { x: hallEnd, z: 20.5 })

  b.room(1, { x: 19, z: 25.5 }, 'Living', 'living')
  b.room(1, { x: 23.5, z: 25 }, 'Landing', 'passage')
  b.room(1, { x: 27, z: 25.5 }, 'Kitchen', 'kitchen')
  b.room(1, { x: 17.75, z: 20.5 }, 'Bedroom 1', 'bedroom')
  b.room(1, { x: 21.25, z: 20.5 }, 'Bathroom', 'bathroom')
  b.room(1, { x: 27, z: 20.5 }, 'Main bedroom', 'bedroom')

  b.storey(1, { x: w, z: s })
  b.roof(2, { pitchDeg: 26, eaves: 0.6, form: 'hip', covering: 'concrete-tile' })

  b.fixture(0, 'water-tank', { x: w - 1, z: n - 1 }, { x: -1, z: 0 }, { litres: 5000 })

  // One solar geyser in the roof space over the middle of the house, near both bathrooms and both kitchens.
  const ground = b.floor(0)
  const geyser = ground.fixtures?.find((fixture) => fixture.kind === 'geyser')
  if (geyser) {
    b.apply(mutations.setFixtureKind(b.doc, ground.id, geyser.id, 'solar-geyser'), 'solar geyser')
    b.apply(mutations.updateFixture(b.doc, ground.id, geyser.id, { x: 23.5, z: 23 }), 'geyser in the middle')
  }
  // The flat has its own hot water: a gas geyser on its west wall, fed from two 19 kg bottles.
  b.fixture(0, 'gas-geyser', { x: w - 0.2, z: 27 }, { x: -1, z: 0 })
  b.fixture(0, 'gas-cylinder', { x: w - 0.3, z: 20 }, { x: -1, z: 0 }, { bottles: 2, bottleKg: 19, cage: true })
  // A paved drive from the street, up the east side and round to the garage door on the north.
  b.paving([[31, 0], [34.5, 0], [34.5, 33], [24.5, 33], [24.5, 29.5], [31, 29.5]], 'cement-pavers')
  // The wastes leave on the south side; the drain goes round the west end and down to the sewer at the back.
  b.apply(mutations.setServiceBends(b.doc, 'sewer', [{ x: 13.5, z: 17 }, { x: 13.5, z: 31 }]), 'drain round the house')
  return b.doc
}

import { electricalLayout } from '../geometry/electrical'
import { outsideFaces } from '../geometry/finishes'
import { powerLayout } from '../geometry/power'
import { cornerById } from '../model/geom'
import * as mutations from '../model/mutations'
import type { Document, FloorFinish } from '../model/types'
import { Builder, terrain } from './build'

// Three generations on one farm stand: the family's face-brick house in the middle, a plastered cottage either
// side of the yard for the grandparents and for a grown child, each with its own carport, a double garage on the
// drive, panels and tanks on the main house, and paving tying it together.
export function multiGeneration(): Document {
  const ring: [number, number][] = [
    [0, 0],
    [70, 0],
    [72, 40],
    [68, 66],
    [4, 64],
    [-2, 30],
  ]
  // A gentle fall to the north, with a low rise under the eastern cottage.
  const ground = (x: number, z: number) => 5 - z * 0.05 + 0.5 * Math.exp(-((x - 60) ** 2 + (z - 30) ** 2) / 400) + 0.12 * Math.sin(x / 9) * Math.cos(z / 11)
  const b = new Builder(
    { ring, northBearingDeg: 0, latitude: -25.9, longitude: 28.9, roads: [0] },
    terrain(ring, ground),
    'clay-cavity',
    { roofForm: 'gable', roofCovering: 'concrete-tile', roofPitchDeg: 22, roofEaves: 0.6, apronWidth: 1, apronSurface: 'concrete', outsidePaint: 'cream', insidePaint: 'white' },
  )

  // The main house, 16 × 9 m: living and kitchen across the north front, bedrooms, bathroom and laundry behind.
  const [w, e, s, n] = [27, 43, 36, 45]
  const mid = 40.5
  b.rect(0, w, s, e, n)
  b.walls(0, [{ x: w, z: mid }, { x: e, z: mid }])
  for (const x of [31.5, 34.5, 39]) b.walls(0, [{ x, z: s }, { x, z: mid }])
  b.walls(0, [{ x: 37, z: mid }, { x: 37, z: n }])
  b.opening(0, 'window', { x: 30, z: n }, 1.6)
  b.opening(0, 'door', { x: 34, z: n }, 2.4)
  b.opening(0, 'window', { x: 40, z: n }, 2.4)
  b.opening(0, 'window', { x: e, z: 43 })
  b.opening(0, 'window', { x: w, z: 43 })
  b.opening(0, 'window', { x: 29.25, z: s }, 2)
  b.opening(0, 'window', { x: 33, z: s }, 0.6)
  b.opening(0, 'window', { x: 36.75, z: s }, 2)
  b.opening(0, 'external-door', { x: 41, z: s })
  b.opening(0, 'internal-door', { x: 30, z: mid })
  b.opening(0, 'internal-door', { x: 33, z: mid })
  b.opening(0, 'internal-door', { x: 36.5, z: mid })
  b.opening(0, 'internal-door', { x: 41, z: mid })
  b.opening(0, 'portal', { x: 37, z: 42.75 }, 2.4)
  b.room(0, { x: 32, z: 43 }, 'Living', 'living')
  b.room(0, { x: 40, z: 43 }, 'Kitchen', 'kitchen')
  b.room(0, { x: 29, z: 38 }, 'Bedroom 1', 'bedroom')
  b.room(0, { x: 33, z: 38 }, 'Bathroom', 'bathroom')
  b.room(0, { x: 37, z: 38 }, 'Bedroom 2', 'bedroom')
  b.room(0, { x: 41, z: 38 }, 'Laundry', 'laundry')
  // The kitchen: granite counters with the sink and a hob set into them, and an island in the middle of the room.
  b.counters(0, { x: 40, z: 43 }, { top: 'granite', wallUnits: true, builtIn: true })
  b.island(0, { x: 40, z: 42.75 }, { x: 1, z: 0 }, 2.2, 'granite')

  // A cottage, 9 × 7 m in plastered block: kitchen and bathroom to the south, living and a bedroom to the north.
  const cottage = (x0: number, z0: number) => {
    const block = { systemId: 'block-140' as const, skin: 'single' as const }
    b.rect(0, x0, z0, x0 + 9, z0 + 7, block)
    b.walls(0, [{ x: x0, z: z0 + 2.6 }, { x: x0 + 9, z: z0 + 2.6 }], { systemId: 'block-90', skin: 'single' })
    b.walls(0, [{ x: x0 + 5, z: z0 }, { x: x0 + 5, z: z0 + 7 }], { systemId: 'block-90', skin: 'single' })
    b.opening(0, 'external-door', { x: x0 + 1.2, z: z0 })
    b.opening(0, 'window', { x: x0 + 3.4, z: z0 }, 1.6)
    b.opening(0, 'window', { x: x0 + 7.5, z: z0 }, 0.6)
    b.opening(0, 'window', { x: x0 + 2.5, z: z0 + 7 }, 1.8)
    b.opening(0, 'window', { x: x0, z: z0 + 5 })
    b.opening(0, 'window', { x: x0 + 7, z: z0 + 7 }, 1.8)
    b.opening(0, 'portal', { x: x0 + 2.5, z: z0 + 2.6 }, 2)
    b.opening(0, 'internal-door', { x: x0 + 5, z: z0 + 5 })
    b.opening(0, 'internal-door', { x: x0 + 7, z: z0 + 2.6 })
    b.room(0, { x: x0 + 2.5, z: z0 + 5 }, 'Lounge', 'living')
    b.room(0, { x: x0 + 2.5, z: z0 + 1.3 }, 'Kitchenette', 'kitchen')
    b.room(0, { x: x0 + 7, z: z0 + 5 }, 'Bedroom', 'bedroom')
    b.room(0, { x: x0 + 7, z: z0 + 1.3 }, 'Shower', 'bathroom')
    b.counters(0, { x: x0 + 2.5, z: z0 + 1.3 }, { top: 'laminate', wallUnits: true })
  }
  cottage(8, 30)
  cottage(53, 30)

  // The double garage on the drive, its doors to the road.
  b.rect(0, 30, 20, 36.5, 26.5, { systemId: 'block-140', skin: 'single' })
  b.opening(0, 'garage', { x: 33.25, z: 20 }, 4.8)
  b.opening(0, 'external-door', { x: 36.5, z: 24 })
  b.room(0, { x: 33, z: 23 }, 'Garage', 'garage')

  // A carport beside each cottage: a sheeted roof on posts, standing free.
  b.carport({ x: 20.5, z: 32.75 }, { x: 0, z: 1 }, 1, 'sheet')
  b.carport({ x: 49.5, z: 32.75 }, { x: 0, z: 1 }, 1, 'sheet')

  // Roofs: a tiled gable on the house, hips on the cottages, and a gable on the garage.
  b.cover({ x: w, z: s }, { pitchDeg: 22, eaves: 0.6, form: 'gable', covering: 'concrete-tile' })
  b.cover({ x: 8, z: 30 }, { pitchDeg: 22, eaves: 0.5, form: 'hip', covering: 'concrete-tile' })
  b.cover({ x: 53, z: 30 }, { pitchDeg: 22, eaves: 0.5, form: 'hip', covering: 'concrete-tile' })
  b.cover({ x: 30, z: 20 }, { pitchDeg: 22, eaves: 0.4, form: 'gable', covering: 'concrete-tile' })

  // Colour: the house stays face brick; the west cottage is sage, the east terracotta, the garage cream.
  const ground0 = () => b.floor(0)
  const outside = outsideFaces(ground0())
  for (const wall of ground0().walls) {
    if (wall.skin === 'logical') continue
    const a = cornerById(ground0().corners, wall.startCornerId)!
    const paint = a.x <= 17 ? 'sage' : a.x >= 53 ? 'terracotta' : null
    if (!paint) continue
    for (const side of [1, -1] as const) {
      if (outside(wall, side)) b.apply(mutations.setFaceFinish(b.doc, ground0().id, wall.id, side, { paint }), `paint on ${wall.id}`)
    }
  }

  // Floors: tiles where it is wet, boards in the living rooms, carpet in the bedrooms.
  for (const space of ground0().spaces ?? []) {
    const finish: FloorFinish | null =
      space.type === 'kitchen' || space.type === 'bathroom' || space.type === 'laundry' ? 'tiles' : space.type === 'living' ? 'timber' : space.type === 'bedroom' ? 'carpet' : null
    if (finish) b.apply(mutations.updateSpace(b.doc, ground0().id, space.id, { finish }), `floor in ${space.name}`)
  }

  // Rainwater from the main roof into two tanks at the north corners.
  b.fixture(0, 'water-tank', { x: w - 1, z: n - 1 }, { x: -1, z: 0 }, { litres: 5000 })
  b.fixture(0, 'water-tank', { x: e + 1, z: n - 1 }, { x: 1, z: 0 }, { litres: 5000 })

  // A septic tank downhill, to the north, with its soakaway beyond.
  b.apply(mutations.setSewerType(b.doc, 'septic'), 'septic tank')
  b.apply(mutations.setServicePoint(b.doc, 'sewer', { x: 24, z: 57 }), 'septic tank spot')
  b.apply(mutations.setSoakaway(b.doc, { x: 30, z: 60.5 }), 'soakaway')
  // The drain goes round the west end of the main house, where it can be reached.
  b.apply(mutations.setServiceBends(b.doc, 'sewer', [{ x: 24.5, z: 33.5 }, { x: 24.5, z: 48 }]), 'drain round the house')

  // Hot water: a solar geyser in the middle of the main house and in the east cottage, and a gas geyser on the
  // west cottage fed from two bottles in a cage.
  const first = ground0().fixtures?.find((fixture) => fixture.kind === 'geyser')
  if (first) {
    b.apply(mutations.setFixtureKind(b.doc, ground0().id, first.id, 'solar-geyser'), 'solar geyser')
    b.apply(mutations.updateFixture(b.doc, ground0().id, first.id, { x: 36, z: 41 }), 'geyser in the middle')
  }
  b.fixture(0, 'solar-geyser', { x: 58.5, z: 32 }, { x: 0, z: 1 })
  b.fixture(0, 'gas-geyser', { x: 17.2, z: 31.5 }, { x: 1, z: 0 })
  b.fixture(0, 'gas-cylinder', { x: 17.3, z: 34.8 }, { x: 1, z: 0 }, { bottles: 2, bottleKg: 19, cage: true })

  // Paving: a paver drive from the road past the garage, a gravel yard between the buildings, brick paths to the
  // doors and a patio north of the house.
  b.paving([[37.5, 0], [41, 0], [41, 27], [37.5, 27]], 'cement-pavers')
  b.paving([[30, 16], [37.5, 16], [37.5, 20], [30, 20]], 'cement-pavers')
  b.paving([[19, 27], [51, 27], [51, 30], [19, 30]], 'gravel')
  b.paving([[40, 30], [42, 30], [42, 35], [40, 35]], 'clay-pavers')
  b.paving([[30, 46], [40, 46], [40, 50], [30, 50]], 'clay-pavers')

  b.apply(mutations.setRainfall(b.doc, 680), 'rainfall')
  b.apply(mutations.setBackupHours(b.doc, 8), 'backup hours')
  for (const circuit of electricalLayout(b.doc).circuits) {
    if (circuit.kind === 'lights' || circuit.kind === 'plugs') b.apply(mutations.setEssential(b.doc, circuit.id, true), `essential ${circuit.id}`)
  }
  b.apply(mutations.setSolarPanels(b.doc, Math.min(16, powerLayout(b.doc).capacity)), 'solar panels')
  return b.doc
}

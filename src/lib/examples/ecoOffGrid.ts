import * as mutations from '../model/mutations'
import type { Document } from '../model/types'
import { electricalLayout } from '../geometry/electrical'
import { powerLayout } from '../geometry/power'
import { Builder, terrain } from './build'

// A farmhouse well off the grid: north-facing living, a mono-pitch roof covered in panels facing the sun,
// rainwater stored in big tanks, gas for cooking, a solar geyser and a septic tank, on a rolling hectare.
export function ecoOffGrid(): Document {
  const ring: [number, number][] = [
    [0, 0],
    [80, 0],
    [84, 60],
    [76, 100],
    [6, 96],
    [-4, 50],
  ]
  // A long fall to the north, a rise in the south-east and a shallow gully running north-west.
  const ground = (x: number, z: number) =>
    6 - z * 0.05 + 2.4 * Math.exp(-((x - 70) ** 2 + (z - 18) ** 2) / 500) - 1.2 * Math.exp(-((x - 18 + z * 0.2) ** 2) / 90) + 0.25 * Math.sin(x / 7) * Math.cos(z / 9)
  const b = new Builder(
    { ring, northBearingDeg: 0, latitude: -24.68, longitude: 30.33, roads: [0] },
    terrain(ring, ground),
    'clay-cavity',
    { roofForm: 'mono', roofCovering: 'ibr', roofPitchDeg: 12, roofEaves: 0.6, apronWidth: 1, apronSurface: 'concrete' },
  )

  // 16 × 9 m: living and kitchen across the north front, bedrooms, bathroom and laundry behind.
  const [w, e, s, n] = [32, 48, 55, 64]
  const mid = 59.5
  b.rect(0, w, s, e, n)
  b.walls(0, [{ x: w, z: mid }, { x: e, z: mid }])
  for (const x of [36.5, 39.5, 44]) b.walls(0, [{ x, z: s }, { x, z: mid }])
  b.walls(0, [{ x: 42, z: mid }, { x: 42, z: n }])

  // Big glass to the north, small to the south.
  b.opening(0, 'window', { x: 35, z: n }, 1.6)
  b.opening(0, 'external-door', { x: 39.5, z: n })
  b.opening(0, 'window', { x: 45, z: n }, 1.6)
  b.opening(0, 'window', { x: w, z: 62 })
  b.opening(0, 'window', { x: 34.25, z: s })
  b.opening(0, 'window', { x: 38, z: s }, 0.6)
  b.opening(0, 'window', { x: 41.75, z: s })
  b.opening(0, 'external-door', { x: 46, z: s })
  b.opening(0, 'internal-door', { x: 35, z: mid })
  b.opening(0, 'internal-door', { x: 38, z: mid })
  b.opening(0, 'internal-door', { x: 41.5, z: mid })
  b.opening(0, 'internal-door', { x: 46, z: mid })
  b.opening(0, 'portal', { x: 42, z: 61.75 }, 2.4)

  b.room(0, { x: 37, z: 62 }, 'Living', 'living')
  b.room(0, { x: 45, z: 62 }, 'Kitchen', 'kitchen')
  b.room(0, { x: 34, z: 57 }, 'Bedroom 1', 'bedroom')
  b.room(0, { x: 38, z: 57 }, 'Bathroom', 'bathroom')
  b.room(0, { x: 42, z: 57 }, 'Bedroom 2', 'bedroom')
  b.room(0, { x: 46, z: 57 }, 'Laundry', 'laundry')

  // Gas for cooking instead of a 6 kW element, and a solar geyser.
  const floor = () => b.floor(0)
  for (const fixture of floor().fixtures ?? []) {
    if (fixture.kind === 'stove') b.apply(mutations.setFixtureKind(b.doc, floor().id, fixture.id, 'gas-stove'), 'gas stove')
    if (fixture.kind === 'geyser') b.apply(mutations.setFixtureKind(b.doc, floor().id, fixture.id, 'solar-geyser'), 'solar geyser')
  }
  for (const fixture of floor().fixtures ?? []) {
    if (fixture.kind === 'stove-isolator') b.apply(mutations.removeFixture(b.doc, floor().id, fixture.id), 'no stove isolator')
  }
  b.fixture(0, 'gas-cylinder', { x: e + 0.5, z: 57.5 }, { x: 1, z: 0 })
  // Timber counters, with the sink and the gas hob set into them.
  b.counters(0, { x: 45, z: 62 }, { top: 'timber', builtIn: true })

  // The roof slopes down to the north, its face to the sun, and carries the panels.
  b.storey(0, { x: w, z: s })
  b.roof(1, { pitchDeg: 12, eaves: 0.6, form: 'mono', covering: 'ibr', turns: 2 })

  // A 10,000 litre tank under each downpipe at the north corners.
  b.fixture(0, 'water-tank', { x: w - 1, z: n - 1 }, { x: -1, z: 0 }, { litres: 10000 })
  b.fixture(0, 'water-tank', { x: e + 1, z: n - 1 }, { x: 1, z: 0 }, { litres: 10000 })

  // The septic tank downhill of the house, its soakaway further down; the geyser in the middle of the house.
  b.apply(mutations.setSewerType(b.doc, 'septic'), 'septic tank')
  b.apply(mutations.setServicePoint(b.doc, 'sewer', { x: 40, z: 74 }), 'septic tank spot')
  b.apply(mutations.setSoakaway(b.doc, { x: 40, z: 82 }), 'soakaway')
  // The wastes leave on the south side; the drain goes round the west end of the house, downhill to the tank.
  b.apply(mutations.setServiceBends(b.doc, 'sewer', [{ x: 30, z: 54 }, { x: 30, z: 70 }]), 'drain round the house')
  const geyser = floor().fixtures?.find((fixture) => fixture.kind === 'solar-geyser')
  if (geyser) b.apply(mutations.updateFixture(b.doc, floor().id, geyser.id, { x: 41, z: 60 }), 'geyser in the middle')
  // A gravel drive up from the farm road to the back door.
  b.paving([[49.5, 0], [53, 0], [53, 54], [49.5, 54]], 'gravel')
  b.apply(mutations.setRainfall(b.doc, 700), 'rainfall')
  b.apply(mutations.setBackupHours(b.doc, 24), 'backup hours')
  // Lights and plugs stay on through the night from the battery; twenty panels, 11 kWp, charge it.
  for (const circuit of electricalLayout(b.doc).circuits) {
    if (circuit.kind === 'lights' || circuit.kind === 'plugs') b.apply(mutations.setEssential(b.doc, circuit.id, true), `essential ${circuit.id}`)
  }
  b.apply(mutations.setSolarPanels(b.doc, Math.min(20, powerLayout(b.doc).capacity)), 'solar panels')
  return b.doc
}

import { outsideFaces } from '../geometry/finishes'
import * as mutations from '../model/mutations'
import type { Document } from '../model/types'
import { Builder, terrain } from './build'

// A real stand in Mount Moreland, KwaZulu-Natal, traced from the municipal map, an aerial photograph and the
// owner's description: 2,023 m², about 40 × 50 m, lying 12° off north and falling some eight metres from its
// north-east corner to the south-west. The main house stands on an upper terrace; a 9 × 9 m cottage sits on a
// lower one, with a bank between them and a walled garden and deck behind it. Positions are good to a few metres.
// Only the main house's outline is drawn: its rooms are not known.
export function mountMoreland(): Document {
  const [wide, deep] = [40.1, 50.4]
  const ring: [number, number][] = [
    [0, 0],
    [wide, 0],
    [wide, deep],
    [0, deep],
  ]

  // The main house: 15 × 7.5 m, turned 32° from the boundaries, with a roofed patio across its north-west end.
  const centre = { x: 26, z: 38 }
  const turn = (32 * Math.PI) / 180
  const u = { x: Math.sin(turn), z: -Math.cos(turn) }
  const v = { x: Math.cos(turn), z: Math.sin(turn) }
  const round = (value: number) => Math.round(value * 1000) / 1000
  // A point of the main house: s metres along it from its middle, t metres across.
  const at = (s: number, t: number) => ({ x: round(centre.x + u.x * s + v.x * t), z: round(centre.z + u.z * s + v.z * t) })

  // Ground levels in metres above the 50 m contour. The corners are read off the contours; the two terraces are
  // cut level into the slope, each with a bank about three metres wide round it.
  const corner = { sw: 1.5, se: 5.5, nw: 2, ne: 10 }
  const ease = (d: number) => {
    const k = Math.min(1, Math.max(0, 1 - d / 3))
    return k * k * (3 - 2 * k)
  }
  const outside = (value: number, min: number, max: number) => Math.max(min - value, 0, value - max)
  const LOWER = 3.6
  const UPPER = 6.4
  const ground = (x: number, z: number) => {
    const tx = Math.min(1, Math.max(0, x / wide))
    const tz = Math.min(1, Math.max(0, z / deep))
    const slope = (corner.sw * (1 - tx) + corner.se * tx) * (1 - tz) + (corner.nw * (1 - tx) + corner.ne * tx) * tz
    const lower = ease(Math.hypot(outside(x, 5, 22), outside(z, 13.5, 35)))
    const s = (x - centre.x) * u.x + (z - centre.z) * u.z
    const t = (x - centre.x) * v.x + (z - centre.z) * v.z
    const upper = ease(Math.hypot(outside(s, -13, 10), outside(t, -6, 7)))
    const stepped = slope + (LOWER - slope) * lower
    return stepped + (UPPER - stepped) * upper
  }

  const b = new Builder(
    // The access track runs down the west boundary from Church Street.
    { ring, northBearingDeg: -11.8, latitude: -29.64, longitude: 31.09, roads: [3] },
    terrain(ring, ground),
    'block-140',
    { roofForm: 'gable', roofCovering: 'concrete-tile', roofPitchDeg: 17.5, roofEaves: 0.5, apronWidth: 1.5, apronSurface: 'concrete', outsidePaint: 'navy', insidePaint: 'white' },
  )
  const block = { systemId: 'block-140' as const, skin: 'single' as const }

  // The cottage, 9 × 9 m, square to the boundaries, its gable ends to the north and south.
  const [x0, z0] = [9.5, 21.5]
  b.rect(0, x0, z0, x0 + 9, z0 + 9, block)
  // A full-height wall cuts a 3 m slice off the east side: the bedroom, with its en suite at the far end.
  b.walls(0, [{ x: x0 + 6, z: z0 }, { x: x0 + 6, z: z0 + 9 }], { systemId: 'block-90', skin: 'single' })
  b.walls(0, [{ x: x0 + 6, z: z0 + 3 }, { x: x0 + 9, z: z0 + 3 }], { systemId: 'block-90', skin: 'single' })
  // The rest is one open room; a line with nothing built on it tells the kitchen from the living area.
  b.walls(0, [{ x: x0, z: z0 + 6 }, { x: x0 + 6, z: z0 + 6 }], { skin: 'logical' })

  // The front gable: a window, double doors and a window. The back: double doors onto the deck, and a window.
  b.opening(0, 'window', { x: x0 + 1.8, z: z0 + 9 })
  b.opening(0, 'door', { x: x0 + 4.5, z: z0 + 9 }, 1.6)
  b.opening(0, 'window', { x: x0 + 7.4, z: z0 + 9 })
  b.opening(0, 'door', { x: x0 + 1.6, z: z0 }, 1.6)
  b.opening(0, 'window', { x: x0 + 4.4, z: z0 })
  // Two windows down the west side, and one each for the bedroom and the en suite on the east.
  b.opening(0, 'window', { x: x0, z: z0 + 4.4 })
  b.opening(0, 'window', { x: x0, z: z0 + 1.8 })
  b.opening(0, 'window', { x: x0 + 9, z: z0 + 6 }, 1.6)
  b.opening(0, 'window', { x: x0 + 9, z: z0 + 1.5 }, 0.6)
  b.opening(0, 'internal-door', { x: x0 + 6, z: z0 + 7.5 })
  b.opening(0, 'internal-door', { x: x0 + 7.5, z: z0 + 3 })

  b.room(0, { x: x0 + 3, z: z0 + 7.5 }, 'Kitchen', 'kitchen')
  b.room(0, { x: x0 + 3, z: z0 + 3 }, 'Living', 'living')
  b.room(0, { x: x0 + 7.5, z: z0 + 6 }, 'Bedroom', 'bedroom')
  b.room(0, { x: x0 + 7.5, z: z0 + 1.5 }, 'En suite', 'bathroom')

  // The deck behind the cottage: 3 m wide and 6 m out, down the west side of the walled garden.
  const gap = 0.05
  const [gz0, gz1] = [z0 - 6, z0 - gap]
  b.rect(0, x0, gz0, x0 + 3, gz1, { skin: 'logical' })
  b.room(0, { x: x0 + 1.5, z: z0 - 3 }, 'Deck', 'other', false)
  // The garden wall runs round the deck and the 6 × 6 m lawn beside it, with a gate left by the house.
  b.walls(0, [{ x: x0 + 3, z: gz0 }, { x: x0 + 9, z: gz0 }, { x: x0 + 9, z: z0 - 1.2 }], { skin: 'logical' })
  const floor = () => b.floor(0)
  for (const p of [{ x: x0, z: z0 - 3 }, { x: x0 + 1.5, z: gz0 }, { x: x0 + 6, z: gz0 }, { x: x0 + 9, z: z0 - 3.6 }]) {
    b.apply(mutations.setFence(b.doc, floor().id, b.wallAt(0, p).id, { type: 'precast', height: 1.2 }), 'garden wall')
  }

  // The main house: its outline only, with the front door under the patio roof and a window to the west.
  b.walls(0, [at(-7.5, -3.75), at(7.5, -3.75), at(7.5, 3.75), at(-7.5, 3.75)], { ...block, closed: true })
  b.walls(0, [at(-7.5, -3.75), at(-10.5, -3.75), at(-10.5, 3.75), at(-7.5, 3.75)], { skin: 'logical' })
  b.opening(0, 'external-door', at(-7.5, 0))
  b.opening(0, 'window', at(-3, -3.75), 1.6)
  b.opening(0, 'window', at(3, -3.75), 1.6)
  b.room(0, at(0, 0), 'Main house', 'other', false)
  b.room(0, at(-9, 0), 'Patio', 'other', false)

  // A tiled gable over the cottage, its ridge running north to south, and a tiled hip over the main house and its patio.
  b.cover({ x: x0, z: z0 }, { pitchDeg: 17.5, eaves: 0.5, form: 'gable', covering: 'concrete-tile', turns: 1 })
  b.cover(at(7.5, -3.75), { pitchDeg: 22, eaves: 0.5, form: 'hip', covering: 'concrete-tile' })

  // The deck is timber; the patio is paved.
  for (const space of floor().spaces ?? []) {
    if (space.name === 'Deck') b.apply(mutations.updateSpace(b.doc, floor().id, space.id, { finish: 'timber' }), 'deck boards')
    if (space.name === 'Patio') b.apply(mutations.updateSpace(b.doc, floor().id, space.id, { finish: 'tiles' }), 'patio tiles')
  }

  // Both buildings are plastered and painted the same dark blue.
  const faces = outsideFaces(floor())
  for (const wall of floor().walls) {
    if (wall.skin === 'logical') continue
    for (const side of [1, -1] as const) {
      if (faces(wall, side)) b.apply(mutations.setFaceFinish(b.doc, floor().id, wall.id, side, { finish: 'plastered', paint: 'navy' }), 'paint')
    }
  }

  // A rainwater tank at the cottage's south-west corner, under the downpipe.
  b.fixture(0, 'water-tank', { x: x0 - 0.8, z: z0 + 0.8 }, { x: -1, z: 0 }, { litres: 2500 })

  // No sewer in the village: a septic tank in the low south-west corner, with the drain taken out under the lawn.
  b.apply(mutations.setSewerType(b.doc, 'septic'), 'septic tank')
  b.apply(mutations.setServicePoint(b.doc, 'sewer', { x: 6, z: 10 }), 'septic tank spot')
  b.apply(mutations.setSoakaway(b.doc, { x: 4, z: 5 }), 'soakaway')
  b.apply(mutations.setServiceBends(b.doc, 'sewer', [{ x: 14.75, z: 14.5 }]), 'drain out through the lawn')
  const geyser = floor().fixtures?.find((fixture) => fixture.kind === 'geyser')
  if (geyser) {
    b.apply(mutations.setFixtureKind(b.doc, floor().id, geyser.id, 'solar-geyser'), 'solar geyser')
    b.apply(mutations.updateFixture(b.doc, floor().id, geyser.id, { x: x0 + 5.7, z: z0 + 5.5 }), 'geyser in the middle')
  }
  b.fixture(0, 'db-board', { x: x0 + 0.3, z: z0 + 3.1 }, { x: 1, z: 0 })

  // The gravel drive comes in off the track and down to the cottage's front door.
  b.paving([[0, 38], [0, 41.5], [15.5, 32.5], [12.5, 32]], 'gravel')
  b.apply(mutations.setRainfall(b.doc, 1000), 'rainfall')
  return b.doc
}

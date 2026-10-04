import { outsideFaces } from '../geometry/finishes'
import * as mutations from '../model/mutations'
import type { Document } from '../model/types'
import { Builder, terrain } from './build'

// A real stand in Mount Moreland, KwaZulu-Natal, traced from the municipal map, an aerial photograph and the
// owner's description: 2,023 m², about 40 × 50 m, lying 12° off north and falling some eight metres from its
// north-east corner to the south-west. The main house stands on an upper terrace; a 9 × 9 m cottage sits on a
// lower one, with a bank between them and a walled garden and deck behind it. Positions are good to a few metres.
// The main house is laid out from measurements taken inside it; its windows are placed by eye.
export function mountMoreland(): Document {
  const [wide, deep] = [40.1, 50.4]
  const ring: [number, number][] = [
    [0, 0],
    [wide, 0],
    [wide, deep],
    [0, deep],
  ]

  // The main house, turned 32° from the boundaries: 7.6 m wide and 17.5 m long inside its walls. Its short north
  // face and its front, the long west side, look towards the gate.
  const [INSIDE_WIDE, INSIDE_LONG] = [7.6, 17.5]
  const HALF_WALL = 0.07
  const centre = { x: 28.5, z: 36.5 }
  const turn = (32 * Math.PI) / 180
  const u = { x: Math.sin(turn), z: -Math.cos(turn) }
  const v = { x: Math.cos(turn), z: Math.sin(turn) }
  const round = (value: number) => Math.round(value * 1000) / 1000
  // A point of the main house, as it is measured inside: s metres from the inside of the north face, t metres
  // from the inside of the west wall.
  const at = (s: number, t: number) => {
    const along = s - INSIDE_LONG / 2
    const across = t - INSIDE_WIDE / 2
    return { x: round(centre.x + u.x * along + v.x * across), z: round(centre.z + u.z * along + v.z * across) }
  }
  // The lines the outside walls are drawn on, half a wall beyond the inside faces.
  const [N, S, W, E] = [-HALF_WALL, INSIDE_LONG + HALF_WALL, -HALF_WALL, INSIDE_WIDE + HALF_WALL]
  const PATIO = 2.8

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
    const upper = ease(Math.hypot(outside(s, -13, 10.5), outside(t, -7.6, 6.5)))
    const stepped = slope + (LOWER - slope) * lower
    return stepped + (UPPER - stepped) * upper
  }

  const b = new Builder(
    // No street runs along the stand: the way in is through a neighbour's, to a gate near the north-west corner.
    { ring, northBearingDeg: -11.8, latitude: -29.64, longitude: 31.09 },
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

  // The main house. The open-plan living area and kitchen fill the north end; a corridor runs south from it,
  // 3 m in from the front, with rooms 3 m deep on its west side and the main bedroom on its east.
  const thin = { systemId: 'block-90' as const, skin: 'single' as const }
  const OPEN = 6.3 + 0.045
  const [HALL_W, HALL_E] = [3.045, 4.145]
  const KITCHEN_END = OPEN + 1.9
  b.walls(0, [at(N, W), at(OPEN, W), at(S, W), at(S, E), at(N, E)], { ...block, closed: true })
  b.walls(0, [at(OPEN, W), at(OPEN, HALL_W), at(S, HALL_W)], thin)
  b.walls(0, [at(OPEN, HALL_E), at(KITCHEN_END, HALL_E), at(16.445, HALL_E)], thin)
  b.walls(0, [at(KITCHEN_END, HALL_E), at(KITCHEN_END, E)], thin)
  // The corridor turns east at its end for 2.67 m, past the foot of the main bedroom.
  b.walls(0, [at(16.445, HALL_E), at(16.445, 6.86), at(16.445, E)], thin)
  b.walls(0, [at(16.445, 6.86), at(S, 6.86)], thin)
  // West of the corridor: a bedroom, the shared bathroom (3 × 2.5 m) and the guest room (3 × 3 m) in the corner.
  b.walls(0, [at(11.745, W), at(11.745, HALL_W)], thin)
  b.walls(0, [at(14.345, W), at(14.345, HALL_W)], thin)
  // Lines with nothing built on them: across the mouth of the corridor, and round the kitchen.
  b.walls(0, [at(OPEN, HALL_W), at(OPEN, HALL_E)], { skin: 'logical' })
  b.walls(0, [at(OPEN, HALL_E), at(3, HALL_E), at(3, E)], { skin: 'logical' })

  // The front door is 1.7 m wide, 0.46 m from the north face; the back door is 3.8 m down the east wall.
  b.opening(0, 'door', at(0.46 + 0.85, W), 1.7)
  b.opening(0, 'external-door', at(3.8 + 0.45, E), 0.9)
  b.opening(0, 'internal-door', at(9.3 + 0.4, HALL_W))
  b.opening(0, 'internal-door', at(10.45 + 0.4, HALL_E))
  b.opening(0, 'internal-door', at(12.4, HALL_W))
  b.opening(0, 'internal-door', at(15.6, HALL_W))
  // Windows, placed by eye.
  b.opening(0, 'window', at(4.4, W), 1.6)
  b.opening(0, 'window', at(N, 2), 1.6)
  b.opening(0, 'window', at(N, 5.6), 1.6)
  b.opening(0, 'window', at(6.4, E), 2)
  b.opening(0, 'window', at(9, W), 1.8)
  b.opening(0, 'window', at(13.1, W), 0.6)
  b.opening(0, 'window', at(16, W))
  b.opening(0, 'window', at(11, E), 1.6)
  b.opening(0, 'window', at(14.5, E), 1.6)

  b.room(0, at(2, 2), 'Lounge', 'living')
  b.room(0, at(5, 6), 'Main kitchen', 'kitchen')
  b.room(0, at(9, 1.5), 'Bedroom 2', 'bedroom')
  b.room(0, at(13, 1.5), 'Bathroom', 'bathroom')
  b.room(0, at(16, 1.5), 'Guest room', 'bedroom')
  b.room(0, at(12, 6), 'Bedroom 1', 'bedroom')
  b.room(0, at(12, 3.6), 'Corridor', 'passage')

  // The patio is an L, 2.8 m deep, round the north-west corner: across the north face and down the front as far
  // as the open-plan room goes, looking towards the gate.
  b.walls(0, [at(N, E), at(N - PATIO, E), at(N - PATIO, W - PATIO), at(OPEN, W - PATIO), at(OPEN, W)], { skin: 'logical' })
  b.room(0, at(N - PATIO / 2, 3), 'Patio', 'other', false)

  // A palisade fence 300 mm inside the boundary, with a 3.5 m gate in the north side, 3 m from the north-west corner.
  const inset = 0.3
  const fence = [
    { x: 3, z: deep - inset },
    { x: inset, z: deep - inset },
    { x: inset, z: inset },
    { x: wide - inset, z: inset },
    { x: wide - inset, z: deep - inset },
    { x: 6.5, z: deep - inset },
  ]
  b.walls(0, fence, { skin: 'logical' })
  for (let i = 0; i < fence.length - 1; i++) {
    const mid = { x: (fence[i].x + fence[i + 1].x) / 2, z: (fence[i].z + fence[i + 1].z) / 2 }
    b.apply(mutations.setFence(b.doc, floor().id, b.wallAt(0, mid).id, { type: 'palisade', height: 1.8 }), 'boundary fence')
  }

  // A tiled gable over the cottage, its ridge running north to south, and a tiled hip over the main house and its patio.
  b.cover({ x: x0, z: z0 }, { pitchDeg: 17.5, eaves: 0.5, form: 'gable', covering: 'concrete-tile', turns: 1 })
  b.cover(at(S, E), { pitchDeg: 22, eaves: 0.5, form: 'hip', covering: 'concrete-tile' })

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

  // No sewer in the village: a septic tank in the low south-west corner, with the drain taken round the walled garden.
  b.apply(mutations.setSewerType(b.doc, 'septic'), 'septic tank')
  b.apply(mutations.setServicePoint(b.doc, 'sewer', { x: 7, z: 12 }), 'septic tank spot')
  b.apply(mutations.setSoakaway(b.doc, { x: 6, z: 6 }), 'soakaway')
  b.apply(mutations.setServiceBends(b.doc, 'sewer', [{ x: 20.3, z: 28.75 }, { x: 20.3, z: 14.5 }]), 'drain round the garden')
  const geyser = floor().fixtures?.find((fixture) => fixture.kind === 'geyser')
  if (geyser) {
    b.apply(mutations.setFixtureKind(b.doc, floor().id, geyser.id, 'solar-geyser'), 'solar geyser')
    b.apply(mutations.updateFixture(b.doc, floor().id, geyser.id, { x: x0 + 5.7, z: z0 + 5.5 }), 'geyser in the middle')
  }
  b.fixture(0, 'db-board', { x: x0 + 0.3, z: z0 + 3.1 }, { x: 1, z: 0 })

  // The main house has its own hot water, by the bathroom.
  b.fixture(0, 'solar-geyser', at(12.2, 2.9), { x: -v.x, z: -v.z })

  // The gravel drive comes in at the gate and down to the cottage's front door.
  b.paving([[3, deep - inset], [6.5, deep - inset], [15.5, 32.5], [12.5, 32]], 'gravel')
  b.apply(mutations.setRainfall(b.doc, 1000), 'rainfall')
  return b.doc
}

import { outsideFaces } from '../geometry/finishes'
import * as mutations from '../model/mutations'
import type { Document } from '../model/types'
import { CARPORT_BAY_M, CARPORT_DEEP_M } from '../model/carports'
import { Builder, terrain } from './build'

// A real stand near Verulam, KwaZulu-Natal, traced from the municipal map, an aerial photograph and the
// owner's description: 2,023 m², about 40 × 50 m, lying 12° off north and falling some eight metres from its
// north-east corner to the south-west. The main house stands on an upper terrace; a 9 × 9 m cottage sits on a
// lower one, with a bank between them and a walled garden and deck behind it. Positions are good to a few metres.
// The main house is laid out from measurements taken inside it; its windows are placed by eye.
export function verulam(): Document {
  const [wide, deep] = [40.1, 50.4]
  const ring: [number, number][] = [
    [0, 0],
    [wide, 0],
    [wide, deep],
    [0, deep],
  ]

  // The main house, turned 32° from the boundaries: 7.6 m wide and 14.4 m long inside its walls. Its short north
  // face and its front, the long west side, look towards the gate.
  const [INSIDE_WIDE, INSIDE_LONG] = [7.6, 14.4]
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
    const lower = ease(Math.hypot(outside(x, 2.5, 22), outside(z, 13.5, 35)))
    const s = (x - centre.x) * u.x + (z - centre.z) * u.z
    const t = (x - centre.x) * v.x + (z - centre.z) * v.z
    const upper = ease(Math.hypot(outside(s, -16, 10.5), outside(t, -7.6, 6.5)))
    const stepped = slope + (LOWER - slope) * lower
    return stepped + (UPPER - stepped) * upper
  }

  const b = new Builder(
    // No street runs along the stand: the way in is through a neighbour's, to a gate near the north-west corner.
    { ring, northBearingDeg: -11.8, latitude: -29.64, longitude: 31.05 },
    terrain(ring, ground),
    'block-140',
    { roofForm: 'gable', roofCovering: 'concrete-tile', roofPitchDeg: 17.5, roofEaves: 0.5, apronWidth: 1.5, apronSurface: 'concrete', outsidePaint: 'navy', insidePaint: 'white' },
  )
  const block = { systemId: 'block-140' as const, skin: 'single' as const }

  // The cottage, 9 × 9 m, square to the boundaries, its gable ends to the north and south.
  const [x0, z0] = [9.5, 21.5]
  b.rect(0, x0, z0, x0 + 9, z0 + 9, block)
  // A full-height wall cuts a 3 m slice off the east side: the bedroom at the front, its en suite (3 × 3 m) behind.
  b.walls(0, [{ x: x0 + 6, z: z0 }, { x: x0 + 6, z: z0 + 9 }], { systemId: 'block-90', skin: 'single' })
  b.walls(0, [{ x: x0 + 6, z: z0 + 3 }, { x: x0 + 9, z: z0 + 3 }], { systemId: 'block-90', skin: 'single' })
  // The rest is one open room, 6 × 9 m. The kitchenette is the 3 × 3 m in its south-east corner, against the
  // en suite and open to the north; lines with nothing built on them mark it off. Its bar is not drawn.
  b.walls(0, [{ x: x0 + 3, z: z0 }, { x: x0 + 3, z: z0 + 3 }, { x: x0 + 6, z: z0 + 3 }], { skin: 'logical' })

  // The front gable: a window, double doors and a window. The back: double doors onto the deck, and the
  // kitchenette's window.
  b.opening(0, 'window', { x: x0 + 1.8, z: z0 + 9 })
  b.opening(0, 'door', { x: x0 + 4.5, z: z0 + 9 }, 1.6)
  b.opening(0, 'window', { x: x0 + 7.4, z: z0 + 9 })
  b.opening(0, 'door', { x: x0 + 1.6, z: z0 }, 1.6)
  b.opening(0, 'window', { x: x0 + 4.5, z: z0 })
  // Two windows down the west side, in the living area, and one each for the bedroom and the en suite on the east.
  b.opening(0, 'window', { x: x0, z: z0 + 4.4 })
  b.opening(0, 'window', { x: x0, z: z0 + 1.8 })
  b.opening(0, 'window', { x: x0 + 9, z: z0 + 6 }, 1.6)
  b.opening(0, 'window', { x: x0 + 9, z: z0 + 1.5 }, 0.6)
  b.opening(0, 'internal-door', { x: x0 + 6, z: z0 + 7.5 })
  b.opening(0, 'internal-door', { x: x0 + 7.5, z: z0 + 3 })

  b.room(0, { x: x0 + 4.5, z: z0 + 1.5 }, 'Kitchenette', 'kitchen')
  b.room(0, { x: x0 + 3, z: z0 + 6 }, 'Living', 'living')
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
    b.apply(mutations.setFence(b.doc, floor().id, b.wallAt(0, p).id, { type: 'half-wall', height: 1 }), 'garden wall')
  }

  // The main house, from measurements taken inside it. Facing south there are two sides to it.
  // West: the open-plan room, then bedroom 2 (3.7 × 3.2 m), then bedroom 1 in the corner.
  // East: the kitchen, running on 1.9 m beside the mouth of the corridor; the bathroom (3 m long, 2.5 m wide,
  // counting the shower that runs across the end of the corridor's turn) behind the kitchen's end wall; the
  // turn itself; and the guest room (3 × 3 m) in the corner.
  // The corridor starts 3 m in from the front, 1.2 m wide, with 0.5 m of built-in storage between it and the
  // bathroom. It runs past the doors of both bedrooms, stops 3 m short of the south face and turns east as far
  // as the shower,
  // with the bathroom's door on one side of the turn and the guest room's on the other. South of the turn,
  // bedroom 1 takes in the corridor's width as well, 1.2 m against the guest room's wall, so it is not a rectangle.
  const thin = { systemId: 'block-90' as const, skin: 'single' as const }
  const OPEN = 6.3 + 0.045
  const [HALL_W, HALL_E] = [3.245, 4.535]
  const STORE = HALL_E + 0.5 + 0.09
  const KITCHEN_END = OPEN + 1.9
  const BED2_END = OPEN + 3.7 + 0.09
  // Bedroom 1's door stands hard against the south wall of the corridor, its frame 10.45 m from the north face.
  const LEG_S = 10.45 + 0.85 + 0.045
  const LEG_N = LEG_S - 1.2 - 0.09
  // The turn stops short of the east wall: the last 0.95 m is the bathroom's shower.
  const LEG_E = INSIDE_WIDE - 0.95 - 0.045
  b.walls(0, [at(N, W), at(OPEN, W), at(S, W), at(S, E), at(N, E)], { ...block, closed: true })
  // West of the corridor: bedroom 2, then bedroom 1, whose door is the last on the corridor before the turn.
  b.walls(0, [at(OPEN, W), at(OPEN, HALL_W), at(BED2_END, HALL_W), at(LEG_S, HALL_W)], thin)
  b.walls(0, [at(BED2_END, W), at(BED2_END, HALL_W)], thin)
  // East of it: the kitchen's short wall, the storage, and the bathroom behind the kitchen's end wall.
  b.walls(0, [at(OPEN, HALL_E), at(KITCHEN_END, HALL_E), at(LEG_N, HALL_E)], thin)
  b.walls(0, [at(KITCHEN_END, HALL_E), at(KITCHEN_END, STORE), at(KITCHEN_END, E)], thin)
  b.walls(0, [at(KITCHEN_END, STORE), at(LEG_N, STORE)], thin)
  // The turn east: the bathroom to its north, the guest room to its south, and the bathroom's shower across its end.
  b.walls(0, [at(LEG_N, HALL_E), at(LEG_N, STORE), at(LEG_N, LEG_E), at(LEG_S, LEG_E)], thin)
  b.walls(0, [at(LEG_S, HALL_W), at(LEG_S, HALL_E), at(LEG_S, LEG_E), at(LEG_S, E)], thin)
  b.walls(0, [at(LEG_S, HALL_E), at(S, HALL_E)], thin)
  // Lines with nothing built on them: across the mouth of the corridor, and round the kitchen.
  b.walls(0, [at(OPEN, HALL_W), at(OPEN, HALL_E)], { skin: 'logical' })
  b.walls(0, [at(OPEN, HALL_E), at(3, HALL_E), at(3, E)], { skin: 'logical' })

  // The front door is 1.7 m wide, 0.46 m from the north face; the back door is 3.8 m down the east wall.
  b.opening(0, 'door', at(0.46 + 0.85, W), 1.7)
  b.opening(0, 'external-door', at(3.8 + 0.45, E), 0.9)
  // Bedroom 2's door frame is 9.3 m from the north face and bedroom 1's 10.45 m, hard against the wall between them.
  b.opening(0, 'internal-door', at(9.3 + 0.4, HALL_W))
  b.opening(0, 'internal-door', at(LEG_S - 0.045 - 0.4, HALL_W), 0.8)
  // The bathroom's door is off the turn, beside its shower; the guest room's is opposite.
  b.opening(0, 'internal-door', at(LEG_N, (STORE + LEG_E) / 2))
  b.opening(0, 'internal-door', at(LEG_S, (HALL_E + LEG_E) / 2))
  // Windows, placed by eye.
  b.opening(0, 'window', at(4.4, W), 1.6)
  b.opening(0, 'window', at(N, 2), 2.2)
  b.opening(0, 'window', at(N, 5.6), 2.2)
  b.opening(0, 'window', at(6.4, E), 2)
  b.opening(0, 'window', at(8.2, W), 1.6)
  b.opening(0, 'window', at(12.4, W), 2)
  b.opening(0, 'window', at(S, 2), 1.6)
  b.opening(0, 'window', at(13, E), 1.6)
  b.opening(0, 'window', at(9.2, E), 0.6)

  b.room(0, at(2, 2), 'Lounge', 'living')
  b.room(0, at(5, 6), 'Kitchen', 'kitchen')
  b.room(0, at(8.2, 1.5), 'Bedroom 2', 'bedroom')
  b.room(0, at(12.6, 1.5), 'Bedroom 1', 'bedroom')
  b.room(0, at(13, 6), 'Guest room', 'bedroom')
  b.room(0, at(9.2, 6.4), 'Bathroom', 'bathroom')
  b.room(0, at(9, (HALL_W + HALL_E) / 2), 'Corridor', 'passage', false)
  b.room(0, at(9.2, HALL_E + 0.3), 'Storage', 'other', false)

  // The patio is a rectangle 2.8 m deep along the front, outside the front door, under the house's roof. Brick
  // columns carry the roof, with a half wall between them and a way through opposite the front door.
  const patio = [at(N, W), at(N, W - PATIO), at(0.3, W - PATIO), at(2.3, W - PATIO), at(OPEN, W - PATIO), at(OPEN, W)]
  b.walls(0, patio, { skin: 'logical' })
  b.room(0, at(3, W - PATIO / 2), 'Patio', 'other', false)
  for (let i = 0; i < patio.length - 1; i++) {
    const edge = b.wallAt(0, { x: (patio[i].x + patio[i + 1].x) / 2, z: (patio[i].z + patio[i + 1].z) / 2 }).id
    b.apply(mutations.setSupport(b.doc, b.floor(0).id, edge, { type: 'pier', spacing: 2.5 }), 'patio columns')
    // No wall across the way through.
    if (i !== 2) b.apply(mutations.setFence(b.doc, b.floor(0).id, edge, { type: 'half-wall', height: 0.9 }), 'patio wall')
  }

  // Two double carports under shade cloth, each standing free. One is off the north face of the main house,
  // stopping 3 m short of its east end; the other is on the west side of the cottage.
  const CAR = { wide: 2 * CARPORT_BAY_M, deep: CARPORT_DEEP_M, gap: 0.6 }
  b.carport(at(N - CAR.gap - CAR.deep / 2, E - 3 - CAR.wide / 2), { x: u.x, z: u.z }, 2, 'shade-cloth')
  const cottageCarport = { x: x0 - CAR.gap - CAR.wide, z: z0 + 3.5 }
  b.carport({ x: cottageCarport.x + CAR.wide / 2, z: cottageCarport.z + CAR.deep / 2 }, { x: 0, z: -1 }, 2, 'shade-cloth')

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

  // Tiled gables over the cottage, its ridge running north to south, and over the main house with its patio, its
  // ridge running the length of the house.
  b.cover({ x: x0, z: z0 }, { pitchDeg: 17.5, eaves: 0.5, form: 'gable', covering: 'concrete-tile', turns: 1 })
  b.cover(at(S, E), { pitchDeg: 22, eaves: 0.5, form: 'gable', covering: 'concrete-tile', turns: 1 })

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
  b.apply(mutations.setServicePoint(b.doc, 'sewer', { x: 8, z: 9.5 }), 'septic tank spot')
  b.apply(mutations.setSoakaway(b.doc, { x: 6, z: 5.5 }), 'soakaway')
  b.apply(mutations.setServiceBends(b.doc, 'sewer', [{ x: 20.3, z: 28.75 }, { x: 20.3, z: 14.5 }]), 'drain round the garden')
  const geyser = floor().fixtures?.find((fixture) => fixture.kind === 'geyser')
  if (geyser) {
    b.apply(mutations.setFixtureKind(b.doc, floor().id, geyser.id, 'solar-geyser'), 'solar geyser')
    b.apply(mutations.updateFixture(b.doc, floor().id, geyser.id, { x: x0 + 5.7, z: z0 + 3.4 }), 'geyser in the middle')
  }
  b.fixture(0, 'db-board', { x: x0 + 0.3, z: z0 + 7 }, { x: 1, z: 0 })

  // The main house has its own hot water, between the kitchen and the bathroom.
  b.fixture(0, 'solar-geyser', at(8.6, 6.4), { x: -u.x, z: -u.z })

  // The cottage's gravel drive runs from the gate down the west side to its carport. The main house's drive runs
  // down the slope from the patio, the way the front doors face, to meet it.
  const drive = { x: 3, wide: 3.5, turn: 3 }
  b.paving(
    [
      [drive.x, deep - inset],
      [drive.x + drive.wide, deep - inset],
      [drive.x + drive.wide, cottageCarport.z + CAR.deep + drive.turn],
      [cottageCarport.x + CAR.wide, cottageCarport.z + CAR.deep + drive.turn],
      [cottageCarport.x + CAR.wide, cottageCarport.z + CAR.deep],
      [cottageCarport.x, cottageCarport.z + CAR.deep],
      [drive.x, cottageCarport.z + CAR.deep + drive.turn],
    ],
    'gravel',
  )
  const down = 12.4
  const [top0, top1] = [at(-0.2, W - PATIO), at(2.8, W - PATIO)]
  b.paving(
    [
      [top0.x, top0.z],
      [top1.x, top1.z],
      [round(top1.x - v.x * down), round(top1.z - v.z * down)],
      [round(top0.x - v.x * down), round(top0.z - v.z * down)],
    ],
    'gravel',
  )
  b.apply(mutations.setRainfall(b.doc, 1000), 'rainfall')
  return b.doc
}

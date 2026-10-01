import { cornerById } from '../model/geom'
import { fixtureFootprint, fixtureSpec } from '../model/fixtures'
import type { Document, Fixture, FixtureKind, Floor, OpeningKind, RoomType, Wall } from '../model/types'
import { fixtureOnFace } from './fixtures'
import { stairLayout } from './stairs'
import { FLOOR_TO_FLOOR } from '../plot/fixture'
import { wallReach } from './outline'
import { pointInRing } from './pad'
import { ringLabelPoint, type Cell, type WallSide } from './spaces'

type Draft = Omit<Fixture, 'id'>
type Span = { a: number; b: number }
type Face = { wall: Wall; side: WallSide; length: number; spans: Span[]; doors: { u: number; width: number; kind: OpeningKind }[]; windows: { u: number; width: number }[]; outsideBehind: boolean }

const DOORS: OpeningKind[] = ['door', 'external-door', 'internal-door', 'garage']
const CLEAR_M = 0.1
const SOCKETS: Partial<Record<RoomType, number>> = { living: 3, bedroom: 2, kitchen: 3, dining: 1, study: 2, garage: 1, laundry: 1, other: 1 }

function subtract(spans: Span[], cut: Span): Span[] {
  return spans.flatMap((span) => {
    if (cut.b <= span.a || cut.a >= span.b) return [span]
    const out: Span[] = []
    if (cut.a > span.a) out.push({ a: span.a, b: cut.a })
    if (cut.b < span.b) out.push({ a: cut.b, b: span.b })
    return out
  })
}

// The faces of a room's walls, each with the stretches still free of doors, windows and corners.
function roomFaces(floor: Floor, cell: Cell, cellsBehind: (x: number, z: number) => boolean): Face[] {
  const faces: Face[] = []
  for (const wall of floor.walls) {
    if (wall.skin === 'logical') continue
    const a = cornerById(floor.corners, wall.startCornerId)
    const b = cornerById(floor.corners, wall.endCornerId)
    if (!a || !b) continue
    const length = Math.hypot(b.x - a.x, b.z - a.z)
    if (length < 0.3) continue
    const reach = wallReach(wall)
    for (const side of [1, -1] as const) {
      const n = { x: (-(b.z - a.z) / length) * side, z: ((b.x - a.x) / length) * side }
      const mid = { x: (a.x + b.x) / 2 + n.x * (reach + 0.05), z: (a.z + b.z) / 2 + n.z * (reach + 0.05) }
      if (!pointInRing(cell.net, mid.x, mid.z)) continue
      const behind = { x: (a.x + b.x) / 2 - n.x * (reach + 0.05), z: (a.z + b.z) / 2 - n.z * (reach + 0.05) }
      let spans: Span[] = [{ a: 0.2, b: length - 0.2 }]
      const doors: Face['doors'] = []
      const windows: Face['windows'] = []
      const t = { x: (b.x - a.x) / length, z: (b.z - a.z) / length }
      // Anything standing against this face takes its stretch: stairs and fittings already placed.
      const blockers = [
        ...(floor.stairs ?? []).map((stair) => stairLayout(stair, floor.index).footprint),
        ...(floor.fixtures ?? []).filter((fixture) => fixtureSpec(fixture.kind).mount !== 'ceiling').map((fixture) => fixtureFootprint(fixture)),
      ]
      for (const footprint of blockers) {
        const near = footprint.some((point) => {
          const across = (point.x - a.x) * n.x + (point.z - a.z) * n.z
          return across > 0 && across < reach + 0.3
        })
        if (!near) continue
        const us = footprint.map((point) => (point.x - a.x) * t.x + (point.z - a.z) * t.z)
        spans = subtract(spans, { a: Math.min(...us) - CLEAR_M, b: Math.max(...us) + CLEAR_M })
      }
      for (const opening of wall.openings) {
        spans = subtract(spans, { a: opening.u - CLEAR_M, b: opening.u + opening.width + CLEAR_M })
        if (DOORS.includes(opening.kind)) doors.push({ u: opening.u, width: opening.width, kind: opening.kind })
        if (opening.kind === 'window') windows.push({ u: opening.u, width: opening.width })
      }
      faces.push({ wall, side, length, spans, doors, windows, outsideBehind: !cellsBehind(behind.x, behind.z) })
    }
  }
  return faces
}

function fits(cell: Cell, draft: Draft): boolean {
  const spec = fixtureSpec(draft.kind)
  if (spec.outside || spec.mount === 'ceiling') return true
  return fixtureFootprint(draft).every((point) => pointInRing(cell.net, point.x, point.z))
}

const isGeyser = (kind: FixtureKind) => kind === 'geyser' || kind === 'solar-geyser'

// The geyser goes in the roof space over the top walled storey of the room's building, not into the floor above.
function roofSpaceY(doc: Document, floor: Floor, cell: Cell): number {
  const unitId = floor.unitId ?? floor.corners.find((corner) => cell.room.cornerIds.includes(corner.id))?.unitId
  const top = unitId
    ? Math.max(floor.index, ...doc.building.floors.filter((item) => item.unitId === unitId && item.walls.length > 0).map((item) => item.index))
    : floor.index
  return (top - floor.index) * FLOOR_TO_FLOOR + fixtureSpec('geyser').y
}

// A first pass of fittings for one room, by its use. Nothing is placed where the room already has fittings.
export function suggestRoomFixtures(doc: Document, floor: Floor, cell: Cell, type: RoomType, cells: Cell[]): Draft[] {
  const inRoom = (x: number, z: number) => cells.some((item) => pointInRing(item.ring, x, z))
  const faces = roomFaces(floor, cell, inRoom)
  const drafts: Draft[] = []
  const add = (draft: Draft | null) => {
    if (draft && fits(cell, draft)) drafts.push(draft)
    return draft !== null && fits(cell, draft)
  }
  const at = (face: Face, kind: FixtureKind, u: number, side: WallSide = face.side) => {
    const draft = fixtureOnFace(floor, face.wall, side, kind, u, fixtureSpec(kind).y)
    return draft
  }
  const reserve = (face: Face, u: number, width: number) => {
    face.spans = subtract(face.spans, { a: u - width / 2 - 0.05, b: u + width / 2 + 0.05 })
  }
  // Floor items tuck in from the start of the longest free stretch.
  const tuck = (kind: FixtureKind, choose: (face: Face) => boolean = () => true) => {
    const width = fixtureSpec(kind).width
    const options = faces
      .filter(choose)
      .flatMap((face) => face.spans.map((span) => ({ face, span })))
      .filter(({ span }) => span.b - span.a >= width)
      .sort((x, y) => y.span.b - y.span.a - (x.span.b - x.span.a))
    for (const { face, span } of options) {
      const u = span.a + width / 2
      if (add(at(face, kind, u))) {
        reserve(face, u, width)
        return true
      }
    }
    return false
  }
  const middle = (kind: FixtureKind) => {
    const width = fixtureSpec(kind).width
    const options = faces
      .flatMap((face) => face.spans.map((span) => ({ face, span })))
      .filter(({ span }) => span.b - span.a >= width + 0.4)
      .sort((x, y) => y.span.b - y.span.a - (x.span.b - x.span.a))
    const pick = options[0]
    if (!pick) return false
    const u = (pick.span.a + pick.span.b) / 2
    if (!add(at(pick.face, kind, u))) return false
    pick.face.spans = subtract(pick.face.spans, { a: u - width / 2 - 0.5, b: u + width / 2 + 0.5 })
    return true
  }

  const centre = ringLabelPoint(cell.net)
  drafts.push({ kind: 'light', x: centre.x, z: centre.z, dx: 1, dz: 0, y: fixtureSpec('light').y })

  const door = faces.flatMap((face) => face.doors.map((item) => ({ face, ...item })))[0]
  if (door) {
    const width = fixtureSpec('switch').width
    const after = door.u + door.width + 0.15 + width / 2
    const before = door.u - 0.15 - width / 2
    const roomAfter = door.face.length - after
    const u = roomAfter >= before ? after : before
    // Bathroom and toilet switches go outside the door, away from water.
    const wet = type === 'bathroom' || type === 'toilet'
    if (wet) {
      const draft = at(door.face, 'switch', u, door.face.side === 1 ? -1 : 1)
      if (draft) drafts.push(draft)
    } else if (add(at(door.face, 'switch', u))) reserve(door.face, u, width)
  }

  const external = faces.flatMap((face) => face.doors.filter((item) => item.kind === 'external-door').map((item) => ({ face, ...item })))
  for (const item of external) {
    const width = fixtureSpec('outdoor-light').width
    const u = item.u + item.width + 0.2 + width / 2
    const other: WallSide = item.face.side === 1 ? -1 : 1
    const draft = at(item.face, 'outdoor-light', u < item.face.length - 0.2 ? u : item.u - 0.2 - width / 2, other)
    if (draft) drafts.push(draft)
  }

  if (type === 'kitchen') {
    const windowFace = faces.find((face) => face.windows.length > 0)
    const placedSink = windowFace
      ? (() => {
          const window = windowFace.windows[0]
          const width = fixtureSpec('sink').width
          const u = Math.min(windowFace.length - width / 2 - 0.2, Math.max(width / 2 + 0.2, window.u + window.width / 2))
          if (!add(at(windowFace, 'sink', u))) return false
          reserve(windowFace, u, width)
          return true
        })()
      : false
    if (!placedSink) tuck('sink')
    middle('stove-isolator')
  }

  if (type === 'bathroom' || type === 'toilet') {
    if (type === 'bathroom') {
      if (cell.netArea >= 5) tuck('bath')
      else tuck('shower')
    }
    tuck('wc')
    tuck('basin')
    if (!faces.some((face) => face.windows.length > 0)) {
      const outer = faces.find((face) => face.outsideBehind)
      if (outer) {
        const width = fixtureSpec('extractor').width
        const span = outer.spans.find((item) => item.b - item.a >= width)
        if (span) add(at(outer, 'extractor', (span.a + span.b) / 2))
      }
    }
  }

  if (type === 'laundry') tuck('washing-machine')

  for (let i = 0; i < (SOCKETS[type] ?? 0); i++) {
    if (!middle('socket')) break
  }

  const fixtures = doc.building.floors.flatMap((item) => item.fixtures ?? [])
  if ((type === 'bathroom' || type === 'kitchen') && !fixtures.some((item) => isGeyser(item.kind)) && !drafts.some((item) => isGeyser(item.kind))) {
    drafts.push({ kind: 'geyser', x: centre.x, z: centre.z, dx: 1, dz: 0, y: roofSpaceY(doc, floor, cell) })
  }
  // SANS 10142-1 keeps the board out of bathrooms and away from taps and the stove, so it goes in a dry room.
  const wetRoom = type === 'bathroom' || type === 'toilet' || type === 'kitchen' || type === 'laundry'
  if (floor.index === 0 && external.length > 0 && !wetRoom && !fixtures.some((item) => item.kind === 'db-board')) {
    middle('db-board')
  }
  return drafts
}

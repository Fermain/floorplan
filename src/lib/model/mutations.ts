import { EPS, signedPolygonArea, wallLength } from './geom'
import { applyExistingWallSplits, cornersOnSegment, findWallCrossings } from './intersect'
import { newId } from './id'
import {
  applyAligned,
  createOpening,
  defaultOpeningDimensions,
  isFloorOpening,
  maxOpeningWidth,
  openingWidthLimits,
  placeOpeningU,
} from './openings'
import { pointInPlot, segmentAllowedInPlot, wallSegmentInPlot } from './plot-check'
import { carportProblem } from './carports'
import { counterProblem } from './counters'
import { retainingProblem } from './retaining'
import { skinFor, snapToCourse, systemOf, wallSystem } from './systems'
import { cellAt, floorCells, type Cell } from '../geometry/spaces'
import { DEFAULT_STAIR_WIDTH_M, stairFitProblem, stairLayout } from '../geometry/stairs'
import { COVERINGS } from '../geometry/coverings'
import { defaultsProblem, PAVING_SURFACES, projectDefaults } from './defaults'
import { fenceProblem } from './fences'
import { supportProblem } from './supports'
import { fixtureProblem, reseat, swapsFor } from './fixtures'
import { faceKey, trimProblem } from './trims'
import { finishProblem } from './finishes'
import { pointInRing } from '../geometry/pad'
import { deriveRooms, roomKey } from './rooms'
import {
  blankStorey,
  prepareStorey,
  syncGroundUnits,
  syncOutlines,
  topStoreyIndex,
} from './stories'
import type {
  CostAssumptions,
  Carport,
  Counter,
  Document,
  RetainingWall,
  FaceFinish,
  FaceTrim,
  Fence,
  Fixture,
  FixtureKind,
  PavingArea,
  PavingSurface,
  PlanPoint,
  ServiceKind,
  SewerType,
  Support,
  Floor,
  Heightfield,
  MutationResult,
  Opening,
  OpeningKind,
  Plot,
  ProjectDefaults,
  Roof,
  RoomType,
  WallFinish,
  Space,
  Stair,
  Wall,
  WallSkin,
  WallSystemId,
} from './types'

function fail(document: Document, reason: string): MutationResult {
  return { ok: false, document, reason }
}

function ok(document: Document): MutationResult {
  return { ok: true, document: syncOutlines(document) }
}

function getFloor(document: Document, floorId: string): Floor | undefined {
  return document.building.floors.find((f) => f.id === floorId)
}

function replaceFloor(document: Document, floor: Floor): Document {
  return {
    ...document,
    building: {
      ...document.building,
      floors: document.building.floors.map((f) => (f.id === floor.id ? floor : f)),
    },
  }
}

export function addCorner(
  document: Document,
  floorId: string,
  x: number,
  z: number,
): MutationResult {
  const floor = getFloor(document, floorId)
  if (!floor) return fail(document, 'floor not found')
  const corner = { id: newId('corner'), x, z }
  return ok(replaceFloor(document, { ...floor, corners: [...floor.corners, corner] }))
}

export function addWall(
  document: Document,
  floorId: string,
  startCornerId: string,
  endCornerId: string,
  skin: WallSkin,
  systemId?: WallSystemId,
): MutationResult {
  const floor = getFloor(document, floorId)
  if (!floor) return fail(document, 'floor not found')
  const solid: Pick<Wall, 'skin' | 'systemId'> =
    skin !== 'logical' && systemId ? { skin: skinFor(wallSystem(systemId)), systemId } : { skin }
  const start = floor.corners.find((c) => c.id === startCornerId)
  const end = floor.corners.find((c) => c.id === endCornerId)
  if (!start || !end) return fail(document, 'corner not found')
  if (startCornerId === endCornerId) return fail(document, 'degenerate wall')
  const len = wallLength(floor.corners, startCornerId, endCornerId)
  if (len <= EPS) return fail(document, 'degenerate wall')
  if (!segmentAllowedInPlot(document.plot, start.x, start.z, end.x, end.z)) {
    return fail(document, 'wall outside plot')
  }

  const hits = findWallCrossings(floor, start.x, start.z, end.x, end.z)
  let workingFloor = applyExistingWallSplits(floor, hits)

  const refreshedStart = workingFloor.corners.find((c) => c.id === startCornerId)!
  const refreshedEnd = workingFloor.corners.find((c) => c.id === endCornerId)!

  const chain: { id: string; x: number; z: number }[] = [{ ...refreshedStart }]
  const splitPoints = [
    ...hits.map((h) => ({ t: h.tOnNew, x: h.x, z: h.z })),
    ...cornersOnSegment(workingFloor.corners, start.x, start.z, end.x, end.z).map(({ corner, t }) => ({
      t,
      x: corner.x,
      z: corner.z,
    })),
  ]
  splitPoints.sort((a, b) => a.t - b.t)
  for (const p of splitPoints) {
    const existing = workingFloor.corners.find(
      (c) => Math.hypot(c.x - p.x, c.z - p.z) <= EPS,
    )
    if (existing) {
      chain.push(existing)
    } else {
      const c = { id: newId('corner'), x: p.x, z: p.z }
      workingFloor = { ...workingFloor, corners: [...workingFloor.corners, c] }
      chain.push(c)
    }
  }
  chain.push({ ...refreshedEnd })

  const newWalls = [...workingFloor.walls]
  for (let i = 0; i < chain.length - 1; i++) {
    const a = chain[i]
    const b = chain[i + 1]
    if (a.id === b.id || Math.hypot(a.x - b.x, a.z - b.z) <= EPS) continue
    const joined = newWalls.some(
      (w) =>
        (w.startCornerId === a.id && w.endCornerId === b.id) ||
        (w.startCornerId === b.id && w.endCornerId === a.id),
    )
    if (joined) continue
    newWalls.push({
      id: newId('wall'),
      startCornerId: a.id,
      endCornerId: b.id,
      ...solid,
      openings: [],
    })
  }

  let next = replaceFloor(document, { ...workingFloor, walls: newWalls })
  if (floor.index === 0) next = syncGroundUnits(next)
  return ok(next)
}

export function addWallRing(
  document: Document,
  floorId: string,
  points: { x: number; z: number; cornerId?: string }[],
  skin: WallSkin,
  systemId?: WallSystemId,
): MutationResult {
  if (points.length < 3) return fail(document, 'degenerate wall')
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    if (Math.hypot(a.x - b.x, a.z - b.z) <= EPS) return fail(document, 'degenerate wall')
    if (!segmentAllowedInPlot(document.plot, a.x, a.z, b.x, b.z)) return fail(document, 'wall outside plot')
  }
  let doc = document
  const ids: string[] = []
  for (const point of points) {
    const floor = getFloor(doc, floorId)
    if (!floor) return fail(document, 'floor not found')
    const named = point.cornerId ? floor.corners.find((corner) => corner.id === point.cornerId) : undefined
    const near =
      named ?? floor.corners.find((corner) => Math.hypot(corner.x - point.x, corner.z - point.z) <= EPS)
    if (near) {
      ids.push(near.id)
      continue
    }
    const added = addCorner(doc, floorId, point.x, point.z)
    if (!added.ok) return fail(document, added.reason ?? 'corner not found')
    doc = added.document
    const created = getFloor(doc, floorId)?.corners.at(-1)
    if (!created) return fail(document, 'corner not found')
    ids.push(created.id)
  }
  for (let i = 0; i < ids.length; i++) {
    const wall = addWall(doc, floorId, ids[i], ids[(i + 1) % ids.length], skin, systemId)
    if (!wall.ok) return fail(document, wall.reason ?? 'degenerate wall')
    doc = wall.document
  }
  return ok(doc)
}

export function setWallSystem(
  document: Document,
  floorId: string,
  wallId: string,
  systemId: WallSystemId,
): MutationResult {
  const floor = getFloor(document, floorId)
  if (!floor) return fail(document, 'floor not found')
  const wall = floor.walls.find((w) => w.id === wallId)
  if (!wall) return fail(document, 'wall not found')
  if (wall.skin === 'logical') return fail(document, 'logical walls have no blocks')
  const system = wallSystem(systemId)
  const openings = wall.openings.map((opening) => {
    if (opening.aligned) return applyAligned(opening, system, document.building.defaults)
    const v = snapToCourse(system, opening.v)
    const head = snapToCourse(system, opening.v + opening.height, 'ceil')
    return { ...opening, v, height: Math.max(system.courseHeight, head - v) }
  })
  const walls = floor.walls.map((w) =>
    w.id === wallId ? { ...w, skin: skinFor(system), systemId, openings } : w,
  )
  return ok(replaceFloor(document, { ...floor, walls }))
}

export function setDefaultWallSystem(document: Document, systemId: WallSystemId): MutationResult {
  return ok({ ...document, building: { ...document.building, wallSystemId: systemId } })
}

export function setProjectDefaults(document: Document, patch: Partial<ProjectDefaults>): MutationResult {
  const next = { ...(document.building.defaults ?? {}), ...patch }
  if (patch.roofCovering !== undefined && !COVERINGS.some((item) => item.id === patch.roofCovering)) {
    return fail(document, 'unknown roof covering')
  }
  if (patch.roofForm !== undefined && !['hip', 'gable', 'mono'].includes(patch.roofForm)) {
    return fail(document, 'unknown roof form')
  }
  const problem = defaultsProblem({ ...projectDefaults(document), ...next })
  if (problem) return fail(document, problem)
  return ok({ ...document, building: { ...document.building, defaults: next } })
}

function withoutCell(floor: Floor, cell: Cell, cells: Cell[]): Space[] {
  return (floor.spaces ?? [])
    .map((space) => ({ ...space, seeds: space.seeds.filter((seed) => cellAt(cells, seed.x, seed.z) !== cell) }))
    .filter((space) => space.seeds.length > 0)
}

type LocatedCell = { floor: Floor; cells: Cell[]; cell: Cell } | { error: string }

function locateCell(document: Document, floorId: string, x: number, z: number): LocatedCell {
  const floor = getFloor(document, floorId)
  if (!floor) return { error: 'floor not found' }
  const cells = floorCells(floor)
  const cell = cellAt(cells, x, z)
  if (!cell) return { error: 'no room there' }
  return { floor, cells, cell }
}

export function nameCell(
  document: Document,
  floorId: string,
  x: number,
  z: number,
  name: string,
  type: RoomType,
): MutationResult {
  const found = locateCell(document, floorId, x, z)
  if ('error' in found) return fail(document, found.error)
  const label = name.trim()
  if (!label) return fail(document, 'a room needs a name')
  const space: Space = { id: newId('space'), name: label, type, finish: 'screed', seeds: [{ x, z }] }
  const spaces = [...withoutCell(found.floor, found.cell, found.cells), space]
  return ok(replaceFloor(document, { ...found.floor, spaces }))
}

export function joinCell(document: Document, floorId: string, spaceId: string, x: number, z: number): MutationResult {
  const found = locateCell(document, floorId, x, z)
  if ('error' in found) return fail(document, found.error)
  if (!(found.floor.spaces ?? []).some((space) => space.id === spaceId)) return fail(document, 'room not found')
  const spaces = withoutCell(found.floor, found.cell, found.cells)
  const target = spaces.find((space) => space.id === spaceId)
  const joined = target
    ? spaces.map((space) => (space.id === spaceId ? { ...space, seeds: [...space.seeds, { x, z }] } : space))
    : [...spaces, { ...found.floor.spaces!.find((space) => space.id === spaceId)!, seeds: [{ x, z }] }]
  return ok(replaceFloor(document, { ...found.floor, spaces: joined }))
}

export function leaveCell(document: Document, floorId: string, x: number, z: number): MutationResult {
  const found = locateCell(document, floorId, x, z)
  if ('error' in found) return fail(document, found.error)
  return ok(replaceFloor(document, { ...found.floor, spaces: withoutCell(found.floor, found.cell, found.cells) }))
}

export function updateSpace(
  document: Document,
  floorId: string,
  spaceId: string,
  patch: Partial<Pick<Space, 'name' | 'type' | 'finish'>>,
): MutationResult {
  const floor = getFloor(document, floorId)
  if (!floor) return fail(document, 'floor not found')
  if (!(floor.spaces ?? []).some((space) => space.id === spaceId)) return fail(document, 'room not found')
  if (patch.name !== undefined && !patch.name.trim()) return fail(document, 'a room needs a name')
  const next = patch.name === undefined ? patch : { ...patch, name: patch.name.trim() }
  const spaces = (floor.spaces ?? []).map((space) => (space.id === spaceId ? { ...space, ...next } : space))
  return ok(replaceFloor(document, { ...floor, spaces }))
}

export function addStair(
  document: Document,
  floorId: string,
  x: number,
  z: number,
  dx: number,
  dz: number,
  width = DEFAULT_STAIR_WIDTH_M,
): MutationResult {
  const floor = getFloor(document, floorId)
  if (!floor) return fail(document, 'floor not found')
  const length = Math.hypot(dx, dz)
  if (length < EPS) return fail(document, 'stair needs a direction')
  const stair: Stair = { id: newId('stair'), x, z, dx: dx / length, dz: dz / length, width }
  const problem = stairFitProblem(document, floor, stair)
  if (problem) return fail(document, problem)
  return ok(replaceFloor(document, { ...floor, stairs: [...(floor.stairs ?? []), stair] }))
}

export function updateStair(
  document: Document,
  floorId: string,
  stairId: string,
  patch: Partial<Pick<Stair, 'width' | 'x' | 'z' | 'dx' | 'dz'>>,
): MutationResult {
  const floor = getFloor(document, floorId)
  if (!floor) return fail(document, 'floor not found')
  const existing = floor.stairs?.find((stair) => stair.id === stairId)
  if (!existing) return fail(document, 'stair not found')
  const stair = { ...existing, ...patch }
  const problem = stairFitProblem(document, floor, stair)
  if (problem) return fail(document, problem)
  const stairs = (floor.stairs ?? []).map((item) => (item.id === stairId ? stair : item))
  return ok(replaceFloor(document, { ...floor, stairs }))
}

export function removeStair(document: Document, floorId: string, stairId: string): MutationResult {
  const floor = getFloor(document, floorId)
  if (!floor) return fail(document, 'floor not found')
  if (!floor.stairs?.some((stair) => stair.id === stairId)) return fail(document, 'stair not found')
  return ok(replaceFloor(document, { ...floor, stairs: floor.stairs.filter((stair) => stair.id !== stairId) }))
}

export function setFence(
  document: Document,
  floorId: string,
  wallId: string,
  fence: Fence | null,
): MutationResult {
  const floor = getFloor(document, floorId)
  if (!floor) return fail(document, 'floor not found')
  const wall = floor.walls.find((item) => item.id === wallId)
  if (!wall) return fail(document, 'wall not found')
  if (wall.skin !== 'logical') return fail(document, 'only a logical wall can carry a fence')
  if (fence) {
    const problem = fenceProblem(fence)
    if (problem) return fail(document, problem)
  }
  const walls = floor.walls.map((item) => {
    if (item.id !== wallId) return item
    if (fence) return { ...item, fence: { ...fence } }
    const { fence: _removed, ...rest } = item
    return rest
  })
  return ok(replaceFloor(document, { ...floor, walls }))
}

export function setSupport(
  document: Document,
  floorId: string,
  wallId: string,
  support: Support | null,
): MutationResult {
  const floor = getFloor(document, floorId)
  if (!floor) return fail(document, 'floor not found')
  const wall = floor.walls.find((item) => item.id === wallId)
  if (!wall) return fail(document, 'wall not found')
  if (wall.skin !== 'logical') return fail(document, 'only a logical wall can carry supports')
  if (support) {
    const problem = supportProblem(support)
    if (problem) return fail(document, problem)
  }
  const walls = floor.walls.map((item) => {
    if (item.id !== wallId) return item
    if (support) return { ...item, support: { ...support } }
    const { support: _removed, ...rest } = item
    return rest
  })
  return ok(replaceFloor(document, { ...floor, walls }))
}

export function addFixture(document: Document, floorId: string, fixture: Omit<Fixture, 'id'>): MutationResult {
  const floor = getFloor(document, floorId)
  if (!floor) return fail(document, 'floor not found')
  const problem = fixtureProblem(fixture)
  if (problem) return fail(document, problem)
  const placed: Fixture = { ...fixture, id: newId('fixture') }
  return ok(replaceFloor(document, { ...floor, fixtures: [...(floor.fixtures ?? []), placed] }))
}

export function addFixtures(document: Document, floorId: string, drafts: Omit<Fixture, 'id'>[]): MutationResult {
  const floor = getFloor(document, floorId)
  if (!floor) return fail(document, 'floor not found')
  for (const draft of drafts) {
    const problem = fixtureProblem(draft)
    if (problem) return fail(document, problem)
  }
  if (drafts.length === 0) return fail(document, 'nothing to add')
  const placed = drafts.map((draft) => ({ ...draft, id: newId('fixture') }))
  return ok(replaceFloor(document, { ...floor, fixtures: [...(floor.fixtures ?? []), ...placed] }))
}

export function updateFixture(
  document: Document,
  floorId: string,
  fixtureId: string,
  patch: Partial<Omit<Fixture, 'id' | 'kind'>>,
): MutationResult {
  const floor = getFloor(document, floorId)
  if (!floor) return fail(document, 'floor not found')
  const current = floor.fixtures?.find((item) => item.id === fixtureId)
  if (!current) return fail(document, 'fixture not found')
  const next = { ...current, ...patch }
  const problem = fixtureProblem(next)
  if (problem) return fail(document, problem)
  const fixtures = (floor.fixtures ?? []).map((item) => (item.id === fixtureId ? next : item))
  return ok(replaceFloor(document, { ...floor, fixtures }))
}

// Change a fitting's own setup (gas bottles' count, size and cage, a tank's size), keeping its back where it was.
export function setFixtureSetup(
  document: Document,
  floorId: string,
  fixtureId: string,
  patch: Partial<Pick<Fixture, 'bottles' | 'bottleKg' | 'cage' | 'litres'>>,
): MutationResult {
  const floor = getFloor(document, floorId)
  if (!floor) return fail(document, 'floor not found')
  const current = floor.fixtures?.find((item) => item.id === fixtureId)
  if (!current) return fail(document, 'fixture not found')
  if (current.kind !== 'gas-cylinder' && (patch.bottles !== undefined || patch.bottleKg !== undefined || patch.cage !== undefined)) {
    return fail(document, 'only gas bottles have bottles')
  }
  if (current.kind !== 'water-tank' && patch.litres !== undefined) return fail(document, 'only tanks have a size in litres')
  // Check the new setup before sizing it: an unknown size has no dimensions to re-seat by.
  const problem = fixtureProblem({ ...current, ...patch })
  if (problem) return fail(document, problem)
  const next = reseat(current, patch)
  const fixtures = (floor.fixtures ?? []).map((item) => (item.id === fixtureId ? next : item))
  return ok(replaceFloor(document, { ...floor, fixtures }))
}

// Swap a fitting for another that stands in the same spot, keeping where it is.
export function setFixtureKind(document: Document, floorId: string, fixtureId: string, kind: FixtureKind): MutationResult {
  const floor = getFloor(document, floorId)
  if (!floor) return fail(document, 'floor not found')
  const current = floor.fixtures?.find((item) => item.id === fixtureId)
  if (!current) return fail(document, 'fixture not found')
  if (current.kind === kind) return ok(document)
  if (!swapsFor(current.kind).includes(kind)) return fail(document, 'those fittings cannot be swapped')
  const fixtures = (floor.fixtures ?? []).map((item) => (item.id === fixtureId ? { ...item, kind } : item))
  return ok(replaceFloor(document, { ...floor, fixtures }))
}

export function removeFixture(document: Document, floorId: string, fixtureId: string): MutationResult {
  const floor = getFloor(document, floorId)
  if (!floor) return fail(document, 'floor not found')
  if (!floor.fixtures?.some((item) => item.id === fixtureId)) return fail(document, 'fixture not found')
  return ok(replaceFloor(document, { ...floor, fixtures: floor.fixtures.filter((item) => item.id !== fixtureId) }))
}

// Stairs, fixtures and counters inside the rooms that move go with them.
function carryContents(floor: Floor, moving: Set<string>, move: (x: number, z: number) => { x: number; z: number }, turn: (dx: number, dz: number) => { x: number; z: number }): Pick<Floor, 'stairs' | 'fixtures' | 'counters'> {
  const rings = deriveRooms(floor)
    .filter((room) => room.cornerIds.every((id) => moving.has(id)))
    .map((room) => room.cornerIds.map((id) => floor.corners.find((corner) => corner.id === id)!))
  const inside = (x: number, z: number) => rings.some((ring) => pointInRing(ring, x, z))
  const stairs = floor.stairs?.map((stair) => {
    const length = stairLayout(stair, floor.index).length
    if (!inside(stair.x + (stair.dx * length) / 2, stair.z + (stair.dz * length) / 2)) return stair
    const at = move(stair.x, stair.z)
    const dir = turn(stair.dx, stair.dz)
    return { ...stair, x: at.x, z: at.z, dx: dir.x, dz: dir.z }
  })
  const fixtures = floor.fixtures?.map((fixture) => {
    if (!inside(fixture.x, fixture.z)) return fixture
    const at = move(fixture.x, fixture.z)
    const dir = turn(fixture.dx, fixture.dz)
    return { ...fixture, x: at.x, z: at.z, dx: dir.x, dz: dir.z }
  })
  // A counter is judged by its middle, a little out from its back so that one against a wall counts as in the room.
  const counters = floor.counters?.map((counter) => {
    const mx = counter.x + (counter.dx * counter.length) / 2 - (counter.dz * counter.depth) / 2
    const mz = counter.z + (counter.dz * counter.length) / 2 + (counter.dx * counter.depth) / 2
    if (!inside(mx, mz)) return counter
    const at = move(counter.x, counter.z)
    const dir = turn(counter.dx, counter.dz)
    return { ...counter, x: at.x, z: at.z, dx: dir.x, dz: dir.z }
  })
  return {
    ...(stairs ? { stairs } : {}),
    ...(fixtures ? { fixtures } : {}),
    ...(counters ? { counters } : {}),
  }
}

export function setServicePoint(document: Document, kind: ServiceKind, point: PlanPoint | null): MutationResult {
  const services = { ...(document.services ?? {}) }
  if (point === null) {
    delete services[kind]
    return ok({ ...document, services })
  }
  if (!pointInPlot(document.plot, point.x, point.z)) return fail(document, 'connection outside plot')
  return ok({ ...document, services: { ...services, [kind]: { x: point.x, z: point.z } } })
}

export function setServiceBends(document: Document, kind: ServiceKind, bends: PlanPoint[]): MutationResult {
  if (bends.some((point) => !pointInPlot(document.plot, point.x, point.z))) return fail(document, 'bend outside plot')
  const services = document.services ?? {}
  return ok({ ...document, services: { ...services, bends: { ...(services.bends ?? {}), [kind]: bends.map((p) => ({ x: p.x, z: p.z })) } } })
}

export function setSewerType(document: Document, type: SewerType): MutationResult {
  if (type !== 'municipal' && type !== 'septic') return fail(document, 'unknown sewer type')
  return ok({ ...document, services: { ...(document.services ?? {}), sewerType: type } })
}

export function setSoakaway(document: Document, point: PlanPoint): MutationResult {
  if (!pointInPlot(document.plot, point.x, point.z)) return fail(document, 'soakaway outside plot')
  return ok({ ...document, services: { ...(document.services ?? {}), soakaway: { x: point.x, z: point.z } } })
}

export function setRainfall(document: Document, millimetres: number): MutationResult {
  if (!(millimetres >= 50 && millimetres <= 3000)) return fail(document, 'rainfall out of range')
  return ok({ ...document, services: { ...(document.services ?? {}), rainfallMm: millimetres } })
}

export function setEssential(document: Document, circuitId: string, essential: boolean): MutationResult {
  const current = new Set(document.services?.essential ?? [])
  if (essential) current.add(circuitId)
  else current.delete(circuitId)
  return ok({ ...document, services: { ...(document.services ?? {}), essential: [...current].sort() } })
}

export function setBackupHours(document: Document, hours: number): MutationResult {
  if (!(hours >= 1 && hours <= 24)) return fail(document, 'backup hours out of range')
  return ok({ ...document, services: { ...(document.services ?? {}), backupHours: hours } })
}

export function setSolarPanels(document: Document, panels: number): MutationResult {
  if (!Number.isInteger(panels) || panels < 0 || panels > 200) return fail(document, 'panel count out of range')
  return ok({ ...document, services: { ...(document.services ?? {}), solarPanels: panels } })
}

export function setSewerDepth(document: Document, depth: number): MutationResult {
  if (!(depth >= 0.3 && depth <= 4)) return fail(document, 'sewer depth out of range')
  return ok({ ...document, services: { ...(document.services ?? {}), sewerDepth: depth } })
}

// Choose the trim on one face of a wall; a choice that matches the project default is dropped so it follows the default.
export function setFaceTrim(document: Document, floorId: string, wallId: string, side: 1 | -1, patch: FaceTrim): MutationResult {
  const floor = getFloor(document, floorId)
  if (!floor) return fail(document, 'floor not found')
  const wall = floor.walls.find((item) => item.id === wallId)
  if (!wall) return fail(document, 'wall not found')
  if (wall.skin === 'logical') return fail(document, 'a logical wall has no faces to trim')
  const problem = trimProblem(patch)
  if (problem) return fail(document, problem)
  const defaults = projectDefaults(document)
  const key = faceKey(side)
  const merged: FaceTrim = { ...(wall.trim?.[key] ?? {}), ...patch }
  if (merged.skirting === defaults.skirting) delete merged.skirting
  if (merged.cornice === defaults.cornice) delete merged.cornice
  const trim = { ...(wall.trim ?? {}) }
  if (merged.skirting === undefined && merged.cornice === undefined) delete trim[key]
  else trim[key] = merged
  const walls = floor.walls.map((item) => {
    if (item.id !== wallId) return item
    const { trim: _old, ...rest } = item
    return Object.keys(trim).length > 0 ? { ...rest, trim } : rest
  })
  return ok(replaceFloor(document, { ...floor, walls }))
}

// A face's own finish and paint; null hands the choice back to the project.
export function setFaceFinish(
  document: Document,
  floorId: string,
  wallId: string,
  side: 1 | -1,
  patch: { finish?: WallFinish | null; paint?: string | null },
): MutationResult {
  const floor = getFloor(document, floorId)
  if (!floor) return fail(document, 'floor not found')
  const wall = floor.walls.find((item) => item.id === wallId)
  if (!wall) return fail(document, 'wall not found')
  if (wall.skin === 'logical') return fail(document, 'a logical wall has no faces to finish')
  const problem = finishProblem(patch)
  if (problem) return fail(document, problem)
  const key = faceKey(side)
  const merged: FaceFinish = { ...(wall.finish?.[key] ?? {}) }
  if (patch.finish === null) delete merged.finish
  else if (patch.finish !== undefined) merged.finish = patch.finish
  if (patch.paint === null) delete merged.paint
  else if (patch.paint !== undefined) merged.paint = patch.paint
  const finish = { ...(wall.finish ?? {}) }
  if (merged.finish === undefined && merged.paint === undefined) delete finish[key]
  else finish[key] = merged
  const walls = floor.walls.map((item) => {
    if (item.id !== wallId) return item
    const { finish: _old, ...rest } = item
    return Object.keys(finish).length > 0 ? { ...rest, finish } : rest
  })
  return ok(replaceFloor(document, { ...floor, walls }))
}

export function setRate(document: Document, key: string, value: number | null): MutationResult {
  if (value !== null && (!Number.isFinite(value) || value < 0)) return fail(document, 'rate must be zero or more')
  const rates = { ...(document.costing?.rates ?? {}) }
  if (value === null) delete rates[key]
  else rates[key] = value
  return ok({ ...document, costing: { ...document.costing, rates } })
}

export function setAssumption(
  document: Document,
  key: keyof CostAssumptions,
  value: number,
): MutationResult {
  if (!Number.isFinite(value) || value < 0) return fail(document, 'value must be zero or more')
  const assumptions = { ...(document.costing?.assumptions ?? {}), [key]: value }
  return ok({ ...document, costing: { ...document.costing, assumptions } })
}

export function moveCorner(
  document: Document,
  floorId: string,
  cornerId: string,
  x: number,
  z: number,
): MutationResult {
  const floor = getFloor(document, floorId)
  if (!floor) return fail(document, 'floor not found')
  const corner = floor.corners.find((c) => c.id === cornerId)
  if (!corner) return fail(document, 'corner not found')

  const nextCorners = floor.corners.map((c) =>
    c.id === cornerId ? { ...c, x, z } : c,
  )
  const trialFloor = { ...floor, corners: nextCorners }
  for (const wall of floor.walls) {
    if (wall.startCornerId !== cornerId && wall.endCornerId !== cornerId) continue
    if (
      !wallSegmentInPlot(
        document.plot,
        nextCorners,
        wall.startCornerId,
        wall.endCornerId,
      )
    ) {
      return fail(document, 'wall outside plot')
    }
  }
  return ok(replaceFloor(document, trialFloor))
}

export function moveCorners(
  document: Document,
  floorId: string,
  cornerIds: string[],
  dx: number,
  dz: number,
): MutationResult {
  const floor = getFloor(document, floorId)
  if (!floor) return fail(document, 'floor not found')
  const moving = new Set(cornerIds)
  if (moving.size === 0 || [...moving].some((id) => !floor.corners.some((c) => c.id === id))) {
    return fail(document, 'corner not found')
  }
  if (Math.hypot(dx, dz) < EPS) return ok(document)
  const nextCorners = floor.corners.map((corner) =>
    moving.has(corner.id) ? { ...corner, x: corner.x + dx, z: corner.z + dz } : corner,
  )
  for (const wall of floor.walls) {
    if (!moving.has(wall.startCornerId) && !moving.has(wall.endCornerId)) continue
    if (!wallSegmentInPlot(document.plot, nextCorners, wall.startCornerId, wall.endCornerId)) {
      return fail(document, 'wall outside plot')
    }
  }
  const carried = carryContents(floor, moving, (x, z) => ({ x: x + dx, z: z + dz }), (x, z) => ({ x, z }))
  return ok(replaceFloor(document, { ...floor, corners: nextCorners, ...carried }))
}

export function rotateOffset(dx: number, dz: number, angle: number): { x: number; z: number } {
  const deg = (angle * 180) / Math.PI
  const turns = Math.round(deg / 90)
  if (Math.abs(deg - turns * 90) < 1e-4) {
    let x = dx
    let z = dz
    const steps = ((turns % 4) + 4) % 4
    for (let i = 0; i < steps; i++) {
      const nextX = -z
      z = x
      x = nextX
    }
    return { x, z }
  }
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return { x: dx * c - dz * s, z: dx * s + dz * c }
}

export function rotateCorners(
  document: Document,
  floorId: string,
  cornerIds: string[],
  pivotId: string,
  angle: number,
): MutationResult {
  const floor = getFloor(document, floorId)
  if (!floor) return fail(document, 'floor not found')
  const moving = new Set(cornerIds)
  const pivot = floor.corners.find((corner) => corner.id === pivotId)
  if (!pivot || moving.size === 0 || [...moving].some((id) => !floor.corners.some((c) => c.id === id))) {
    return fail(document, 'corner not found')
  }
  if (Math.abs(angle) < EPS) return ok(document)
  const nextCorners = floor.corners.map((corner) => {
    if (!moving.has(corner.id)) return corner
    const next = rotateOffset(corner.x - pivot.x, corner.z - pivot.z, angle)
    return { ...corner, x: pivot.x + next.x, z: pivot.z + next.z }
  })
  for (const wall of floor.walls) {
    if (!moving.has(wall.startCornerId) && !moving.has(wall.endCornerId)) continue
    if (!wallSegmentInPlot(document.plot, nextCorners, wall.startCornerId, wall.endCornerId)) {
      return fail(document, 'wall outside plot')
    }
  }
  const carried = carryContents(
    floor,
    moving,
    (x, z) => {
      const next = rotateOffset(x - pivot.x, z - pivot.z, angle)
      return { x: pivot.x + next.x, z: pivot.z + next.z }
    },
    (x, z) => rotateOffset(x, z, angle),
  )
  return ok(replaceFloor(document, { ...floor, corners: nextCorners, ...carried }))
}

function shortWallReason(kind: OpeningKind): string {
  if (kind === 'garage') return 'wall too short for a garage door'
  if (kind === 'portal') return 'wall too short for a portal'
  return 'wall too short for a door'
}

export function addOpening(
  document: Document,
  floorId: string,
  wallId: string,
  kind: OpeningKind,
  u: number,
  width?: number,
  v?: number,
): MutationResult {
  const floor = getFloor(document, floorId)
  if (!floor) return fail(document, 'floor not found')
  const wall = floor.walls.find((w) => w.id === wallId)
  if (!wall) return fail(document, 'wall not found')
  const system = systemOf(wall)
  const opening = createOpening(newId('opening'), kind, u, width, system, document.building.defaults)
  if (v !== undefined) {
    opening.v = v
    opening.aligned = false
  }
  const length = wallLength(floor.corners, wall.startCornerId, wall.endCornerId)
  if (isFloorOpening(kind)) {
    const limits = openingWidthLimits(kind, length)
    if (limits.max < limits.min - 1e-9) return fail(document, shortWallReason(kind))
    opening.width = Math.min(limits.max, Math.max(limits.min, opening.width))
  }
  const placedU = placeOpeningU(opening.u, opening.width, length, wall.openings, undefined, system.moduleLength)
  if (placedU === null) return fail(document, 'openings too close')
  opening.u = placedU
  const walls = floor.walls.map((w) =>
    w.id === wallId ? { ...w, openings: [...w.openings, opening] } : w,
  )
  return ok(replaceFloor(document, { ...floor, walls }))
}

export function updateOpening(
  document: Document,
  floorId: string,
  wallId: string,
  openingId: string,
  patch: Partial<Pick<Opening, 'u' | 'v' | 'width' | 'height' | 'kind'>>,
): MutationResult {
  const floor = getFloor(document, floorId)
  if (!floor) return fail(document, 'floor not found')
  const wall = floor.walls.find((w) => w.id === wallId)
  if (!wall) return fail(document, 'wall not found')
  const existing = wall.openings.find((o) => o.id === openingId)
  if (!existing) return fail(document, 'opening not found')

  const system = systemOf(wall)
  const gap = system.moduleLength
  let aligned = existing.aligned
  if (patch.v !== undefined || patch.height !== undefined) {
    aligned = false
  }
  if (patch.kind !== undefined && patch.kind !== existing.kind) {
    const d = defaultOpeningDimensions(patch.kind, system, document.building.defaults)
    if (aligned) {
      patch = { ...patch, v: d.v, height: d.height }
    }
  }

  let updated: Opening = {
    ...existing,
    ...patch,
    aligned,
  }
  const length = wallLength(floor.corners, wall.startCornerId, wall.endCornerId)
  const others = wall.openings.filter((opening) => opening.id !== openingId)
  if (isFloorOpening(updated.kind)) {
    const limits = openingWidthLimits(updated.kind, length)
    if (limits.max < limits.min - 1e-9) return fail(document, shortWallReason(updated.kind))
    let nextWidth = Math.min(limits.max, Math.max(limits.min, updated.width))
    let requestedU = updated.u
    if (patch.width !== undefined && patch.u === undefined) {
      const centre = existing.u + existing.width / 2
      nextWidth = Math.min(nextWidth, maxOpeningWidth(centre, length, others, undefined, gap))
      if (nextWidth < limits.min - 1e-9) return fail(document, 'openings too close')
      requestedU = centre - nextWidth / 2
    }
    const placedU = placeOpeningU(requestedU, nextWidth, length, others, undefined, gap)
    if (placedU === null) return fail(document, 'openings too close')
    updated = { ...updated, width: nextWidth, u: placedU }
  } else {
    let nextWidth = updated.width
    let requestedU = updated.u
    if (patch.width !== undefined && patch.u === undefined) {
      const centre = existing.u + existing.width / 2
      const limits = openingWidthLimits('window', length)
      nextWidth = Math.min(limits.max, Math.max(limits.min, nextWidth))
      nextWidth = Math.min(nextWidth, maxOpeningWidth(centre, length, others, undefined, gap))
      if (nextWidth < limits.min - 1e-9) return fail(document, 'openings too close')
      requestedU = centre - nextWidth / 2
    }
    const placedU = placeOpeningU(requestedU, nextWidth, length, others, undefined, gap)
    if (placedU === null) return fail(document, 'openings too close')
    updated = { ...updated, width: nextWidth, u: placedU }
  }

  const walls = floor.walls.map((w) =>
    w.id === wallId
      ? {
          ...w,
          openings: w.openings.map((o) => (o.id === openingId ? updated : o)),
        }
      : w,
  )
  return ok(replaceFloor(document, { ...floor, walls }))
}

export function setOpeningAligned(
  document: Document,
  floorId: string,
  wallId: string,
  openingId: string,
  aligned: boolean,
): MutationResult {
  const floor = getFloor(document, floorId)
  if (!floor) return fail(document, 'floor not found')
  const wall = floor.walls.find((w) => w.id === wallId)
  if (!wall) return fail(document, 'wall not found')
  const existing = wall.openings.find((o) => o.id === openingId)
  if (!existing) return fail(document, 'opening not found')

  let updated = { ...existing, aligned }
  if (aligned) {
    updated = applyAligned(updated, systemOf(wall), document.building.defaults)
  }

  const walls = floor.walls.map((w) =>
    w.id === wallId
      ? {
          ...w,
          openings: w.openings.map((o) => (o.id === openingId ? updated : o)),
        }
      : w,
  )
  return ok(replaceFloor(document, { ...floor, walls }))
}

export function addStorey(document: Document, floorId: string, cornerId?: string): MutationResult {
  const prepared = prepareStorey(document, floorId, cornerId)
  if ('reason' in prepared) return fail(document, prepared.reason)
  const nextIndex = topStoreyIndex(prepared.document, prepared.unitId) + 1
  const storey = blankStorey(prepared.outline, prepared.unitId, nextIndex)
  return ok({
    ...prepared.document,
    building: { ...prepared.document.building, floors: [...prepared.document.building.floors, storey] },
  })
}

export function removeTopStorey(document: Document, unitId: string): MutationResult {
  const uppers = document.building.floors.filter((floor) => floor.unitId === unitId && floor.index > 0)
  if (uppers.length === 0) return fail(document, 'no storey to remove')
  const top = Math.max(...uppers.map((floor) => floor.index))
  let floors = document.building.floors.filter((floor) => !(floor.unitId === unitId && floor.index === top))
  if (!floors.some((floor) => floor.unitId === unitId && floor.index > 0)) {
    floors = floors.map((floor) =>
      floor.index === 0
        ? {
            ...floor,
            corners: floor.corners.map((corner) => {
              if (corner.unitId !== unitId) return corner
              const { unitId: _unitId, ...rest } = corner
              return rest
            }),
          }
        : floor,
    )
  }
  return ok({ ...document, building: { ...document.building, floors } })
}

export function setRoof(document: Document, floorId: string, roof: Roof | null): MutationResult {
  const floor = getFloor(document, floorId)
  if (!floor) return fail(document, 'floor not found')
  if (roof === null) {
    const { roof: _removed, ...rest } = floor
    return ok(replaceFloor(document, rest))
  }
  if (floor.index === 0) return fail(document, 'ground storey cannot take a roof')
  if (floor.walls.length > 0) return fail(document, 'only a flat storey can take a roof')
  if (!(floor.outline ?? []).some((ring) => ring.length >= 3)) return fail(document, 'storey has no plate')
  if (!(roof.pitchDeg > 0 && roof.pitchDeg < 90)) return fail(document, 'pitch out of range')
  if (!(roof.eaves >= 0)) return fail(document, 'eaves out of range')
  if (roof.form !== undefined && !['hip', 'gable', 'mono'].includes(roof.form)) return fail(document, 'unknown roof form')
  if (roof.turns !== undefined && !Number.isInteger(roof.turns)) return fail(document, 'roof turns must be whole')
  if (roof.covering !== undefined && !COVERINGS.some((item) => item.id === roof.covering)) return fail(document, 'unknown roof covering')
  if (roof.gutter !== undefined && roof.gutter !== 'round-pvc' && roof.gutter !== 'square-metal') return fail(document, 'unknown gutter')
  return ok(replaceFloor(document, { ...floor, roof }))
}

// Keep or take away the gutter along the eave above one wall.
export function setWallGutter(document: Document, roofFloorId: string, wallId: string, gutter: boolean): MutationResult {
  const floor = getFloor(document, roofFloorId)
  if (!floor?.roof) return fail(document, 'roof not found')
  const without = new Set(floor.roof.noGutter ?? [])
  if (gutter) without.delete(wallId)
  else without.add(wallId)
  const { noGutter: _old, ...rest } = floor.roof
  const roof = without.size > 0 ? { ...rest, noGutter: [...without].sort() } : rest
  return ok(replaceFloor(document, { ...floor, roof }))
}

export function removeWall(document: Document, floorId: string, wallId: string): MutationResult {
  const floor = getFloor(document, floorId)
  if (!floor) return fail(document, 'floor not found')
  if (!floor.walls.some((w) => w.id === wallId)) return fail(document, 'wall not found')
  const walls = floor.walls.filter((w) => w.id !== wallId)
  const used = new Set(walls.flatMap((w) => [w.startCornerId, w.endCornerId]))
  const corners = floor.corners.filter((corner) => used.has(corner.id))
  let next = replaceFloor(document, { ...floor, walls, corners })
  if (floor.index === 0) next = syncGroundUnits(next)
  return ok(next)
}

export function removeOpening(
  document: Document,
  floorId: string,
  wallId: string,
  openingId: string,
): MutationResult {
  const floor = getFloor(document, floorId)
  if (!floor) return fail(document, 'floor not found')
  const wall = floor.walls.find((w) => w.id === wallId)
  if (!wall) return fail(document, 'wall not found')
  if (!wall.openings.some((o) => o.id === openingId)) return fail(document, 'opening not found')
  const walls = floor.walls.map((w) =>
    w.id === wallId ? { ...w, openings: w.openings.filter((o) => o.id !== openingId) } : w,
  )
  return ok(replaceFloor(document, { ...floor, walls }))
}

export function replacePlot(document: Document, plot: Plot): MutationResult {
  for (const floor of document.building.floors) {
    for (const wall of floor.walls) {
      if (!wallSegmentInPlot(plot, floor.corners, wall.startCornerId, wall.endCornerId)) {
        return fail(document, 'existing walls leave the new plot')
      }
    }
  }
  // Road sides are kept only where the new boundary still has that edge.
  const roads = (plot.roads ?? []).filter((edge) => Number.isInteger(edge) && edge >= 0 && edge < plot.ring.length)
  const { roads: _roads, ...rest } = plot
  return ok({ ...document, plot: roads.length > 0 ? { ...rest, roads: [...new Set(roads)].sort((a, b) => a - b) } : rest })
}

// Mark one side of the plot as on a road, or not.
export function setPlotRoad(document: Document, edge: number, road: boolean): MutationResult {
  const { ring } = document.plot
  if (!Number.isInteger(edge) || edge < 0 || edge >= ring.length) return fail(document, 'no such side of the plot')
  const others = (document.plot.roads ?? []).filter((item) => item !== edge)
  const roads = road ? [...others, edge].sort((a, b) => a - b) : others
  const { roads: _roads, ...rest } = document.plot
  return ok({ ...document, plot: roads.length > 0 ? { ...rest, roads } : rest })
}

// A paving area must be a real shape on the plot, of a surface that exists.
function pavingProblem(document: Document, ring: [number, number][], surface: PavingSurface): string | null {
  if (!(PAVING_SURFACES as readonly string[]).includes(surface)) return 'unknown paving surface'
  if (ring.length < 3 || ring.some(([x, z]) => !Number.isFinite(x) || !Number.isFinite(z))) return 'paving needs at least three corners'
  if (Math.abs(signedPolygonArea(ring.map(([x, z]) => ({ x, z })))) < 0.1) return 'paving is too small'
  if (ring.some(([x, z]) => !pointInPlot(document.plot, x, z))) return 'paving outside the plot'
  return null
}

export function addPaving(document: Document, ring: [number, number][], surface: PavingSurface): MutationResult {
  const problem = pavingProblem(document, ring, surface)
  if (problem) return fail(document, problem)
  const area: PavingArea = { id: newId('paving'), ring: ring.map(([x, z]) => [x, z]), surface }
  return ok({ ...document, paving: [...(document.paving ?? []), area] })
}

export function updatePaving(document: Document, id: string, patch: Partial<Pick<PavingArea, 'ring' | 'surface'>>): MutationResult {
  const current = document.paving?.find((item) => item.id === id)
  if (!current) return fail(document, 'paving not found')
  const next = { ...current, ...patch }
  const problem = pavingProblem(document, next.ring, next.surface)
  if (problem) return fail(document, problem)
  return ok({ ...document, paving: (document.paving ?? []).map((item) => (item.id === id ? next : item)) })
}

export function removePaving(document: Document, id: string): MutationResult {
  if (!document.paving?.some((item) => item.id === id)) return fail(document, 'paving not found')
  const paving = document.paving.filter((item) => item.id !== id)
  if (paving.length > 0) return ok({ ...document, paving })
  const { paving: _gone, ...rest } = document
  return ok(rest)
}

export function addCounter(document: Document, floorId: string, counter: Omit<Counter, 'id'>): MutationResult {
  const floor = getFloor(document, floorId)
  if (!floor) return fail(document, 'floor not found')
  const problem = counterProblem(counter)
  if (problem) return fail(document, problem)
  return ok(replaceFloor(document, { ...floor, counters: [...(floor.counters ?? []), { ...counter, id: newId('counter') }] }))
}

export function updateCounter(document: Document, floorId: string, id: string, patch: Partial<Omit<Counter, 'id'>>): MutationResult {
  const floor = getFloor(document, floorId)
  const current = floor?.counters?.find((item) => item.id === id)
  if (!floor || !current) return fail(document, 'counter not found')
  const next = { ...current, ...patch }
  if (next.kind !== 'base') delete next.wallUnits
  const problem = counterProblem(next)
  if (problem) return fail(document, problem)
  return ok(replaceFloor(document, { ...floor, counters: (floor.counters ?? []).map((item) => (item.id === id ? next : item)) }))
}

export function removeCounter(document: Document, floorId: string, id: string): MutationResult {
  const floor = getFloor(document, floorId)
  if (!floor?.counters?.some((item) => item.id === id)) return fail(document, 'counter not found')
  const counters = floor.counters.filter((item) => item.id !== id)
  if (counters.length > 0) return ok(replaceFloor(document, { ...floor, counters }))
  const { counters: _gone, ...rest } = floor
  return ok(replaceFloor(document, rest))
}

// Mark the house as it is drawn now as the house as built. From here on the project is an alteration to it.
export function markAsBuilt(document: Document, at: number): MutationResult {
  if (!document.building.floors.some((floor) => floor.walls.some((wall) => wall.skin !== 'logical'))) return fail(document, 'draw the house as it stands first')
  const { baseline: _old, ...now } = document
  return ok({ ...now, baseline: { at, document: structuredClone(now) } })
}

// Forget the house as built: the project is a new house again, priced whole.
export function clearBaseline(document: Document): MutationResult {
  if (!document.baseline) return fail(document, 'nothing is marked as built')
  const { baseline: _gone, ...rest } = document
  return ok(rest)
}

// Put the drawing back to the house as built, keeping it marked.
export function revertToBuilt(document: Document): MutationResult {
  const baseline = document.baseline
  if (!baseline) return fail(document, 'nothing is marked as built')
  return ok({ ...structuredClone(baseline.document), baseline })
}

export function addRetainingWall(document: Document, wall: Omit<RetainingWall, 'id'>): MutationResult {
  const problem = retainingProblem(document, wall)
  if (problem) return fail(document, problem)
  const added: RetainingWall = { id: newId('retaining'), type: wall.type, points: wall.points.map(([x, z]) => [x, z]) }
  return ok({ ...document, retaining: [...(document.retaining ?? []), added] })
}

export function updateRetainingWall(document: Document, id: string, patch: Partial<Omit<RetainingWall, 'id'>>): MutationResult {
  const current = document.retaining?.find((item) => item.id === id)
  if (!current) return fail(document, 'retaining wall not found')
  const next = { ...current, ...patch }
  const problem = retainingProblem(document, next)
  if (problem) return fail(document, problem)
  return ok({ ...document, retaining: (document.retaining ?? []).map((item) => (item.id === id ? next : item)) })
}

export function removeRetainingWall(document: Document, id: string): MutationResult {
  if (!document.retaining?.some((item) => item.id === id)) return fail(document, 'retaining wall not found')
  const retaining = document.retaining.filter((item) => item.id !== id)
  if (retaining.length > 0) return ok({ ...document, retaining })
  const { retaining: _gone, ...rest } = document
  return ok(rest)
}

export function addCarport(document: Document, carport: Omit<Carport, 'id'>): MutationResult {
  const problem = carportProblem(document, carport)
  if (problem) return fail(document, problem)
  return ok({ ...document, carports: [...(document.carports ?? []), { ...carport, id: newId('carport') }] })
}

export function updateCarport(document: Document, id: string, patch: Partial<Omit<Carport, 'id'>>): MutationResult {
  const current = document.carports?.find((item) => item.id === id)
  if (!current) return fail(document, 'carport not found')
  const next = { ...current, ...patch }
  const problem = carportProblem(document, next)
  if (problem) return fail(document, problem)
  return ok({ ...document, carports: (document.carports ?? []).map((item) => (item.id === id ? next : item)) })
}

export function removeCarport(document: Document, id: string): MutationResult {
  if (!document.carports?.some((item) => item.id === id)) return fail(document, 'carport not found')
  const carports = document.carports.filter((item) => item.id !== id)
  if (carports.length > 0) return ok({ ...document, carports })
  const { carports: _gone, ...rest } = document
  return ok(rest)
}

export function replaceHeightfield(document: Document, heightfield: Heightfield): MutationResult {
  return ok({ ...document, heightfield })
}

export function setRoomFinish(
  document: Document,
  floorId: string,
  cornerIds: string[],
  finishId: string,
): MutationResult {
  const floor = getFloor(document, floorId)
  if (!floor) return fail(document, 'floor not found')
  const key = roomKey(cornerIds)
  return ok(
    replaceFloor(document, {
      ...floor,
      roomFinishes: { ...floor.roomFinishes, [key]: finishId },
    }),
  )
}

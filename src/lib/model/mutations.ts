import { FLOOR_TO_FLOOR } from '../plot/fixture'
import { EPS, wallLength } from './geom'
import { applyExistingWallSplits, findWallCrossings } from './intersect'
import { newId } from './id'
import { applyAligned, createOpening, defaultOpeningDimensions } from './openings'
import { segmentAllowedInPlot, wallSegmentInPlot } from './plot-check'
import { roomKey } from './rooms'
import type {
  Document,
  Floor,
  MutationResult,
  Opening,
  OpeningKind,
  WallSkin,
} from './types'

function fail(document: Document, reason: string): MutationResult {
  return { ok: false, document, reason }
}

function ok(document: Document): MutationResult {
  return { ok: true, document }
}

function getFloor(document: Document, floorId: string): Floor | undefined {
  return document.building.floors.find((f) => f.id === floorId)
}

function replaceFloor(document: Document, floor: Floor): Document {
  return {
    ...document,
    building: {
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
): MutationResult {
  const floor = getFloor(document, floorId)
  if (!floor) return fail(document, 'floor not found')
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
  const splitPoints = hits.map((h) => ({
    t: h.tOnNew,
    x: h.x,
    z: h.z,
  }))
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
    if (Math.hypot(a.x - b.x, a.z - b.z) <= EPS) continue
    newWalls.push({
      id: newId('wall'),
      startCornerId: a.id,
      endCornerId: b.id,
      skin,
      openings: [],
    })
  }

  return ok(replaceFloor(document, { ...workingFloor, walls: newWalls }))
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
  const opening = createOpening(newId('opening'), kind, u, width)
  if (v !== undefined) {
    opening.v = v
    opening.aligned = false
  }
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

  let aligned = existing.aligned
  if (patch.v !== undefined || patch.height !== undefined) {
    aligned = false
  }
  if (patch.kind !== undefined && patch.kind !== existing.kind) {
    const d = defaultOpeningDimensions(patch.kind)
    if (aligned) {
      patch = { ...patch, v: d.v, height: d.height }
    }
  }

  const updated: Opening = {
    ...existing,
    ...patch,
    aligned,
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
    updated = applyAligned(updated)
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

export function addFloor(document: Document): MutationResult {
  const index = document.building.floors.length
  const floor: Floor = {
    id: newId('floor'),
    index,
    datumHeight: index * FLOOR_TO_FLOOR,
    corners: [],
    walls: [],
    roomFinishes: {},
  }
  return ok({
    ...document,
    building: { floors: [...document.building.floors, floor] },
  })
}

export function removeFloor(document: Document, floorId: string): MutationResult {
  if (document.building.floors.length <= 1) {
    return fail(document, 'cannot remove last floor')
  }
  const floors = document.building.floors
    .filter((f) => f.id !== floorId)
    .map((f, index) => ({ ...f, index, datumHeight: index * FLOOR_TO_FLOOR }))
  return ok({ ...document, building: { floors } })
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

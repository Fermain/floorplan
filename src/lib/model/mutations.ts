import { EPS, wallLength } from './geom'
import { applyExistingWallSplits, findWallCrossings } from './intersect'
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
import { segmentAllowedInPlot, wallSegmentInPlot } from './plot-check'
import { roomKey } from './rooms'
import {
  blankStorey,
  prepareStorey,
  syncGroundUnits,
  topStoreyIndex,
} from './stories'
import type {
  Document,
  Floor,
  Heightfield,
  MutationResult,
  Opening,
  OpeningKind,
  Plot,
  Roof,
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

  let next = replaceFloor(document, { ...workingFloor, walls: newWalls })
  if (floor.index === 0) next = syncGroundUnits(next)
  return ok(next)
}

export function addWallRing(
  document: Document,
  floorId: string,
  points: { x: number; z: number; cornerId?: string }[],
  skin: WallSkin,
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
    const wall = addWall(doc, floorId, ids[i], ids[(i + 1) % ids.length], skin)
    if (!wall.ok) return fail(document, wall.reason ?? 'degenerate wall')
    doc = wall.document
  }
  return ok(doc)
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
  return ok(replaceFloor(document, { ...floor, corners: nextCorners }))
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
  return ok(replaceFloor(document, { ...floor, corners: nextCorners }))
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
  const opening = createOpening(newId('opening'), kind, u, width)
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
  const placedU = placeOpeningU(opening.u, opening.width, length, wall.openings)
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
      nextWidth = Math.min(nextWidth, maxOpeningWidth(centre, length, others))
      if (nextWidth < limits.min - 1e-9) return fail(document, 'openings too close')
      requestedU = centre - nextWidth / 2
    }
    const placedU = placeOpeningU(requestedU, nextWidth, length, others)
    if (placedU === null) return fail(document, 'openings too close')
    updated = { ...updated, width: nextWidth, u: placedU }
  } else {
    let nextWidth = updated.width
    let requestedU = updated.u
    if (patch.width !== undefined && patch.u === undefined) {
      const centre = existing.u + existing.width / 2
      const limits = openingWidthLimits('window', length)
      nextWidth = Math.min(limits.max, Math.max(limits.min, nextWidth))
      nextWidth = Math.min(nextWidth, maxOpeningWidth(centre, length, others))
      if (nextWidth < limits.min - 1e-9) return fail(document, 'openings too close')
      requestedU = centre - nextWidth / 2
    }
    const placedU = placeOpeningU(requestedU, nextWidth, length, others)
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
  return ok(replaceFloor(document, { ...floor, roof }))
}

export function removeWall(document: Document, floorId: string, wallId: string): MutationResult {
  const floor = getFloor(document, floorId)
  if (!floor) return fail(document, 'floor not found')
  if (!floor.walls.some((w) => w.id === wallId)) return fail(document, 'wall not found')
  let next = replaceFloor(document, { ...floor, walls: floor.walls.filter((w) => w.id !== wallId) })
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
  return ok({ ...document, plot })
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

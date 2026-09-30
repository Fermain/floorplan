import type { Document, Floor, OpeningKind, Wall } from '../model/types'
import { systemOf, type WallSystem } from '../model/systems'
import {
  collectLintelSpans,
  collectWallBlockSpans,
  leafSigns,
  wallMeshURange,
  type BlockSpan,
  type BottomSample,
} from './walls'

const TOL = 0.001

export type WallSchedule = {
  wholeBricks: number
  cutBricks: number
  openings: {
    window: number,
    door: number,
    external: number,
    internal: number,
    garage: number,
    portal: number,
  }
  lintels: { length: number }[]
}

export type BuildingSchedule = WallSchedule

function isWholeSpan(span: BlockSpan, system: WallSystem): boolean {
  const length = span.u1 - span.u0
  const height = span.y1 - span.y0
  return Math.abs(length - system.moduleLength) <= TOL && Math.abs(height - system.courseHeight) <= TOL
}

function courseShift(course: number, system: WallSystem): number {
  return course % 2 === 1 ? system.moduleLength / 2 : 0
}

function moduleIndex(span: BlockSpan, system: WallSystem): number {
  return Math.floor((span.u0 - courseShift(span.course, system)) / system.moduleLength)
}

function moduleNaturalLength(
  course: number,
  module: number,
  uMin: number,
  uMax: number,
  system: WallSystem,
): number {
  const shift = courseShift(course, system)
  const b0 = shift + module * system.moduleLength
  const b1 = b0 + system.moduleLength
  const s0 = Math.max(uMin, b0)
  const s1 = Math.min(uMax, b1)
  return Math.max(0, s1 - s0)
}

function emptySchedule(): WallSchedule {
  return {
    wholeBricks: 0,
    cutBricks: 0,
    openings: { window: 0, door: 0, external: 0, internal: 0, garage: 0, portal: 0 },
    lintels: [],
  }
}

type CutGroup = {
  course: number
  leaf: number
  module: number
  length: number
  fullHeight: boolean
}

function countBricks(
  spans: BlockSpan[],
  rangeAt: (leaf: number, course: number) => { uMin: number, uMax: number },
  system: WallSystem,
): { wholeBricks: number, cutBricks: number } {
  let wholeBricks = 0
  const groups = new Map<string, CutGroup>()

  for (const span of spans) {
    if (isWholeSpan(span, system)) {
      wholeBricks++
      continue
    }
    const module = moduleIndex(span, system)
    const key = `${span.course}:${span.leaf}:${module}`
    const height = span.y1 - span.y0
    const existing = groups.get(key)
    if (existing) {
      existing.length += span.u1 - span.u0
      existing.fullHeight =
        existing.fullHeight && Math.abs(height - system.courseHeight) <= TOL
    } else {
      groups.set(key, {
        course: span.course,
        leaf: span.leaf,
        module,
        length: span.u1 - span.u0,
        fullHeight: Math.abs(height - system.courseHeight) <= TOL,
      })
    }
  }

  const naturalByCourseLeaf = new Map<string, number[]>()
  let cutBricks = 0

  for (const group of groups.values()) {
    const range = rangeAt(group.leaf, group.course)
    const natural = moduleNaturalLength(
      group.course,
      group.module,
      range.uMin,
      range.uMax,
      system,
    )
    const isNatural =
      group.fullHeight && Math.abs(group.length - natural) <= TOL
    if (isNatural) {
      const gk = `${group.course}:${group.leaf}`
      const list = naturalByCourseLeaf.get(gk) ?? []
      list.push(group.length)
      naturalByCourseLeaf.set(gk, list)
    } else {
      cutBricks++
    }
  }

  for (const lengths of naturalByCourseLeaf.values()) {
    const remaining = [...lengths]
    while (remaining.length > 0) {
      const a = remaining.pop()!
      const pairAt = remaining.findIndex((b) => Math.abs(a + b - system.moduleLength) <= TOL)
      if (pairAt >= 0) {
        remaining.splice(pairAt, 1)
        wholeBricks++
      } else {
        cutBricks++
      }
    }
  }

  return { wholeBricks, cutBricks }
}

export function scheduleWall(
  floor: Floor,
  wall: Wall,
  bottomSamples?: BottomSample[],
): WallSchedule {
  if (wall.skin === 'logical') {
    return emptySchedule()
  }

  const signs = leafSigns(wall.skin)
  const spans = collectWallBlockSpans(floor, wall, bottomSamples)
  const { wholeBricks, cutBricks } = countBricks(
    spans,
    (leaf, course) => wallMeshURange(floor, wall, signs[leaf], course),
    systemOf(wall),
  )

  const openings = { window: 0, door: 0, external: 0, internal: 0, garage: 0, portal: 0 }
  for (const opening of wall.openings) tallyOpening(openings, opening.kind)

  const lintels = collectLintelSpans(floor, wall).map((span) => ({
    length: span.u1 - span.u0,
  }))

  return { wholeBricks, cutBricks, openings, lintels }
}

export function scheduleBuilding(document: Document): BuildingSchedule {
  const total = emptySchedule()
  for (const floor of document.building.floors) {
    for (const wall of floor.walls) {
      const part = scheduleWall(floor, wall)
      total.wholeBricks += part.wholeBricks
      total.cutBricks += part.cutBricks
      total.openings.window += part.openings.window
      total.openings.door += part.openings.door
      total.openings.external += part.openings.external
      total.openings.internal += part.openings.internal
      total.openings.garage += part.openings.garage
      total.openings.portal += part.openings.portal
      total.lintels.push(...part.lintels)
    }
  }
  return total
}

function tallyOpening(
  openings: WallSchedule['openings'],
  kind: OpeningKind,
): void {
  if (kind === 'window') openings.window += 1
  else if (kind === 'external-door') openings.external += 1
  else if (kind === 'internal-door') openings.internal += 1
  else if (kind === 'garage') openings.garage += 1
  else if (kind === 'portal') openings.portal += 1
  else openings.door += 1
}

function plural(count: number, singular: string, pluralWord: string): string {
  return `${count} ${count === 1 ? singular : pluralWord}`
}

export function formatSchedule(schedule: WallSchedule): string {
  const parts: string[] = [`${schedule.wholeBricks} whole`]
  if (schedule.cutBricks > 0) {
    parts.push(`${schedule.cutBricks} cut`)
  }
  if (schedule.openings.window > 0) {
    parts.push(plural(schedule.openings.window, 'window', 'windows'))
  }
  if (schedule.openings.door > 0) {
    parts.push(plural(schedule.openings.door, 'door', 'doors'))
  }
  if (schedule.openings.external > 0) {
    parts.push(plural(schedule.openings.external, 'external door', 'external doors'))
  }
  if (schedule.openings.internal > 0) {
    parts.push(plural(schedule.openings.internal, 'internal door', 'internal doors'))
  }
  if (schedule.openings.garage > 0) {
    parts.push(plural(schedule.openings.garage, 'garage door', 'garage doors'))
  }
  if (schedule.openings.portal > 0) {
    parts.push(plural(schedule.openings.portal, 'portal', 'portals'))
  }
  if (schedule.lintels.length === 1) {
    parts.push(`1 lintel ${schedule.lintels[0].length.toFixed(2)} m`)
  } else if (schedule.lintels.length > 1) {
    const lengths = schedule.lintels.map((item) => `${item.length.toFixed(2)} m`).join(', ')
    parts.push(`${schedule.lintels.length} lintels ${lengths}`)
  }
  return parts.join(', ')
}

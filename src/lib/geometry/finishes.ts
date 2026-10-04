import { projectDefaults } from '../model/defaults'
import { autoFinish, BARE_BAGGING, BARE_PLASTER, NO_PAINT, paintSpec, PLASTER_M } from '../model/finishes'
import { cornerById } from '../model/geom'
import { systemOf, wallThickness } from '../model/systems'
import { faceKey } from '../model/trims'
import type { Document, Floor, Wall, WallFinish } from '../model/types'
import { cellAt, layoutSpaces, type WallSide } from './spaces'
import { faceArea } from './walls'

// How one face of a wall is finished, once the wall's own choice, the project's and the wall system's are weighed.
export type ResolvedFinish = {
  finish: WallFinish
  // The paint's id ('none' for bare), and the colour the face shows: the paint, or bare plaster or bagging.
  paint: string
  colour: string | null
  outside: boolean
  // Whether the finish or the paint is this face's own choice rather than the project's.
  ownFinish: boolean
  ownPaint: boolean
}

// Which faces of a storey's walls look outside: a step off the face lands in no room, or in one that is open to
// the air. A patio, a deck or a carport is marked off by lines with nothing built on them (logical walls), and one
// of those lines has nothing beyond it; a kitchen marked off inside a house has rooms on both sides of its lines.
export function outsideFaces(floor: Floor): (wall: Wall, side: WallSide) => boolean {
  const layout = layoutSpaces(floor)
  const cells = [...layout.loose, ...layout.spaces.flatMap((resolved) => resolved.cells)]
  const beside = (wall: Wall, side: WallSide, reach: number) => {
    const a = cornerById(floor.corners, wall.startCornerId)
    const b = cornerById(floor.corners, wall.endCornerId)
    if (!a || !b) return undefined
    const length = Math.hypot(b.x - a.x, b.z - a.z) || 1
    const normal = { x: -(b.z - a.z) / length, z: (b.x - a.x) / length }
    return cellAt(cells, (a.x + b.x) / 2 + normal.x * side * reach, (a.z + b.z) / 2 + normal.z * side * reach)
  }
  // Rooms joined across a logical wall share the air; a logical wall with open ground beyond lets the outside in.
  const group = new Map<unknown, unknown>(cells.map((cell) => [cell, cell]))
  const root = (cell: unknown): unknown => {
    let at = cell
    while (group.get(at) !== at) at = group.get(at)
    return at
  }
  const open = new Set<unknown>()
  const logical = floor.walls.filter((wall) => wall.skin === 'logical')
  for (const wall of logical) {
    const [left, right] = [beside(wall, 1, 0.1), beside(wall, -1, 0.1)]
    if (left && right) group.set(root(left), root(right))
  }
  for (const wall of logical) {
    const [left, right] = [beside(wall, 1, 0.1), beside(wall, -1, 0.1)]
    if (left && !right) open.add(root(left))
    if (right && !left) open.add(root(right))
  }
  return (wall, side) => {
    const cell = beside(wall, side, wallThickness(systemOf(wall)) / 2 + 0.05)
    return !cell || open.has(root(cell))
  }
}

export function resolveFinish(doc: Document, wall: Wall, side: WallSide, outside: boolean): ResolvedFinish {
  const defaults = projectDefaults(doc)
  const own = wall.finish?.[faceKey(side)] ?? {}
  const projectFinish = outside ? defaults.outsideFinish : defaults.insideFinish
  const finish = own.finish ?? (projectFinish === 'auto' ? autoFinish(systemOf(wall).id, outside) : projectFinish)
  const paint = own.paint ?? (outside ? defaults.outsidePaint : defaults.insidePaint)
  // Face brick is left as it is; paint goes on bagging and plaster.
  const colour = finish === 'exposed' ? null : (paintSpec(paint)?.colour ?? (finish === 'plastered' ? BARE_PLASTER : BARE_BAGGING))
  return { finish, paint: finish === 'exposed' ? NO_PAINT : paint, colour, outside, ownFinish: own.finish !== undefined, ownPaint: own.paint !== undefined }
}

// Every finished face of a storey: both sides of each solid wall.
export function floorFinishes(doc: Document, floor: Floor): { wall: Wall; side: WallSide; finish: ResolvedFinish }[] {
  const outside = outsideFaces(floor)
  const out: { wall: Wall; side: WallSide; finish: ResolvedFinish }[] = []
  for (const wall of floor.walls) {
    if (wall.skin === 'logical') continue
    for (const side of [1, -1] as const) out.push({ wall, side, finish: resolveFinish(doc, wall, side, outside(wall, side)) })
  }
  return out
}

export type FinishTotals = {
  // Square metres of each, split outside and inside.
  plaster: { outside: number; inside: number }
  bagging: { outside: number; inside: number }
  paint: { outside: number; inside: number }
  // Cubic metres of plaster mixed.
  mortar: number
}

// Areas of plaster, bagging and paint over the whole house, with the reveals round openings in plastered faces.
export function finishTotals(doc: Document): FinishTotals {
  const totals: FinishTotals = { plaster: { outside: 0, inside: 0 }, bagging: { outside: 0, inside: 0 }, paint: { outside: 0, inside: 0 }, mortar: 0 }
  for (const floor of doc.building.floors) {
    for (const { wall, side, finish } of floorFinishes(doc, floor)) {
      if (finish.finish === 'exposed') continue
      const where = finish.outside ? 'outside' : 'inside'
      // Each face takes half the wall's depth of reveal round its openings.
      const reveal = wall.openings.reduce((sum, opening) => sum + (2 * opening.height + opening.width) * (wallThickness(systemOf(wall)) / 2), 0)
      const area = faceArea(floor, wall, side) + reveal
      if (finish.finish === 'plastered') {
        totals.plaster[where] += area
        totals.mortar += area * PLASTER_M
      } else totals.bagging[where] += area
      if (finish.paint !== NO_PAINT) totals.paint[where] += area
    }
  }
  return totals
}

export type FinishIssue = { id: string; text: string; floorId: string; wallId: string }

// SANS 10400-K: a single-leaf outside wall must keep the rain out, which bare block or brick one leaf thick does not.
export function finishIssues(doc: Document): FinishIssue[] {
  const issues: FinishIssue[] = []
  for (const floor of doc.building.floors) {
    for (const { wall, side, finish } of floorFinishes(doc, floor)) {
      if (!finish.outside || finish.finish !== 'exposed' || systemOf(wall).leaves !== 1) continue
      issues.push({
        id: `damp:${wall.id}:${side}`,
        text: `An outside wall of single-leaf ${systemOf(wall).name.toLowerCase()} is left exposed. Rain soaks through one leaf; plaster or bag and paint it, as SANS 10400-K expects.`,
        floorId: floor.id,
        wallId: wall.id,
      })
    }
  }
  return issues
}

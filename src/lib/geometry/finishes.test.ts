import { describe, expect, it } from 'vitest'
import { takeoff } from '../cost/quantities'
import { PLASTER_M } from '../model/finishes'
import { addOpening, addWallRing, setFaceFinish, setProjectDefaults } from '../model/mutations'
import type { Document, WallSystemId } from '../model/types'
import { fixtureDocument } from '../plot/fixture'
import { finishIssues, finishTotals, floorFinishes, outsideFaces, resolveFinish } from './finishes'
import { buildFinishSkin, faceArea, faceRuns } from './walls'

// An 8 m by 6 m house from (4, 4) to (12, 10).
function house(systemId?: WallSystemId): Document {
  const d = fixtureDocument()
  return addWallRing(d, d.building.floors[0].id, [{ x: 4, z: 4 }, { x: 12, z: 4 }, { x: 12, z: 10 }, { x: 4, z: 10 }], 'double', systemId).document
}

const floorOf = (doc: Document) => doc.building.floors[0]

describe('the finish of a wall face', () => {
  it('knows which face of each wall looks outside', () => {
    const floor = floorOf(house())
    const outside = outsideFaces(floor)
    for (const wall of floor.walls) expect(outside(wall, 1)).not.toBe(outside(wall, -1))
  })

  it('follows the wall system unless the project or the face says otherwise', () => {
    let doc = house('clay-cavity')
    const wall = floorOf(doc).walls[0]
    expect(resolveFinish(doc, wall, 1, true).finish).toBe('exposed')
    const block = house('block-140')
    expect(resolveFinish(block, floorOf(block).walls[0], 1, true)).toMatchObject({ finish: 'plastered', paint: 'sandstone' })
    expect(resolveFinish(doc, wall, 1, false)).toMatchObject({ finish: 'plastered', paint: 'white', ownFinish: false })

    doc = setProjectDefaults(doc, { outsideFinish: 'bagged', outsidePaint: 'ochre' }).document
    expect(resolveFinish(doc, floorOf(doc).walls[0], 1, true)).toMatchObject({ finish: 'bagged', paint: 'ochre' })
    expect(setProjectDefaults(doc, { outsideFinish: 'tiled' as never }).ok).toBe(false)
    expect(setProjectDefaults(doc, { insidePaint: 'puce' }).ok).toBe(false)

    const own = setFaceFinish(doc, floorOf(doc).id, wall.id, 1, { finish: 'plastered', paint: 'sage' })
    expect(own.ok).toBe(true)
    expect(resolveFinish(own.document, floorOf(own.document).walls[0], 1, true)).toMatchObject({ finish: 'plastered', paint: 'sage', ownFinish: true, ownPaint: true })
    expect(resolveFinish(own.document, floorOf(own.document).walls[0], -1, false).ownFinish).toBe(false)
    expect(setFaceFinish(doc, floorOf(doc).id, wall.id, 1, { paint: 'puce' }).ok).toBe(false)

    // Handing both back leaves nothing on the wall.
    const back = setFaceFinish(own.document, floorOf(doc).id, wall.id, 1, { finish: null, paint: null }).document
    expect(floorOf(back).walls[0].finish).toBeUndefined()
  })

  it('leaves face brick unpainted', () => {
    const doc = setProjectDefaults(house(), { outsideFinish: 'exposed' }).document
    expect(resolveFinish(doc, floorOf(doc).walls[0], 1, true)).toMatchObject({ finish: 'exposed', paint: 'none', colour: null })
  })
})

describe('the face of a wall', () => {
  it('is its length by its height, less its openings', () => {
    let doc = house()
    const floor = floorOf(doc)
    const wall = floor.walls[0]
    const whole = faceArea(floor, wall, 1)
    expect(whole).toBeGreaterThan(8 * 2)
    expect(whole).toBeLessThan(9 * 3.2)
    const opened = addOpening(doc, floor.id, wall.id, 'window', 4)
    expect(opened.ok).toBe(true)
    doc = opened.document
    const cut = floorOf(doc).walls[0]
    const [window] = cut.openings
    expect(whole - faceArea(floorOf(doc), cut, 1)).toBeCloseTo(window.width * window.height, 1)
    expect(faceRuns(floorOf(doc), cut, 1).length).toBeGreaterThan(1)
    const skin = buildFinishSkin(floorOf(doc), cut, 1)!
    expect(skin.getAttribute('position').count).toBeGreaterThan(0)
    skin.dispose()
  })
})

describe('plaster and paint', () => {
  it('measures plaster, bagging and paint outside and in', () => {
    let doc = setProjectDefaults(house(), { outsideFinish: 'plastered', insideFinish: 'plastered', outsidePaint: 'sandstone', insidePaint: 'none' }).document
    let totals = finishTotals(doc)
    expect(totals.plaster.outside).toBeGreaterThan(totals.plaster.inside)
    expect(totals.mortar).toBeCloseTo((totals.plaster.outside + totals.plaster.inside) * PLASTER_M, 6)
    expect(totals.paint).toEqual({ outside: totals.plaster.outside, inside: 0 })

    doc = setProjectDefaults(doc, { outsideFinish: 'bagged', insideFinish: 'exposed' }).document
    totals = finishTotals(doc)
    expect(totals.plaster).toEqual({ outside: 0, inside: 0 })
    expect(totals.bagging.outside).toBeGreaterThan(0)
    expect(floorFinishes(doc, floorOf(doc))).toHaveLength(8)
  })

  it('lists them in Quantities, with cement and sand for the plaster', () => {
    const doc = setProjectDefaults(house(), { outsideFinish: 'plastered', insideFinish: 'bagged', outsidePaint: 'sandstone', insidePaint: 'white' }).document
    const totals = finishTotals(doc)
    const lines = takeoff(doc)
    const line = (id: string) => lines.find((item) => item.id === id)
    expect(line('plaster')).toMatchObject({ group: 'Finishes', unit: 'm²' })
    expect(line('plaster-cement')!.quantity).toBeGreaterThan(0)
    expect(line('plaster-sand')!.quantity).toBeGreaterThan(0)
    expect(line('bagging')!.quantity).toBeGreaterThan(0)
    expect(line('paint-outside')!.quantity).toBe(Math.ceil((totals.paint.outside * 2) / 8))
    expect(line('paint-inside')!.quantity).toBe(Math.ceil((totals.paint.inside * 2) / 8))
    expect(line('paint-primer')).toBeDefined()
    expect(line('painting')!.quantity).toBeCloseTo(totals.paint.outside + totals.paint.inside, 0)

    const bare = takeoff(setProjectDefaults(doc, { outsideFinish: 'exposed', insideFinish: 'exposed' }).document)
    expect(bare.some((item) => /^(plaster|bagging|paint)/.test(item.id))).toBe(false)
  })
})

describe('the damp check', () => {
  it('warns of a single-leaf outside wall left exposed, and of nothing else', () => {
    const doc = house('clay-cavity')
    const exposed = setProjectDefaults(house('block-140'), { outsideFinish: 'exposed', insideFinish: 'exposed' }).document
    expect(finishIssues(exposed)).toHaveLength(4)
    expect(finishIssues(setProjectDefaults(exposed, { outsideFinish: 'bagged' }).document)).toEqual([])
    expect(finishIssues(setProjectDefaults(doc, { outsideFinish: 'exposed' }).document)).toEqual([])
  })
})

describe('rooms open to the air', () => {
  it('count as outside: a wall facing a patio marked off by logical walls takes the outside finish', () => {
    // A patio 3 m deep along the south wall of the house, marked off by lines with nothing built on them.
    let doc = house('block-140')
    const floor = () => floorOf(doc)
    const south = floor().walls.find((wall) => {
      const [a, b] = [wall.startCornerId, wall.endCornerId].map((id) => floor().corners.find((corner) => corner.id === id)!)
      return a.z === 4 && b.z === 4
    })!
    const side = outsideFaces(floor())(south, 1) ? 1 : -1
    doc = addWallRing(doc, floor().id, [{ x: 4, z: 4 }, { x: 4, z: 1 }, { x: 12, z: 1 }, { x: 12, z: 4 }], 'logical').document
    const after = floor().walls.find((wall) => wall.id === south.id)!
    expect(outsideFaces(floor())(after, side)).toBe(true)
    expect(outsideFaces(floor())(after, side === 1 ? -1 : 1)).toBe(false)
  })
})

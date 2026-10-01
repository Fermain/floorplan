import { describe, expect, it } from 'vitest'
import { replacePlot, setPlotRoad } from '../model/mutations'
import { samplePlot, documentFromSample } from '../plot/samples'
import { pointInRing } from './pad'
import { buildRoadParts, CARRIAGEWAY_M, plotSide, roadReach, roadStrips, VERGE_M } from './roads'
import { bilinearHeight, padField } from './terrain'

const square = { ring: [[0, 0], [20, 0], [20, 30], [0, 30]] as [number, number][], northBearingDeg: 0, latitude: 0, longitude: 0 }

describe('plot sides and roads', () => {
  it('says which way each side faces, by the plot north', () => {
    expect(plotSide(square, 0)).toEqual({ length: 20, facing: 'south' })
    expect(plotSide(square, 1)?.facing).toBe('east')
    expect(plotSide(square, 2)?.facing).toBe('north')
    expect(plotSide({ ...square, northBearingDeg: 90 }, 0)?.facing).toBe('west')
    expect(plotSide(square, 9)).toBeNull()
  })

  it('lays the verge and road outside the plot, running on past its corners', () => {
    const [strip] = roadStrips({ ...square, roads: [0] })
    const ring = square.ring.map(([x, z]) => ({ x, z }))
    for (const p of [...strip.verge, ...strip.road]) expect(p.z).toBeLessThanOrEqual(1e-9)
    const middle = { x: (strip.road[0].x + strip.road[2].x) / 2, z: (strip.road[0].z + strip.road[2].z) / 2 }
    expect(pointInRing(ring, middle.x, middle.z)).toBe(false)
    expect(Math.min(...strip.road.map((p) => p.z))).toBeCloseTo(-(VERGE_M + CARRIAGEWAY_M))
    expect(Math.min(...strip.road.map((p) => p.x))).toBeLessThan(0)
    expect(Math.max(...strip.road.map((p) => p.x))).toBeGreaterThan(20)
    expect(roadReach({ ...square, roads: [0] })).toEqual([
      [0, -(VERGE_M + CARRIAGEWAY_M)],
      [20, -(VERGE_M + CARRIAGEWAY_M)],
    ])
  })

  it('marks and clears a side, and keeps only sides the boundary still has', () => {
    let doc = documentFromSample('level-suburban', 'clay-cavity', {})
    expect(doc.plot.roads).toEqual([0])
    doc = setPlotRoad(doc, 2, true).document
    expect(doc.plot.roads).toEqual([0, 2])
    doc = setPlotRoad(doc, 0, false).document
    doc = setPlotRoad(doc, 2, false).document
    expect(doc.plot.roads).toBeUndefined()
    expect(setPlotRoad(doc, 7, true).ok).toBe(false)
    const triangle = replacePlot(setPlotRoad(doc, 3, true).document, { ...doc.plot, ring: [[0, 0], [15, 0], [0, 30]], roads: [0, 3] })
    expect(triangle.document.plot.roads).toEqual([0])
  })

  it('stops the centre line where one road crosses another', async () => {
    const { centreDashes } = await import('./roads')
    const corner = roadStrips({ ...square, roads: [0, 1] })
    const dashes = centreDashes(corner)
    // No dash touches two roads' tar: each stops short of the junction.
    const crossing = dashes.filter(([a, b]) => corner.filter((strip) => pointInRing(strip.road, a.x, a.z) || pointInRing(strip.road, b.x, b.z)).length > 1)
    expect(crossing).toEqual([])
    expect(dashes.length).toBeLessThan(centreDashes([corner[0]]).length + centreDashes([corner[1]]).length)
  })

  it('gives the corner sample both streets and the splay', () => {
    expect(samplePlot('corner').plot.roads).toEqual([0, 1, 2])
  })
})

describe('ground and road in Review', () => {
  it('carries the ground on past the survey at its edge heights', () => {
    const field = samplePlot('steep-north').heightfield
    const wide = padField(field, 10)
    expect(wide.cols).toBe(field.cols + 20)
    expect(wide.originX).toBe(field.originX - 10)
    expect(bilinearHeight(wide, field.originX + 3, field.originZ + 4)).toBeCloseTo(bilinearHeight(field, field.originX + 3, field.originZ + 4))
    expect(bilinearHeight(wide, field.originX - 8, field.originZ + 4)).toBeCloseTo(bilinearHeight(field, field.originX, field.originZ + 4))
  })

  it('drapes the road over the ground, just above it', () => {
    const slope = (x: number, z: number) => x * 0.1 - z * 0.05
    const parts = buildRoadParts({ ...square, roads: [0] }, slope)
    expect(parts.map((part) => part.colour)).toHaveLength(3)
    for (const part of parts) {
      const pos = part.geometry.getAttribute('position')
      for (let i = 0; i < pos.count; i += 7) {
        const above = pos.getY(i) - slope(pos.getX(i), pos.getZ(i))
        expect(above).toBeGreaterThan(0)
        expect(above).toBeLessThan(0.1)
      }
      part.geometry.dispose()
    }
    expect(buildRoadParts(square, slope)).toEqual([])
  })
})

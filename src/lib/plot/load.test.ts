import { describe, expect, it } from 'vitest'
import { PLOT_RING, fixtureHeightfield, fixturePlot } from './fixture'
import { loadHeightfield, loadPlot } from './load'

const origin = {
  northBearingDeg: 18,
  latitude: 51.5,
  longitude: -0.12,
}

function feature(
  ring: number[][],
  properties = origin,
  extra: Record<string, unknown> = {},
) {
  return JSON.stringify({
    type: 'Feature',
    ...extra,
    properties,
    geometry: { type: 'Polygon', coordinates: [ring] },
  })
}

describe('loadPlot', () => {
  it('loads a metre GeoJSON polygon and drops the closing vertex', () => {
    const plot = loadPlot(feature([...PLOT_RING, PLOT_RING[0]]))
    expect(plot.ring).toEqual(PLOT_RING)
    expect(plot.northBearingDeg).toBe(18)
    expect(plot.latitude).toBe(51.5)
    expect(plot.longitude).toBe(-0.12)
  })

  it('reverses a clockwise ring to counter-clockwise', () => {
    const clockwise = [...PLOT_RING].reverse()
    const plot = loadPlot(feature([...clockwise, clockwise[0]]))
    expect(plot.ring).toEqual(PLOT_RING)
  })

  it('reads the first polygon in a collection', () => {
    const plot = loadPlot(
      JSON.stringify({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {},
            geometry: { type: 'Point', coordinates: [1, 2] },
          },
          JSON.parse(feature(PLOT_RING)),
        ],
      }),
    )
    expect(plot.ring).toEqual(fixturePlot().ring)
  })

  it('rejects a degree-sized ring', () => {
    const house = [
      [-0.1202, 51.501],
      [-0.1198, 51.501],
      [-0.1198, 51.5014],
      [-0.1202, 51.5014],
      [-0.1202, 51.501],
    ]
    expect(() => loadPlot(feature(house))).toThrow(/degrees/)
  })

  it('rejects a degree ring whose stated origin sits inside it', () => {
    const region = [
      [-6, 50],
      [2, 50],
      [2, 59],
      [-6, 59],
      [-6, 50],
    ]
    expect(() => loadPlot(feature(region))).toThrow(/degrees/)
  })

  it('rejects a geographic CRS even when the numbers are large', () => {
    const metres = [
      [0, 0],
      [400, 0],
      [400, 200],
      [0, 200],
      [0, 0],
    ]
    expect(() =>
      loadPlot(
        feature(metres, origin, {
          crs: { type: 'name', properties: { name: 'EPSG:4326' } },
        }),
      ),
    ).toThrow(/degrees/)
  })

  it('accepts a projected ring outside the degree domain', () => {
    const bng = [
      [530000, 180000],
      [530040, 180000],
      [530040, 180030],
      [530000, 180030],
      [530000, 180000],
    ]
    const plot = loadPlot(feature(bng))
    expect(plot.ring).toEqual([
      [530000, 180000],
      [530040, 180000],
      [530040, 180030],
      [530000, 180030],
    ])
  })

  it('rejects a polygon that does not carry the geodetic origin', () => {
    expect(() =>
      loadPlot(
        JSON.stringify({
          type: 'Polygon',
          coordinates: [[...PLOT_RING, PLOT_RING[0]]],
        }),
      ),
    ).toThrow(/northBearingDeg/)
  })

  it('loads a metre KML polygon from ExtendedData', () => {
    const coords = [...PLOT_RING, PLOT_RING[0]]
      .map(([x, z]) => `${x},${z},0`)
      .join(' ')
    const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Placemark>
    <ExtendedData>
      <Data name="northBearingDeg"><value>18</value></Data>
      <Data name="latitude"><value>51.5</value></Data>
      <Data name="longitude"><value>-0.12</value></Data>
    </ExtendedData>
    <Polygon><outerBoundaryIs><LinearRing><coordinates>${coords}</coordinates></LinearRing></outerBoundaryIs></Polygon>
  </Placemark>
</kml>`
    expect(loadPlot(kml).ring).toEqual(PLOT_RING)
  })

  it('rejects degree coordinates in KML', () => {
    const kml = `<?xml version="1.0"?>
<kml><Placemark>
  <ExtendedData>
    <Data name="northBearingDeg"><value>18</value></Data>
    <Data name="latitude"><value>51.5</value></Data>
    <Data name="longitude"><value>-0.12</value></Data>
  </ExtendedData>
  <Polygon><outerBoundaryIs><LinearRing>
    <coordinates>-0.1202,51.501,0 -0.1198,51.501,0 -0.1198,51.5014,0 -0.1202,51.501,0</coordinates>
  </LinearRing></outerBoundaryIs></Polygon>
</Placemark></kml>`
    expect(() => loadPlot(kml)).toThrow(/degrees/)
  })
})

describe('loadHeightfield', () => {
  it('reads a heightfield grid', () => {
    const field = fixtureHeightfield()
    expect(loadHeightfield(JSON.stringify(field))).toEqual(field)
  })

  it('rejects a grid whose height count does not match', () => {
    const field = fixtureHeightfield()
    expect(() =>
      loadHeightfield(JSON.stringify({ ...field, heights: [1, 2, 3] })),
    ).toThrow(/heightfield/)
  })
})

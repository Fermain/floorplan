import { signedPolygonArea } from '../model/geom'
import type { Heightfield, Plot } from '../model/types'

const DEGREE_MESSAGE =
  'That file is in degrees. The ring has to already be in metres.'
const MISSING_ORIGIN =
  'The plot file needs northBearingDeg, latitude, and longitude.'
const EXPECTED_POLYGON = 'Expected a GeoJSON polygon or a KML polygon.'
const INVALID_TEXT = 'That file is not JSON or KML.'
const DEGENERATE = 'The plot ring is degenerate.'
const ORIGIN_RANGE = 'Latitude or longitude is out of range.'
const HEIGHTFIELD_MESSAGE =
  'The heightfield needs originX, originZ, cellSize, cols, rows, and one height per cell.'

type RecordValue = Record<string, unknown>

function asRecord(value: unknown): RecordValue | undefined {
  if (value && typeof value === 'object' && !Array.isArray(value))
    return value as RecordValue
  return undefined
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function crsIsGeographic(value: unknown): boolean {
  if (value === undefined) return false
  const text = JSON.stringify(value).toUpperCase()
  return (
    text.includes('4326') || text.includes('4269') || text.includes('CRS84')
  )
}

function boundingBox(ring: [number, number][]) {
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (const [x, z] of ring) {
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minZ = Math.min(minZ, z)
    maxZ = Math.max(maxZ, z)
  }
  return { minX, maxX, minZ, maxZ, width: maxX - minX, height: maxZ - minZ }
}

function inWgs84(ring: [number, number][]): boolean {
  return ring.every(([x, z]) => Math.abs(x) <= 180 && Math.abs(z) <= 90)
}

function isDegreeRing(
  ring: [number, number][],
  latitude: number,
  longitude: number,
): boolean {
  if (!inWgs84(ring)) return false
  const box = boundingBox(ring)
  if (box.width < 1 && box.height < 1) return true
  return (
    longitude >= box.minX &&
    longitude <= box.maxX &&
    latitude >= box.minZ &&
    latitude <= box.maxZ
  )
}

function readOrigin(
  props: RecordValue,
): Pick<Plot, 'northBearingDeg' | 'latitude' | 'longitude'> {
  const northBearingDeg = finiteNumber(props.northBearingDeg)
  const latitude = finiteNumber(props.latitude)
  const longitude = finiteNumber(props.longitude)
  if (
    northBearingDeg === undefined ||
    latitude === undefined ||
    longitude === undefined
  ) {
    throw new Error(MISSING_ORIGIN)
  }
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    throw new Error(ORIGIN_RANGE)
  }
  return { northBearingDeg, latitude, longitude }
}

function readPositionRing(value: unknown): [number, number][] {
  if (!Array.isArray(value) || value.length < 3) throw new Error(DEGENERATE)
  const ring: [number, number][] = []
  for (const position of value) {
    if (!Array.isArray(position) || position.length < 2)
      throw new Error(DEGENERATE)
    const x = finiteNumber(position[0])
    const z = finiteNumber(position[1])
    if (x === undefined || z === undefined) throw new Error(DEGENERATE)
    ring.push([x, z])
  }
  return ring
}

function normalizeRing(raw: [number, number][]): [number, number][] {
  const cleaned: [number, number][] = []
  for (const point of raw) {
    const prev = cleaned[cleaned.length - 1]
    if (prev && Math.hypot(prev[0] - point[0], prev[1] - point[1]) <= 1e-6)
      continue
    cleaned.push(point)
  }
  if (cleaned.length >= 2) {
    const first = cleaned[0]
    const last = cleaned[cleaned.length - 1]
    if (Math.hypot(first[0] - last[0], first[1] - last[1]) <= 1e-6)
      cleaned.pop()
  }
  if (cleaned.length < 3) throw new Error(DEGENERATE)
  const area = signedPolygonArea(cleaned.map(([x, z]) => ({ x, z })))
  if (Math.abs(area) <= 1e-8) throw new Error(DEGENERATE)
  if (area < 0) cleaned.reverse()
  return cleaned
}

function plotFromRing(
  raw: [number, number][],
  props: RecordValue,
  crs: unknown,
): Plot {
  if (crsIsGeographic(crs)) throw new Error(DEGREE_MESSAGE)
  const origin = readOrigin(props)
  if (isDegreeRing(raw, origin.latitude, origin.longitude))
    throw new Error(DEGREE_MESSAGE)
  return { ring: normalizeRing(raw), ...origin }
}

function plotFromFeature(feature: RecordValue, inherited?: RecordValue): Plot {
  const geometry = asRecord(feature.geometry)
  if (
    !geometry ||
    geometry.type !== 'Polygon' ||
    !Array.isArray(geometry.coordinates)
  ) {
    throw new Error(EXPECTED_POLYGON)
  }
  const props = { ...inherited, ...asRecord(feature.properties) }
  return plotFromRing(
    readPositionRing(geometry.coordinates[0]),
    props,
    feature.crs ?? geometry.crs,
  )
}

function plotFromGeoJson(data: unknown): Plot {
  const root = asRecord(data)
  if (!root || typeof root.type !== 'string') throw new Error(EXPECTED_POLYGON)
  if (crsIsGeographic(root.crs)) throw new Error(DEGREE_MESSAGE)
  if (root.type === 'Feature') return plotFromFeature(root)
  if (root.type === 'FeatureCollection') {
    if (!Array.isArray(root.features)) throw new Error(EXPECTED_POLYGON)
    const inherited = asRecord(root.properties)
    for (const feature of root.features) {
      const record = asRecord(feature)
      if (!record) continue
      const geometry = asRecord(record.geometry)
      if (geometry?.type === 'Polygon')
        return plotFromFeature(record, inherited)
    }
    throw new Error(EXPECTED_POLYGON)
  }
  if (root.type === 'Polygon') throw new Error(MISSING_ORIGIN)
  throw new Error(EXPECTED_POLYGON)
}

function tag(name: string): string {
  return `(?:[\\w-]+:)?${name}\\b`
}

function readKmlProperties(text: string): RecordValue {
  const props: RecordValue = {}
  const data = new RegExp(
    `<${tag('Data')}[^>]*\\bname="([^"]+)"[^>]*>\\s*<${tag('value')}>([^<]*)</${tag('value')}>`,
    'gi',
  )
  const simple = new RegExp(
    `<${tag('SimpleData')}[^>]*\\bname="([^"]+)"[^>]*>([^<]*)</${tag('SimpleData')}>`,
    'gi',
  )
  for (const match of text.matchAll(data)) {
    const value = Number(match[2].trim())
    if (Number.isFinite(value)) props[match[1]] = value
  }
  for (const match of text.matchAll(simple)) {
    const value = Number(match[2].trim())
    if (Number.isFinite(value)) props[match[1]] = value
  }
  return props
}

function loadKml(text: string): Plot {
  const outer = text.match(
    new RegExp(
      `<${tag('LinearRing')}[^>]*>[\\s\\S]*?<${tag('coordinates')}[^>]*>([\\s\\S]*?)</${tag('coordinates')}>`,
      'i',
    ),
  )
  if (!outer) throw new Error(EXPECTED_POLYGON)
  const ring: [number, number][] = []
  for (const tuple of outer[1].trim().split(/\s+/)) {
    if (!tuple) continue
    const parts = tuple.split(',')
    const x = Number(parts[0])
    const z = Number(parts[1])
    if (!Number.isFinite(x) || !Number.isFinite(z)) throw new Error(DEGENERATE)
    ring.push([x, z])
  }
  return plotFromRing(ring, readKmlProperties(text), undefined)
}

export function loadPlot(input: string): Plot {
  const text = input.trim()
  if (!text) throw new Error(INVALID_TEXT)
  if (text.startsWith('<')) return loadKml(text)
  try {
    return plotFromGeoJson(JSON.parse(text))
  } catch (err) {
    if (err instanceof SyntaxError)
      throw new Error(INVALID_TEXT, { cause: err })
    throw err
  }
}

export function loadHeightfield(input: string): Heightfield {
  let data: unknown
  try {
    data = JSON.parse(input)
  } catch (err) {
    throw new Error(INVALID_TEXT, { cause: err })
  }
  const record = asRecord(data)
  if (!record) throw new Error(HEIGHTFIELD_MESSAGE)
  const originX = finiteNumber(record.originX)
  const originZ = finiteNumber(record.originZ)
  const cellSize = finiteNumber(record.cellSize)
  const cols = finiteNumber(record.cols)
  const rows = finiteNumber(record.rows)
  const heights = record.heights
  if (
    originX === undefined ||
    originZ === undefined ||
    cellSize === undefined ||
    cellSize <= 0 ||
    cols === undefined ||
    rows === undefined ||
    !Number.isInteger(cols) ||
    !Number.isInteger(rows) ||
    cols < 1 ||
    rows < 1 ||
    !Array.isArray(heights) ||
    heights.length !== cols * rows ||
    heights.some(
      (height) => typeof height !== 'number' || !Number.isFinite(height),
    )
  ) {
    throw new Error(HEIGHTFIELD_MESSAGE)
  }
  return {
    originX,
    originZ,
    cellSize,
    cols,
    rows,
    heights: heights.slice(),
  }
}

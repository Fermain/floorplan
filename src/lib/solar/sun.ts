import { getPosition } from 'suncalc'

export function summerSolstice(year: number, latitude: number): Date {
  const month = latitude >= 0 ? 5 : 11
  return new Date(Date.UTC(year, month, 21, 12, 0, 0))
}

export function winterSolstice(year: number, latitude: number): Date {
  const month = latitude >= 0 ? 11 : 5
  return new Date(Date.UTC(year, month, 21, 12, 0, 0))
}

export function sunDirection(
  date: Date,
  latitude: number,
  longitude: number,
  northBearingDeg: number,
): { x: number; y: number; z: number } {
  const { altitude, azimuth } = getPosition(date, latitude, longitude)
  const altRad = (altitude * Math.PI) / 180
  const azRad = (azimuth * Math.PI) / 180
  const horiz = Math.cos(altRad)
  const xTrue = horiz * Math.sin(azRad)
  const zTrue = horiz * Math.cos(azRad)
  const y = Math.sin(altRad)

  const b = (northBearingDeg * Math.PI) / 180
  const cosB = Math.cos(b)
  const sinB = Math.sin(b)
  const x = cosB * xTrue - sinB * zTrue
  const z = sinB * xTrue + cosB * zTrue

  return { x, y, z }
}

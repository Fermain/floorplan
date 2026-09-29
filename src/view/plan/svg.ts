import type { SvgPoint } from '../../lib/export/svg'

export function fmt(n: number): string {
  const r = Math.round(n * 1000) / 1000
  return Number.isInteger(r) ? String(r) : String(r)
}

export function plotBounds(ring: [number, number][], margin: number) {
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
  return {
    minX: minX - margin,
    maxX: maxX + margin,
    minZ: minZ - margin,
    maxZ: maxZ + margin,
  }
}

export function pointsAttr(points: SvgPoint[]): string {
  return points.map(([x, y]) => `${fmt(x)},${fmt(y)}`).join(' ')
}

export function ringPath(ring: { x: number; z: number }[]): string {
  if (ring.length < 3) return ''
  const [first, ...rest] = ring
  return `M ${fmt(first.x)} ${fmt(first.z)} ${rest.map((point) => `L ${fmt(point.x)} ${fmt(point.z)}`).join(' ')} Z`
}

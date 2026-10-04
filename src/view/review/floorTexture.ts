import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three'
import type { FloorFinishSpec } from '../../lib/model/floorFinishes'

const cache = new Map<string, CanvasTexture>()

// One repeat of a floor finish: a tile, or two rows of staggered boards, with its joints. The texture repeats in
// metres, so a 600 mm tile is 600 mm wide on the floor. Finishes laid in one piece have no texture.
export function floorTexture(spec: FloorFinishSpec): CanvasTexture | null {
  const tile = spec.module
  if (!tile) return null
  const cached = cache.get(spec.id)
  if (cached) return cached
  if (typeof document === 'undefined') return null
  const rows = tile.staggered ? 2 : 1
  const width = 256
  const height = tile.staggered ? 64 : 256
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.fillStyle = spec.colour
  ctx.fillRect(0, 0, width, height)
  const row = height / rows
  if (tile.staggered) {
    // Boards differ a little from one to the next.
    const shades = ['rgba(0,0,0,0.07)', 'rgba(255,255,255,0.06)', 'rgba(0,0,0,0.03)']
    ctx.fillStyle = shades[0]
    ctx.fillRect(0, 0, width, row)
    ctx.fillStyle = shades[1]
    ctx.fillRect(0, row, width / 2, row)
    ctx.fillStyle = shades[2]
    ctx.fillRect(width / 2, row, width / 2, row)
  }
  ctx.fillStyle = spec.joint
  const joint = tile.staggered ? 2 : 3
  for (let i = 0; i < rows; i++) {
    ctx.fillRect(0, i * row, width, joint)
    ctx.fillRect(i === 0 ? 0 : width / 2, i * row, joint, row)
  }
  const texture = new CanvasTexture(canvas)
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 8
  texture.repeat.set(1 / tile.along, 1 / (tile.across * rows))
  cache.set(spec.id, texture)
  return texture
}

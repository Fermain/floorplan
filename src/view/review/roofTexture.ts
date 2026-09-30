import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three'
import type { CoveringSpec } from '../../lib/geometry/coverings'

const SIZE = 128
const cache = new Map<string, CanvasTexture>()

function drawTile(ctx: CanvasRenderingContext2D, spec: CoveringSpec) {
  ctx.fillStyle = spec.colour
  ctx.fillRect(0, 0, SIZE, SIZE)
  const roll = ctx.createLinearGradient(0, 0, SIZE, 0)
  roll.addColorStop(0, 'rgba(0,0,0,0.14)')
  roll.addColorStop(0.3, 'rgba(255,255,255,0.08)')
  roll.addColorStop(0.7, 'rgba(255,255,255,0.03)')
  roll.addColorStop(1, 'rgba(0,0,0,0.14)')
  ctx.fillStyle = roll
  ctx.fillRect(0, 0, SIZE, SIZE)
  const lap = ctx.createLinearGradient(0, 0, 0, SIZE * 0.3)
  lap.addColorStop(0, spec.shade)
  lap.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = lap
  ctx.fillRect(0, 0, SIZE, SIZE * 0.3)
  ctx.fillStyle = 'rgba(0,0,0,0.5)'
  ctx.fillRect(0, 0, SIZE, 6)
  ctx.fillStyle = 'rgba(255,255,255,0.12)'
  ctx.fillRect(0, SIZE - 4, SIZE, 4)
}

function drawSheet(ctx: CanvasRenderingContext2D, spec: CoveringSpec) {
  ctx.fillStyle = spec.colour
  ctx.fillRect(0, 0, SIZE, SIZE)
  if (spec.id === 'corrugated') {
    const wave = ctx.createLinearGradient(0, 0, SIZE, 0)
    wave.addColorStop(0, 'rgba(255,255,255,0.22)')
    wave.addColorStop(0.5, 'rgba(0,0,0,0.25)')
    wave.addColorStop(1, 'rgba(255,255,255,0.22)')
    ctx.fillStyle = wave
    ctx.fillRect(0, 0, SIZE, SIZE)
    return
  }
  ctx.fillStyle = spec.shade
  ctx.fillRect(0, 0, SIZE * 0.1, SIZE)
  ctx.fillStyle = 'rgba(255,255,255,0.25)'
  ctx.fillRect(SIZE * 0.1, 0, SIZE * 0.06, SIZE)
}

export function coveringTexture(spec: CoveringSpec): CanvasTexture | null {
  const cached = cache.get(spec.id)
  if (cached) return cached
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  if (spec.kind === 'tile') drawTile(ctx, spec)
  else drawSheet(ctx, spec)
  const texture = new CanvasTexture(canvas)
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 8
  cache.set(spec.id, texture)
  return texture
}

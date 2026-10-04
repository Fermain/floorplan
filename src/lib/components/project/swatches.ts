import { PAVING } from '$lib/geometry/paving'
import { floorFinishSpec } from '$lib/model/floorFinishes'
import type { FloorFinish, PavingSurface } from '$lib/model/types'

// CSS backgrounds that stand for a surface in a swatch: its colour, with its joints or grain drawn small.
const grid = (line: string, w: number, h: number) =>
  `linear-gradient(${line} 1px, transparent 1px) 0 0 / ${w}px ${h}px, linear-gradient(90deg, ${line} 1px, transparent 1px) 0 0 / ${w}px ${h}px`
const rows = (line: string, h: number) => `linear-gradient(${line} 1px, transparent 1px) 0 0 / 100% ${h}px`
const dots = (dot: string, step: number) => `radial-gradient(${dot} 1px, transparent 1.4px) 0 0 / ${step}px ${step}px`

export function floorSwatch(id: FloorFinish): string {
  const spec = floorFinishSpec(id)
  if (id === 'tiles') return `${grid(spec.joint, 14, 14)}, ${spec.colour}`
  if (id === 'timber') return `${rows(spec.joint, 6)}, ${spec.colour}`
  if (id === 'vinyl') return `${rows(spec.joint, 9)}, ${spec.colour}`
  if (id === 'carpet') return `${dots(spec.joint, 4)}, ${spec.colour}`
  return spec.colour
}

export function pavingSwatch(id: PavingSurface): string {
  const colour = PAVING[id].colour
  if (id === 'cement-pavers') return `${grid('#7d776e', 10, 6)}, ${colour}`
  if (id === 'clay-pavers') return `${grid('#7d4632', 10, 5)}, ${colour}`
  if (id === 'gravel') return `${dots('#9a927f', 4)}, ${dots('#e2dccd', 5)}, ${colour}`
  if (id === 'grass-blocks') return `${grid('#b9b5aa', 9, 9)}, ${colour}`
  return colour
}

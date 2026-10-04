import { pointInPlot } from './plot-check'
import type { Carport, CarportRoof, Document } from './types'

export type CarportRoofSpec = { id: CarportRoof; name: string; text: string; colour: string; pitchDeg: number }

export const CARPORT_ROOFS: readonly CarportRoofSpec[] = [
  { id: 'sheet', name: 'Steel sheeting', text: 'IBR sheeting on a steel frame, falling to one side. Keeps the rain and the hail off.', colour: '#8f979e', pitchDeg: 5 },
  { id: 'shade-cloth', name: 'Shade cloth', text: 'Knitted shade cloth stretched over a steel frame. Cheaper; keeps the sun and the hail off, not the rain.', colour: '#b9ab8d', pitchDeg: 12 },
]

// One car's width under the roof, how far a car runs in, and the clear height at the low side.
export const CARPORT_BAY_M = 2.75
export const CARPORT_DEEP_M = 5.5
export const CARPORT_CLEAR_M = 2.3
export const CARPORT_POST_M = 0.076
export const CARPORT_BAYS = [1, 2, 3] as const

export function carportRoofSpec(id: CarportRoof): CarportRoofSpec {
  return CARPORT_ROOFS.find((item) => item.id === id) ?? CARPORT_ROOFS[0]
}

export function carportName(bays: Carport['bays']): string {
  return bays === 1 ? 'Single carport' : bays === 2 ? 'Double carport' : 'Triple carport'
}

// How wide a carport is across its cars, and how deep along them.
export function carportSize(carport: Pick<Carport, 'bays'>): { wide: number; deep: number } {
  return { wide: carport.bays * CARPORT_BAY_M, deep: CARPORT_DEEP_M }
}

// Its four corners, in order round it: the two at the way in first.
export function carportRing(carport: Pick<Carport, 'x' | 'z' | 'dx' | 'dz' | 'bays'>): { x: number; z: number }[] {
  const { wide, deep } = carportSize(carport)
  const along = { x: carport.dx, z: carport.dz }
  const across = { x: -carport.dz, z: carport.dx }
  const at = (a: number, b: number) => ({ x: carport.x + along.x * a + across.x * b, z: carport.z + along.z * a + across.z * b })
  return [at(-deep / 2, -wide / 2), at(-deep / 2, wide / 2), at(deep / 2, wide / 2), at(deep / 2, -wide / 2)]
}

// Where its posts stand: a row down each side, one at each end and one between each pair of cars' lengths.
export function carportPosts(carport: Pick<Carport, 'x' | 'z' | 'dx' | 'dz' | 'bays'>): { x: number; z: number }[] {
  const { wide, deep } = carportSize(carport)
  const along = { x: carport.dx, z: carport.dz }
  const across = { x: -carport.dz, z: carport.dx }
  const inset = CARPORT_POST_M / 2 + 0.05
  const posts: { x: number; z: number }[] = []
  for (const b of [-wide / 2 + inset, wide / 2 - inset]) {
    for (const a of [-deep / 2 + inset, 0, deep / 2 - inset]) {
      posts.push({ x: carport.x + along.x * a + across.x * b, z: carport.z + along.z * a + across.z * b })
    }
  }
  return posts
}

export function carportProblem(document: Document, carport: Omit<Carport, 'id'>): string | null {
  if (!CARPORT_BAYS.includes(carport.bays)) return 'a carport takes one, two or three cars'
  if (!CARPORT_ROOFS.some((item) => item.id === carport.roof)) return 'unknown carport roof'
  if (![carport.x, carport.z, carport.dx, carport.dz].every(Number.isFinite)) return 'carport position is not a number'
  if (Math.abs(Math.hypot(carport.dx, carport.dz) - 1) > 1e-6) return 'carport direction must be a unit vector'
  if (carportRing(carport).some((p) => !pointInPlot(document.plot, p.x, p.z))) return 'carport outside the plot'
  return null
}

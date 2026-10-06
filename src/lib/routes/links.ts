import { resolve } from '$app/paths'

export type ProjectSection = 'plan' | 'review' | 'quantities' | 'checks' | 'project'

export function homeHref(): string {
  return resolve('/app')
}

// An example opened read-only, in Review, where it shows best.
export function exampleHref(exampleId: string): string {
  return resolve('/app/p/[id]/review', { id: `example-${exampleId}` })
}

export function planHref(id: string, storey = 0, room?: string): string {
  const base =
    storey > 0
      ? resolve('/app/p/[id]/plan/[[storey]]', { id, storey: String(storey) })
      : resolve('/app/p/[id]/plan/[[storey]]', { id })
  return room ? `${base}?room=${encodeURIComponent(room)}` : base
}

export function wallHref(id: string, wallId: string): string {
  return resolve('/app/p/[id]/wall/[wallId]', { id, wallId })
}

export function sectionHref(id: string, section: ProjectSection): string {
  if (section === 'plan') return planHref(id)
  if (section === 'review') return resolve('/app/p/[id]/review', { id })
  if (section === 'quantities') return resolve('/app/p/[id]/quantities', { id })
  if (section === 'checks') return resolve('/app/p/[id]/checks', { id })
  return resolve('/app/p/[id]/project', { id })
}

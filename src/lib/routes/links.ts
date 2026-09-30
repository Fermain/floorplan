import { resolve } from '$app/paths'

export type ProjectSection = 'plan' | 'review' | 'quantities' | 'checks' | 'site'

export function homeHref(): string {
  return resolve('/')
}

export function planHref(id: string, storey = 0, room?: string): string {
  const base =
    storey > 0
      ? resolve('/p/[id]/plan/[[storey]]', { id, storey: String(storey) })
      : resolve('/p/[id]/plan/[[storey]]', { id })
  return room ? `${base}?room=${encodeURIComponent(room)}` : base
}

export function wallHref(id: string, wallId: string): string {
  return resolve('/p/[id]/wall/[wallId]', { id, wallId })
}

export function sectionHref(id: string, section: ProjectSection): string {
  if (section === 'plan') return planHref(id)
  if (section === 'review') return resolve('/p/[id]/review', { id })
  if (section === 'quantities') return resolve('/p/[id]/quantities', { id })
  if (section === 'checks') return resolve('/p/[id]/checks', { id })
  return resolve('/p/[id]/site', { id })
}

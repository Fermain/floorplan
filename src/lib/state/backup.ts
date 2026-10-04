import type { Document } from '../model/types'
import { isDocument } from './projects'

// Every project in one file, to keep somewhere safer than the browser or to move to another one.
export type Backup = {
  kind: 'floorplan-backup'
  version: 1
  exportedAt: number
  projects: { name: string; updatedAt: number; document: Document }[]
}

export function makeBackup(projects: Backup['projects'], now: number): Backup {
  return { kind: 'floorplan-backup', version: 1, exportedAt: now, projects }
}

// The projects in a backup file that can be read, and how many entries could not.
export function readBackup(text: string): { ok: true; projects: Backup['projects']; skipped: number } | { ok: false; reason: string } {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, reason: 'That file could not be read.' }
  }
  if (typeof parsed !== 'object' || parsed === null) return { ok: false, reason: 'That file is not a floorplan backup.' }
  const value = parsed as Record<string, unknown>
  if (value.kind !== 'floorplan-backup' || !Array.isArray(value.projects)) {
    return { ok: false, reason: isDocument(parsed) ? 'That is a single project. Use Open file for it.' : 'That file is not a floorplan backup.' }
  }
  const projects: Backup['projects'] = []
  let skipped = 0
  for (const entry of value.projects as unknown[]) {
    const item = entry as Record<string, unknown> | null
    if (item && typeof item.name === 'string' && isDocument(item.document)) {
      projects.push({ name: item.name, updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : 0, document: item.document })
    } else skipped += 1
  }
  return { ok: true, projects, skipped }
}

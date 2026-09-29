import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import { newId } from '../model/id'
import type { Document } from '../model/types'

export type ProjectSummary = {
  id: string
  name: string
  updatedAt: number
}

type StoredDocument = {
  id: string
  document: Document
}

type MetaRecord = {
  id: 'last'
  projectId: string
}

interface ProjectDatabase extends DBSchema {
  projects: {
    key: string
    value: ProjectSummary
    indexes: { 'by-updated': number }
  }
  documents: {
    key: string
    value: StoredDocument
  }
  meta: {
    key: string
    value: MetaRecord
  }
}

const DATABASE = 'floorplan-projects'
const LAST_KEY = 'last'

let dbPromise: Promise<IDBPDatabase<ProjectDatabase>> | null = null

function database(): Promise<IDBPDatabase<ProjectDatabase>> {
  if (!dbPromise) {
    dbPromise = openDB<ProjectDatabase>(DATABASE, 1, {
      upgrade(db) {
        const projects = db.createObjectStore('projects', { keyPath: 'id' })
        projects.createIndex('by-updated', 'updatedAt')
        db.createObjectStore('documents', { keyPath: 'id' })
        db.createObjectStore('meta', { keyPath: 'id' })
      },
    })
  }
  return dbPromise
}

export async function closeProjectDatabase(): Promise<void> {
  if (!dbPromise) return
  const db = await dbPromise
  db.close()
  dbPromise = null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isRing(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every(
      (point) =>
        Array.isArray(point) &&
        point.length >= 2 &&
        point.every(
          (coord) => typeof coord === 'number' && Number.isFinite(coord),
        ),
    )
  )
}

function isHeightfield(value: Record<string, unknown>): boolean {
  const { cols, rows, heights } = value
  return (
    typeof cols === 'number' &&
    typeof rows === 'number' &&
    Array.isArray(heights) &&
    heights.length === cols * rows &&
    heights.every(
      (height) => typeof height === 'number' && Number.isFinite(height),
    )
  )
}

function isFloor(value: unknown): boolean {
  if (!isRecord(value)) return false
  return (
    typeof value.id === 'string' &&
    Array.isArray(value.corners) &&
    Array.isArray(value.walls)
  )
}

export function isDocument(value: unknown): value is Document {
  if (!isRecord(value)) return false
  const { plot, heightfield, building } = value
  if (!isRecord(plot) || !isRing(plot.ring)) return false
  if (!isRecord(heightfield) || !isHeightfield(heightfield)) return false
  if (!isRecord(building) || !Array.isArray(building.floors)) return false
  return building.floors.every(isFloor)
}

async function remember(projectId: string | null): Promise<void> {
  const db = await database()
  if (projectId === null) {
    await db.delete('meta', LAST_KEY)
    return
  }
  await db.put('meta', { id: LAST_KEY, projectId })
}

export async function lastProjectId(): Promise<string | null> {
  const db = await database()
  const row = await db.get('meta', LAST_KEY)
  return row?.projectId ?? null
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const db = await database()
  const rows = await db.getAllFromIndex('projects', 'by-updated')
  return rows.reverse()
}

export async function saveProject(
  id: string | null,
  name: string,
  document: Document,
): Promise<
  { ok: true; project: ProjectSummary } | { ok: false; reason: string }
> {
  const trimmed = name.trim()
  if (!trimmed) return { ok: false, reason: 'Enter a project name.' }
  if (!isDocument(document))
    return { ok: false, reason: 'This drawing could not be saved.' }
  const project: ProjectSummary = {
    id: id ?? newId('project'),
    name: trimmed,
    updatedAt: Date.now(),
  }
  try {
    const db = await database()
    const tx = db.transaction(['projects', 'documents', 'meta'], 'readwrite')
    await Promise.all([
      tx.objectStore('projects').put(project),
      tx.objectStore('documents').put({ id: project.id, document }),
      tx.objectStore('meta').put({ id: LAST_KEY, projectId: project.id }),
      tx.done,
    ])
    return { ok: true, project }
  } catch {
    return { ok: false, reason: 'Could not save the project.' }
  }
}

export async function openProject(
  id: string,
): Promise<
  | { ok: true; project: ProjectSummary; document: Document }
  | { ok: false; reason: string }
> {
  const db = await database()
  const project = await db.get('projects', id)
  const stored = await db.get('documents', id)
  if (!project || !stored || !isDocument(stored.document)) {
    return { ok: false, reason: 'Saved project could not be read.' }
  }
  await remember(id)
  return { ok: true, project, document: stored.document }
}

export async function deleteProject(id: string): Promise<void> {
  const db = await database()
  const last = await lastProjectId()
  const tx = db.transaction(['projects', 'documents', 'meta'], 'readwrite')
  const jobs: Promise<unknown>[] = [
    tx.objectStore('projects').delete(id),
    tx.objectStore('documents').delete(id),
    tx.done,
  ]
  if (last === id) jobs.push(tx.objectStore('meta').delete(LAST_KEY))
  await Promise.all(jobs)
}

export async function forgetLastProject(): Promise<void> {
  await remember(null)
}

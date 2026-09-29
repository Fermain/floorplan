import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it } from 'vitest'
import { fixtureDocument } from '../plot/fixture'
import {
  closeProjectDatabase,
  deleteProject,
  forgetLastProject,
  isDocument,
  lastProjectId,
  listProjects,
  openProject,
  saveProject,
} from './projects'

beforeEach(async () => {
  await closeProjectDatabase()
  globalThis.indexedDB = new IDBFactory()
})

function namedCopy(name: string) {
  const document = fixtureDocument()
  document.building.floors[0].id = name
  return document
}

describe('project database', () => {
  it('rejects an empty name and writes nothing', async () => {
    const saved = await saveProject(null, '   ', fixtureDocument())
    expect(saved.ok).toBe(false)
    expect(await listProjects()).toEqual([])
  })

  it('stores each project whole and lists them without the drawing', async () => {
    const alpha = namedCopy('alpha')
    alpha.heightfield.heights[0] = 42
    const first = await saveProject(null, 'Alpha', alpha)
    expect(first.ok).toBe(true)
    if (!first.ok) return
    await new Promise((resolve) => setTimeout(resolve, 5))
    const beta = namedCopy('beta')
    beta.heightfield.heights[0] = 7
    const second = await saveProject(null, 'Beta', beta)
    expect(second.ok).toBe(true)
    if (!second.ok) return

    const listed = await listProjects()
    expect(listed.map((project) => project.name)).toEqual(['Beta', 'Alpha'])
    expect(listed.every((project) => !('document' in project))).toBe(true)

    const opened = await openProject(first.project.id)
    expect(opened.ok).toBe(true)
    if (!opened.ok) return
    expect(opened.document.heightfield.heights[0]).toBe(42)
    expect(opened.document.building.floors[0].id).toBe('alpha')
    expect(await lastProjectId()).toBe(first.project.id)
  })

  it('overwrites one project and leaves the other in place', async () => {
    const first = await saveProject(null, 'Alpha', namedCopy('alpha'))
    expect(first.ok).toBe(true)
    if (!first.ok) return
    const second = await saveProject(null, 'Beta', namedCopy('beta'))
    expect(second.ok).toBe(true)
    if (!second.ok) return
    const next = namedCopy('alpha-2')
    const saved = await saveProject(first.project.id, 'Alpha renamed', next)
    expect(saved.ok).toBe(true)
    if (!saved.ok) return
    expect(saved.project.id).toBe(first.project.id)

    const opened = await openProject(first.project.id)
    const other = await openProject(second.project.id)
    expect(opened.ok && opened.document.building.floors[0].id).toBe('alpha-2')
    expect(other.ok && other.document.building.floors[0].id).toBe('beta')
    expect((await listProjects()).map((project) => project.name)).toContain(
      'Alpha renamed',
    )
  })

  it('drops a deleted project and forgets it when it was last opened', async () => {
    const saved = await saveProject(null, 'Alpha', fixtureDocument())
    expect(saved.ok).toBe(true)
    if (!saved.ok) return
    await deleteProject(saved.project.id)
    expect(await listProjects()).toEqual([])
    expect(await lastProjectId()).toBeNull()
    const opened = await openProject(saved.project.id)
    expect(opened.ok).toBe(false)
  })

  it('clears the project that would reopen', async () => {
    const saved = await saveProject(null, 'Alpha', fixtureDocument())
    expect(saved.ok).toBe(true)
    if (!saved.ok) return
    await forgetLastProject()
    expect(await lastProjectId()).toBeNull()
    expect(await listProjects()).toHaveLength(1)
  })
})

describe('isDocument', () => {
  it('accepts the fixture and rejects a partial record', () => {
    expect(isDocument(fixtureDocument())).toBe(true)
    expect(isDocument(null)).toBe(false)
    expect(isDocument({ plot: {}, heightfield: {}, building: {} })).toBe(false)
  })
})

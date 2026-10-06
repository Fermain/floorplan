import { describe, expect, it } from 'vitest'
import { fixtureDocument } from '../plot/fixture'
import { documentStore, READ_ONLY } from './document.svelte'
import { exampleOf, exampleProjectId } from './session.svelte'

describe('a document opened to be looked at', () => {
  it('refuses every change, and says why', () => {
    documentStore.loadDocument(fixtureDocument(), { readOnly: true })
    const before = documentStore.document
    const floorId = before.building.floors[0].id
    const result = documentStore.addWallRing(floorId, [{ x: 4, z: 4 }, { x: 8, z: 4 }, { x: 8, z: 8 }, { x: 4, z: 8 }], 'double')
    expect(result).toMatchObject({ ok: false, reason: READ_ONLY })
    expect(documentStore.document).toBe(before)
    expect(documentStore.undo()).toBe(false)
    expect(documentStore.readOnly).toBe(true)
  })

  it('can be changed again once a project is loaded in its place', () => {
    documentStore.loadDocument(fixtureDocument())
    expect(documentStore.readOnly).toBe(false)
    const floorId = documentStore.document.building.floors[0].id
    expect(documentStore.addWallRing(floorId, [{ x: 4, z: 4 }, { x: 8, z: 4 }, { x: 8, z: 8 }, { x: 4, z: 8 }], 'double').ok).toBe(true)
    expect(documentStore.undo()).toBe(true)
  })

  it('is found from its address, which no stored project can have', () => {
    expect(exampleOf(exampleProjectId('verulam'))?.name).toBe('Verulam house and cottage')
    expect(exampleOf('example-nothing')).toBeNull()
    expect(exampleOf('project-1234')).toBeNull()
  })
})

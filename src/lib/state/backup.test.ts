import { describe, expect, it } from 'vitest'
import { EXAMPLES } from '../examples'
import { projectFacts } from '../model/summary'
import { fixtureDocument } from '../plot/fixture'
import { makeBackup, readBackup } from './backup'
import { readSettings } from './settings.svelte'

describe('backing up every project', () => {
  it('reads back what it wrote, and skips what is not a project', () => {
    const doc = fixtureDocument()
    const backup = makeBackup([{ name: 'House', updatedAt: 5, document: doc }], 10)
    const text = JSON.stringify({ ...backup, projects: [...backup.projects, { name: 'Broken', document: {} }] })
    const read = readBackup(text)
    expect(read).toMatchObject({ ok: true, skipped: 1 })
    if (read.ok) expect(read.projects.map((item) => item.name)).toEqual(['House'])
  })

  it('says what is wrong with other files', () => {
    expect(readBackup('not json')).toEqual({ ok: false, reason: 'That file could not be read.' })
    expect(readBackup('{"a":1}')).toMatchObject({ ok: false, reason: 'That file is not a floorplan backup.' })
    expect(readBackup(JSON.stringify(fixtureDocument()))).toMatchObject({ ok: false, reason: 'That is a single project. Use Open file for it.' })
  })
})

describe('app settings', () => {
  it('fall back to the defaults when nothing, or nonsense, is stored', () => {
    expect(readSettings(null)).toEqual({ hints: true })
    expect(readSettings('{')).toEqual({ hints: true })
    expect(readSettings('{"hints":"no"}')).toEqual({ hints: true })
    expect(readSettings('{"hints":false}')).toEqual({ hints: false })
  })
})

describe('a project at a glance', () => {
  it('counts the storeys, rooms and floor area of a house, and none for a bare plot', async () => {
    expect(projectFacts(fixtureDocument())).toMatchObject({ storeys: 0, rooms: 0, floorArea: 0 })
    const flat = await EXAMPLES.find((example) => example.id === 'granny-flat')!.load()
    const facts = projectFacts(flat)
    expect(facts.storeys).toBe(2)
    expect(facts.rooms).toBeGreaterThan(4)
    expect(facts.floorArea).toBeGreaterThan(50)
    expect(facts.plotArea).toBeGreaterThan(facts.floorArea / 2)
  })
})

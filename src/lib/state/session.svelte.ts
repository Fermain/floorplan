import type { Document } from '../model/types'
import { documentStore } from './document.svelte'
import { EXAMPLES } from '../examples'
import { openProject, saveProject, type ProjectSummary } from './projects'

// An example opened to be looked at has an id of this form in place of a project's. It is never saved.
const EXAMPLE_PREFIX = 'example-'
export const exampleProjectId = (exampleId: string) => `${EXAMPLE_PREFIX}${exampleId}`
export const exampleOf = (projectId: string) => (projectId.startsWith(EXAMPLE_PREFIX) ? (EXAMPLES.find((example) => example.id === projectId.slice(EXAMPLE_PREFIX.length)) ?? null) : null)

export type SaveState = 'idle' | 'saving' | 'saved' | 'error'

const AUTOSAVE_MS = 600

let current = $state<ProjectSummary | null>(null)
let saveState = $state<SaveState>('idle')
let loadError = $state<string | null>(null)
let savedDocument: Document | null = null
let timer: ReturnType<typeof setTimeout> | null = null

async function flush(): Promise<void> {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  const project = current
  const document = documentStore.document
  if (!project || documentStore.readOnly || document === savedDocument) return
  saveState = 'saving'
  const result = await saveProject(project.id, project.name, $state.snapshot(document) as Document)
  if (result.ok) {
    savedDocument = document
    if (current?.id === project.id) current = result.project
    saveState = 'saved'
  } else {
    saveState = 'error'
  }
}

function schedule() {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => void flush(), AUTOSAVE_MS)
}

$effect.root(() => {
  $effect(() => {
    const document = documentStore.document
    if (!current || document === savedDocument) return
    schedule()
  })
})

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => void flush())
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flush()
  })
}

export const session = {
  get project() {
    return current
  },
  get saveState() {
    return saveState
  },
  get loadError() {
    return loadError
  },
  // Whether what is open is an example being looked at rather than a project being worked on.
  get readOnly() {
    return documentStore.readOnly
  },
  async open(id: string): Promise<boolean> {
    if (current?.id === id) return true
    await flush()
    if (id.startsWith(EXAMPLE_PREFIX)) {
      const example = exampleOf(id)
      if (!example) {
        current = null
        loadError = 'There is no example by that name.'
        return false
      }
      documentStore.loadDocument(await example.load(), { readOnly: true })
      savedDocument = documentStore.document
      current = { id, name: example.name, updatedAt: 0 }
      loadError = null
      saveState = 'idle'
      return true
    }
    const opened = await openProject(id)
    if (!opened.ok) {
      current = null
      loadError = opened.reason
      return false
    }
    documentStore.loadDocument(opened.document)
    savedDocument = documentStore.document
    current = opened.project
    loadError = null
    saveState = 'saved'
    return true
  },
  async rename(name: string): Promise<boolean> {
    const project = current
    const trimmed = name.trim()
    if (!project || !trimmed || documentStore.readOnly) return false
    const result = await saveProject(project.id, trimmed, $state.snapshot(documentStore.document) as Document)
    if (!result.ok) return false
    current = result.project
    savedDocument = documentStore.document
    saveState = 'saved'
    return true
  },
  async close(): Promise<void> {
    await flush()
    current = null
    savedDocument = null
    saveState = 'idle'
  },
  flush,
}

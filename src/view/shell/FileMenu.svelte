<script lang="ts">
  import { onMount, tick } from 'svelte'
  import { exportFloorSvg } from '../../lib/export/svg'
  import { fixtureDocument } from '../../lib/plot/fixture'
  import { loadHeightfield, loadPlot } from '../../lib/plot/load'
  import type { Plot } from '../../lib/model/types'
  import { documentStore } from '../../lib/state/document.svelte'
  import {
    deleteProject,
    forgetLastProject,
    lastProjectId,
    listProjects,
    openProject,
    saveProject,
    type ProjectSummary,
  } from '../../lib/state/projects'

  let {
    activeFloorId = '',
    onError,
  }: {
    activeFloorId?: string
    onError?: (message: string) => void
  } = $props()

  let ready = $state(false)
  let open = $state(false)
  let pane = $state<'open' | 'save-as' | 'site' | null>(null)
  let menuEl = $state<HTMLDivElement | undefined>(undefined)
  let nameInput = $state<HTMLInputElement | undefined>(undefined)
  let nameDraft = $state('')
  let currentId = $state<string | null>(null)
  let currentName = $state('')
  let savedJson = $state('')
  let projects = $state<ProjectSummary[]>([])
  let saveError = $state('')
  let siteError = $state('')
  let writing = $state(false)

  function capture(): string {
    return JSON.stringify($state.snapshot(documentStore.document))
  }

  const liveJson = $derived(JSON.stringify($state.snapshot(documentStore.document)))
  const dirty = $derived(ready && liveJson !== savedJson)
  const label = $derived.by(() => {
    const name = currentName || 'Untitled'
    return dirty ? `${name} unsaved` : name
  })

  function allowSwitch(): boolean {
    if (!dirty) return true
    return window.confirm('Discard unsaved changes?')
  }

  async function refreshList(): Promise<void> {
    projects = await listProjects()
  }

  function close() {
    open = false
    pane = null
  }

  function showPane(next: 'open' | 'save-as' | 'site') {
    pane = pane === next ? null : next
    siteError = ''
    if (pane === 'save-as') {
      nameDraft = currentName
      void tick().then(() => nameInput?.focus())
    }
  }

  async function write(id: string | null, name: string) {
    if (writing) return
    writing = true
    const result = await saveProject(id, name, $state.snapshot(documentStore.document))
    writing = false
    if (!result.ok) {
      saveError = result.reason
      return
    }
    currentId = result.project.id
    currentName = result.project.name
    nameDraft = result.project.name
    savedJson = capture()
    saveError = ''
    close()
    await refreshList()
  }

  async function saveShortcut() {
    if (currentId) {
      if (!dirty) return
      await write(currentId, currentName)
      return
    }
    open = true
    pane = 'save-as'
    nameDraft = currentName
    await tick()
    nameInput?.focus()
  }

  function onSaveAs(event: SubmitEvent) {
    event.preventDefault()
    void write(null, nameDraft)
  }

  async function openSaved(id: string) {
    if (id === currentId) {
      close()
      return
    }
    if (!allowSwitch()) return
    const opened = await openProject(id)
    if (!opened.ok) {
      saveError = opened.reason
      return
    }
    documentStore.loadDocument(opened.document)
    currentId = opened.project.id
    currentName = opened.project.name
    nameDraft = opened.project.name
    savedJson = capture()
    saveError = ''
    close()
  }

  async function remove(id: string, name: string) {
    if (!window.confirm(`Delete ${name}?`)) return
    await deleteProject(id)
    if (currentId === id) {
      currentId = null
      currentName = ''
      savedJson = ''
    }
    saveError = ''
    await refreshList()
  }

  async function newProject() {
    if (!allowSwitch()) return
    documentStore.loadDocument(fixtureDocument())
    currentId = null
    currentName = ''
    nameDraft = ''
    savedJson = capture()
    saveError = ''
    close()
    await forgetLastProject()
  }

  function stamp(updatedAt: number): string {
    return new Date(updatedAt).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  function report(message: string) {
    onError?.(message)
  }

  function explain(reason: string): string {
    if (reason === 'existing walls leave the new plot') {
      return 'Those walls sit outside the new plot. Remove them, or import a ring that contains them.'
    }
    return reason
  }

  async function readFile(event: Event): Promise<string | undefined> {
    const input = event.currentTarget
    if (!(input instanceof HTMLInputElement) || !input.files?.[0]) return
    const text = await input.files[0].text()
    input.value = ''
    return text
  }

  async function onPlotFile(event: Event) {
    const text = await readFile(event)
    if (!text) return
    try {
      const result = documentStore.replacePlot(loadPlot(text))
      report(result.ok ? '' : explain(result.reason))
      if (result.ok) close()
    } catch (err) {
      report(err instanceof Error ? err.message : 'Could not read the plot.')
    }
  }

  async function onHeightFile(event: Event) {
    const text = await readFile(event)
    if (!text) return
    try {
      const result = documentStore.replaceHeightfield(loadHeightfield(text))
      report(result.ok ? '' : explain(result.reason))
      if (result.ok) close()
    } catch (err) {
      report(err instanceof Error ? err.message : 'Could not read the heightfield.')
    }
  }

  function exportSvg() {
    const floorId = activeFloorId || documentStore.document.building.floors[0]?.id
    if (!floorId) return
    const svg = exportFloorSvg(documentStore.document, floorId)
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'floor.svg'
    link.click()
    URL.revokeObjectURL(url)
    close()
  }

  function commitSite(
    input: HTMLInputElement,
    next: Plot,
    previous: string,
    invalid: string,
  ) {
    if (invalid) {
      siteError = invalid
      input.value = previous
      return
    }
    const result = documentStore.replacePlot(next)
    if (!result.ok) {
      siteError = explain(result.reason)
      input.value = previous
      return
    }
    siteError = ''
  }

  onMount(() => {
    const onPointer = (event: PointerEvent) => {
      if (!open || !menuEl) return
      const target = event.target
      if (target instanceof Node && menuEl.contains(target)) return
      close()
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && open) {
        event.preventDefault()
        event.stopImmediatePropagation()
        close()
        return
      }
      const target = event.target
      if (target instanceof HTMLElement && target !== nameInput) {
        const tag = target.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return
      }
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 's') return
      event.preventDefault()
      if (target === nameInput) {
        void write(null, nameDraft)
        return
      }
      void saveShortcut()
    }
    const onLeave = (event: BeforeUnloadEvent) => {
      if (!dirty) return
      event.preventDefault()
    }
    window.addEventListener('pointerdown', onPointer, true)
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('beforeunload', onLeave)
    void (async () => {
      const id = await lastProjectId()
      if (id) {
        const opened = await openProject(id)
        if (opened.ok) {
          documentStore.loadDocument(opened.document)
          currentId = opened.project.id
          currentName = opened.project.name
          nameDraft = opened.project.name
        }
      }
      savedJson = capture()
      ready = true
      await refreshList()
    })()
    return () => {
      window.removeEventListener('pointerdown', onPointer, true)
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('beforeunload', onLeave)
    }
  })
</script>

<div class="menu" bind:this={menuEl}>
  <button
    type="button"
    class="current"
    class:dirty
    class:active={open}
    aria-expanded={open}
    aria-haspopup="menu"
    onclick={() => (open ? close() : (open = true))}
  >
    {label}
  </button>
  {#if open}
    <div class="panel" role="menu">
      <button type="button" role="menuitem" onclick={() => void newProject()}>New</button>
      <button type="button" role="menuitem" onclick={() => showPane('open')}>Open…</button>
      <button
        type="button"
        role="menuitem"
        disabled={(currentId !== null && !dirty) || writing}
        onclick={() => void saveShortcut()}
      >
        Save
      </button>
      <button type="button" role="menuitem" onclick={() => showPane('save-as')}>Save as…</button>
      <div class="rule"></div>
      <label class="file">
        Import plot…
        <input
          type="file"
          accept=".geojson,.json,.kml,application/geo+json"
          onchange={onPlotFile}
        />
      </label>
      <label class="file">
        Import height…
        <input type="file" accept=".json,application/json" onchange={onHeightFile} />
      </label>
      <button type="button" role="menuitem" onclick={exportSvg}>Export SVG…</button>
      <div class="rule"></div>
      <button type="button" role="menuitem" onclick={() => showPane('site')}>Site…</button>
      {#if saveError}
        <p class="error">{saveError}</p>
      {/if}
      {#if pane === 'open'}
        {#if projects.length === 0}
          <p class="empty">No saved drawings</p>
        {:else}
          <ul>
            {#each projects as project (project.id)}
              <li class:current-row={project.id === currentId}>
                <button type="button" class="open-row" onclick={() => void openSaved(project.id)}>
                  <span>{project.name}</span>
                  <span class="when">{stamp(project.updatedAt)}</span>
                </button>
                <button type="button" class="delete" onclick={() => void remove(project.id, project.name)}>
                  Delete
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      {:else if pane === 'save-as'}
        <form class="name" onsubmit={onSaveAs}>
          <input
            bind:this={nameInput}
            bind:value={nameDraft}
            placeholder="Drawing name"
            aria-label="Drawing name"
          />
          <button type="submit" disabled={writing}>Save</button>
        </form>
      {:else if pane === 'site'}
        {@const plot = documentStore.document.plot}
        <form class="site" onsubmit={(event) => event.preventDefault()}>
          <label>
            Latitude
            <input
              type="number"
              step="0.0001"
              value={plot.latitude}
              aria-label="Latitude"
              onchange={(event) => {
                const input = event.currentTarget as HTMLInputElement
                const value = Number(input.value)
                commitSite(
                  input,
                  { ...plot, latitude: value },
                  String(plot.latitude),
                  !Number.isFinite(value) || value < -90 || value > 90
                    ? 'Latitude must be between −90 and 90.'
                    : '',
                )
              }}
            />
          </label>
          <label>
            Longitude
            <input
              type="number"
              step="0.0001"
              value={plot.longitude}
              aria-label="Longitude"
              onchange={(event) => {
                const input = event.currentTarget as HTMLInputElement
                const value = Number(input.value)
                commitSite(
                  input,
                  { ...plot, longitude: value },
                  String(plot.longitude),
                  !Number.isFinite(value) || value < -180 || value > 180
                    ? 'Longitude must be between −180 and 180.'
                    : '',
                )
              }}
            />
          </label>
          <label>
            North bearing
            <input
              type="number"
              step="1"
              value={plot.northBearingDeg}
              aria-label="North bearing"
              onchange={(event) => {
                const input = event.currentTarget as HTMLInputElement
                const value = Number(input.value)
                commitSite(
                  input,
                  { ...plot, northBearingDeg: value },
                  String(plot.northBearingDeg),
                  !Number.isFinite(value) ? 'North bearing must be a number.' : '',
                )
              }}
            />
          </label>
          {#if siteError}<p class="error">{siteError}</p>{/if}
        </form>
      {/if}
    </div>
  {/if}
</div>

<style>
  .menu {
    position: relative;
    justify-self: start;
  }

  .current {
    max-width: 16rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .current.dirty {
    border-color: #b45309;
  }

  button,
  .file {
    padding: 0.35rem 0.65rem;
    border: 1px solid #d4d4d8;
    border-radius: 4px;
    background: #fff;
    font: inherit;
    cursor: pointer;
  }

  button.active {
    border-color: #2563eb;
    background: #eff6ff;
  }

  button:disabled {
    color: #a1a1aa;
    cursor: default;
  }

  .panel {
    position: absolute;
    top: calc(100% + 0.35rem);
    left: 0;
    z-index: 3;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    width: 16rem;
    max-height: 24rem;
    overflow: auto;
    padding: 0.35rem;
    border: 1px solid #d4d4d8;
    border-radius: 4px;
    background: #fff;
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.08);
  }

  .panel > button,
  .file {
    display: block;
    width: 100%;
    border: none;
    background: transparent;
    text-align: left;
  }

  .panel > button:hover:not(:disabled),
  .file:hover {
    background: #f4f4f5;
  }

  .rule {
    height: 1px;
    margin: 0.15rem 0.35rem;
    background: #e4e4e7;
  }

  .file input {
    display: none;
  }

  .name,
  .site {
    display: flex;
    gap: 0.35rem;
    padding-top: 0.35rem;
    border-top: 1px solid #e4e4e7;
  }

  .site {
    flex-direction: column;
  }

  .site label {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    font-size: 0.875rem;
  }

  input {
    width: 7rem;
    padding: 0.3rem 0.4rem;
    border: 1px solid #d4d4d8;
    border-radius: 4px;
    font: inherit;
  }

  .name input {
    flex: 1;
    min-width: 0;
    width: auto;
  }

  .name button {
    border: 1px solid #d4d4d8;
  }

  .error {
    margin: 0;
    color: #b91c1c;
  }

  .empty {
    margin: 0.2rem 0.35rem;
    color: #71717a;
  }

  ul {
    list-style: none;
    margin: 0.15rem 0 0;
    padding: 0.25rem 0 0;
    border-top: 1px solid #e4e4e7;
  }

  li {
    display: flex;
    align-items: stretch;
    gap: 0.15rem;
  }

  li.current-row .open-row {
    background: #eff6ff;
  }

  .open-row {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.1rem;
    min-width: 0;
    border: none;
    background: transparent;
    text-align: left;
  }

  .open-row span:first-child {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .when {
    color: #71717a;
    font-size: 0.75rem;
  }

  .delete {
    border: none;
    background: transparent;
    color: #71717a;
  }

  .open-row:hover,
  .delete:hover {
    background: #f4f4f5;
  }
</style>

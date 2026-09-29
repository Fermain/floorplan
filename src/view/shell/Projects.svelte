<script lang="ts">
  import { onMount, tick } from 'svelte'
  import { fixtureDocument } from '../../lib/plot/fixture'
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

  let ready = $state(false)
  let projectsOpen = $state(false)
  let menuEl = $state<HTMLDivElement | undefined>(undefined)
  let nameInput = $state<HTMLInputElement | undefined>(undefined)
  let nameDraft = $state('')
  let currentId = $state<string | null>(null)
  let currentName = $state('')
  let savedJson = $state('')
  let projects = $state<ProjectSummary[]>([])
  let saveError = $state('')
  let writing = $state(false)

  function capture(): string {
    return JSON.stringify($state.snapshot(documentStore.document))
  }

  const liveJson = $derived(
    JSON.stringify($state.snapshot(documentStore.document)),
  )
  const dirty = $derived(ready && liveJson !== savedJson)
  const label = $derived.by(() => {
    if (!ready) return 'Projects'
    if (!currentName) return dirty ? 'Unsaved' : 'Projects'
    return dirty ? `${currentName} unsaved` : currentName
  })

  function allowSwitch(): boolean {
    if (!dirty) return true
    return window.confirm('Discard unsaved changes?')
  }

  async function refreshList(): Promise<void> {
    projects = await listProjects()
  }

  async function write(id: string | null, name: string) {
    if (writing) return
    writing = true
    const result = await saveProject(
      id,
      name,
      $state.snapshot(documentStore.document),
    )
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
    await refreshList()
  }

  async function saveShortcut() {
    if (currentId) {
      if (!dirty) return
      await write(currentId, currentName)
      return
    }
    projectsOpen = true
    await tick()
    nameInput?.focus()
  }

  function onSaveAs(event: SubmitEvent) {
    event.preventDefault()
    void write(null, nameDraft)
  }

  async function openSaved(id: string) {
    if (id === currentId) {
      projectsOpen = false
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
    projectsOpen = false
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
    projectsOpen = false
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

  $effect(() => {
    if (!projectsOpen) return
    const menu = menuEl
    const onPointer = (event: PointerEvent) => {
      const target = event.target
      if (menu && target instanceof Node && menu.contains(target)) return
      projectsOpen = false
      if (target instanceof Element && target.closest('header')) return
      event.stopPropagation()
    }
    window.addEventListener('pointerdown', onPointer, true)
    return () => window.removeEventListener('pointerdown', onPointer, true)
  })

  onMount(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target
      if (target instanceof HTMLElement && target !== nameInput) {
        const tag = target.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable)
          return
      }
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 's')
        return
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
    window.addEventListener('keydown', onKey)
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
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('beforeunload', onLeave)
    }
  })
</script>

<div class="menu" bind:this={menuEl}>
  <button
    type="button"
    class="current"
    class:active={projectsOpen}
    aria-expanded={projectsOpen}
    aria-haspopup="menu"
    onclick={() => (projectsOpen = !projectsOpen)}
  >
    {label}
  </button>
  {#if projectsOpen}
    <div class="panel" role="menu">
      {#if currentId}
        <button
          type="button"
          disabled={!dirty || writing}
          onclick={() => void write(currentId, currentName)}
        >
          Save
        </button>
      {/if}
      <form class="name" onsubmit={onSaveAs}>
        <input
          bind:this={nameInput}
          bind:value={nameDraft}
          placeholder="Project name"
          aria-label="Project name"
        />
        <button type="submit" disabled={writing}
          >{currentId ? 'Save as' : 'Save'}</button
        >
      </form>
      <button type="button" onclick={() => void newProject()}>New</button>
      {#if saveError}
        <p class="error">{saveError}</p>
      {/if}
      {#if projects.length === 0}
        <p class="empty">No saved projects</p>
      {:else}
        <ul>
          {#each projects as project (project.id)}
            <li class:current-row={project.id === currentId}>
              <button
                type="button"
                class="open"
                onclick={() => void openSaved(project.id)}
              >
                <span>{project.name}</span>
                <span class="when">{stamp(project.updatedAt)}</span>
              </button>
              <button
                type="button"
                class="delete"
                onclick={() => void remove(project.id, project.name)}
              >
                Delete
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}
</div>

<style>
  .menu {
    position: relative;
    margin-left: 0.65rem;
  }

  .current {
    max-width: 14rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  button {
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
    gap: 0.25rem;
    width: 18rem;
    max-height: 22rem;
    overflow: auto;
    padding: 0.35rem;
    border: 1px solid #d4d4d8;
    border-radius: 4px;
    background: #fff;
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.08);
  }

  .panel > button {
    width: 100%;
    border: none;
    background: transparent;
    text-align: left;
  }

  .panel > button:hover:not(:disabled) {
    background: #f4f4f5;
  }

  .name {
    display: flex;
    gap: 0.35rem;
  }

  .name input {
    flex: 1;
    min-width: 0;
    padding: 0.35rem 0.5rem;
    border: 1px solid #d4d4d8;
    border-radius: 4px;
    font: inherit;
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

  li.current-row .open {
    background: #eff6ff;
  }

  .open {
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

  .open span:first-child {
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

  .open:hover,
  .delete:hover {
    background: #f4f4f5;
  }
</style>

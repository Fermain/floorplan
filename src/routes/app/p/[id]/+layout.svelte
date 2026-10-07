<script lang="ts">
  import { goto } from '$app/navigation'
  import { page } from '$app/state'
  import { untrack } from 'svelte'
  import ArrowLeft from '@lucide/svelte/icons/arrow-left'
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert'
  import { settings } from '$lib/state/settings.svelte'
  import Redo2 from '@lucide/svelte/icons/redo-2'
  import Undo2 from '@lucide/svelte/icons/undo-2'
  import { Badge } from '$lib/components/ui/badge'
  import { Button } from '$lib/components/ui/button'
  import { Input } from '$lib/components/ui/input'
  import { exportFloorSvg } from '$lib/export/svg'
  import { homeHref, sectionHref, type ProjectSection } from '$lib/routes/links'
  import { documentStore } from '$lib/state/document.svelte'
  import { deleteProject, saveProject } from '$lib/state/projects'
  import { exampleOf, session } from '$lib/state/session.svelte'
  import Eye from '@lucide/svelte/icons/eye'
  import ProjectMenubar from '$lib/components/app/ProjectMenubar.svelte'
  import SettingsDialog from '$lib/components/app/SettingsDialog.svelte'
  import { statusLine } from '$lib/state/status.svelte'
  import type { Document } from '$lib/model/types'

  let { children } = $props()

  const id = $derived(page.params.id ?? '')
  let ready = $state(false)
  let renaming = $state(false)
  let nameDraft = $state('')

  $effect(() => {
    const projectId = id
    untrack(() => {
      if (session.project?.id === projectId) {
        ready = true
        return
      }
      ready = false
      void session.open(projectId).then((ok) => {
        if (projectId === id) ready = ok
      })
    })
  })

  // Whether the status bar is opened out to show a long message in full.
  let statusOpen = $state(false)

  const allSections: { id: ProjectSection; label: string }[] = [
    { id: 'plan', label: 'Plan' },
    { id: 'review', label: 'Review' },
    { id: 'quantities', label: 'Quantities' },
    { id: 'checks', label: 'Checks' },
    { id: 'project', label: 'Project' },
  ]
  // An example is previewed, not worked on: nothing in it can be changed, so it has no settings page.
  const viewing = $derived(ready && session.readOnly)
  const sections = $derived(viewing ? allSections.filter((section) => section.id !== 'project') : allSections)
  let copying = $state(false)
  let settingsOpen = $state(false)
  const menuActions = { rename: startRename, duplicate: () => void duplicate(), exportSvg, exportJson, remove: () => void remove(), openCopy: () => void openCopy(), settings: () => (settingsOpen = true) }

  // A copy of the example in this browser, to work on, opened where the example was being looked at.
  async function openCopy() {
    const example = exampleOf(id)
    if (!example || copying) return
    copying = true
    try {
      const saved = await saveProject(null, example.name, $state.snapshot(documentStore.document) as Document)
      if (saved.ok) await goto(sectionHref(saved.project.id, active))
    } finally {
      copying = false
    }
  }

  const active = $derived.by((): ProjectSection => {
    const route = page.route.id ?? ''
    if (route.includes('/review')) return 'review'
    if (route.includes('/quantities')) return 'quantities'
    if (route.includes('/checks')) return 'checks'
    if (route.includes('/project')) return 'project'
    return 'plan'
  })

  // The tab's title: the view, then the project, so several open projects can be told apart.
  const pageTitle = $derived.by(() => {
    const view = (page.route.id ?? '').includes('/wall/') ? 'Focus' : (sections.find((section) => section.id === active)?.label ?? 'Plan')
    return `${view} · ${session.project?.name ?? 'Project'} · Floorplan`
  })

  const saveLabel = $derived(
    session.saveState === 'saving'
      ? 'Saving…'
      : session.saveState === 'error'
        ? 'Not saved'
        : session.saveState === 'saved'
          ? 'Saved'
          : '',
  )

  function startRename() {
    nameDraft = session.project?.name ?? ''
    renaming = true
  }

  async function finishRename() {
    renaming = false
    if (nameDraft.trim() && nameDraft.trim() !== session.project?.name) await session.rename(nameDraft)
  }

  function download(name: string, type: string, body: string) {
    const url = URL.createObjectURL(new Blob([body], { type }))
    const link = window.document.createElement('a')
    link.href = url
    link.download = name
    link.click()
    URL.revokeObjectURL(url)
  }

  function fileStem(): string {
    return (session.project?.name ?? 'floorplan').replace(/[^\w-]+/g, '-').toLowerCase()
  }

  function exportSvg() {
    const storey = Number(page.params.storey ?? 0)
    const floor = documentStore.document.building.floors.find((item) => item.index === storey)
    if (!floor) return
    download(`${fileStem()}-storey-${storey + 1}.svg`, 'image/svg+xml', exportFloorSvg(documentStore.document, floor.id))
  }

  function exportJson() {
    download(`${fileStem()}.json`, 'application/json', JSON.stringify($state.snapshot(documentStore.document), null, 2))
  }

  async function duplicate() {
    const name = `${session.project?.name ?? 'Project'} copy`
    const saved = await saveProject(null, name, $state.snapshot(documentStore.document) as Document)
    if (saved.ok) await goto(sectionHref(saved.project.id, 'plan'))
  }

  async function remove() {
    const project = session.project
    if (!project) return
    if (!window.confirm(`Delete “${project.name}”? This cannot be undone.`)) return
    await session.close()
    await deleteProject(project.id)
    await goto(homeHref())
  }

  $effect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target
      if (target instanceof HTMLElement) {
        const tag = target.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) return
      }
      if (!(event.metaKey || event.ctrlKey)) return
      const key = event.key.toLowerCase()
      if (key === 'z') {
        event.preventDefault()
        if (event.shiftKey) documentStore.redo()
        else documentStore.undo()
      } else if (key === 'y') {
        event.preventDefault()
        documentStore.redo()
      } else if (key === 's') {
        event.preventDefault()
        void session.flush()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
</script>

<svelte:head>
  <title>{pageTitle}</title>
</svelte:head>

<div class="flex h-dvh flex-col overflow-hidden bg-muted/40">
  <header class="z-20 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-1 border-b bg-background px-2 py-1.5 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:gap-3 md:px-3 md:py-2">
    <div class="flex min-w-0 items-center gap-1 md:gap-2">
      <Button variant="ghost" size="icon-sm" href={homeHref()} aria-label="All projects">
        <ArrowLeft />
      </Button>
      {#if viewing}
        <span class="min-w-0 truncate px-1.5 py-0.5 text-sm font-medium">{session.project?.name ?? '…'}</span>
        <Badge variant="secondary" class="shrink-0 gap-1 font-normal max-sm:hidden"><Eye class="size-3" />Preview</Badge>
      {:else if renaming}
        <Input
          class="h-7 w-40 max-w-full sm:w-56"
          bind:value={nameDraft}
          autofocus
          onblur={() => void finishRename()}
          onkeydown={(event) => {
            if (event.key === 'Enter') void finishRename()
            if (event.key === 'Escape') renaming = false
          }}
        />
      {:else}
        <button
          type="button"
          class="min-w-0 truncate rounded-md px-1.5 py-0.5 text-sm font-medium hover:bg-muted"
          title="Rename"
          onclick={startRename}
        >
          {session.project?.name ?? '…'}
        </button>
      {/if}
      {#if saveLabel}
        <Badge variant={session.saveState === 'error' ? 'destructive' : 'secondary'} class="shrink-0 font-normal">
          {saveLabel}
        </Badge>
      {/if}
    </div>
    <div class="flex items-center justify-end gap-0.5 md:col-start-3">
      {#if viewing}
        <Button size="sm" disabled={copying} onclick={() => void openCopy()}>{copying ? 'Opening…' : 'Open a copy to edit'}</Button>
      {:else}
        <Button variant="ghost" size="icon-sm" aria-label="Undo" title="Undo (⌘Z)" onclick={() => documentStore.undo()}>
          <Undo2 />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Redo" title="Redo (⇧⌘Z)" onclick={() => documentStore.redo()}>
          <Redo2 />
        </Button>
      {/if}
      <!-- On a narrow screen the menubar is one button here; on a wide one it is the row below. -->
      <div class="md:hidden">
        <ProjectMenubar {id} {active} {viewing} actions={menuActions} compact />
      </div>
    </div>
    <nav
      class="col-span-2 mt-1.5 flex items-center gap-1 overflow-x-auto md:col-span-1 md:col-start-2 md:row-start-1 md:mt-0 md:justify-center md:overflow-visible md:rounded-lg md:bg-muted md:p-1"
      aria-label="Project"
    >
      {#each sections as section (section.id)}
        <Button
          size="sm"
          variant={active === section.id ? 'outline' : 'ghost'}
          href={sectionHref(id, section.id)}
          aria-current={active === section.id ? 'page' : undefined}
          class="shrink-0 {active === section.id ? 'shadow-xs' : 'text-muted-foreground'}"
        >
          {section.label}
        </Button>
      {/each}
    </nav>
  </header>
  <!-- The menubar: the same actions as the controls round it, under familiar headings. -->
  <div class="z-10 border-b bg-background px-1.5 max-md:hidden">
    <ProjectMenubar {id} {active} {viewing} actions={menuActions} />
  </div>
  <main class="relative min-h-0 flex-1">
    <div class="h-full min-h-0">
      {#if ready}
        {@render children()}
      {:else if session.loadError}
        <div class="mx-auto mt-24 max-w-md text-center">
          <p class="text-sm text-muted-foreground">{session.loadError}</p>
          <Button class="mt-4" variant="outline" href={homeHref()}>Back to projects</Button>
        </div>
      {/if}
    </div>
  </main>
  {#if statusLine.text && (statusLine.error || settings.hints)}
    <!-- A status bar under the drawing rather than a note floating over it, so it never covers the controls.
         One line; a tap or click opens a long message out in full. -->
    <footer
      class="z-10 border-t px-3 pt-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] text-xs sm:text-sm {statusLine.error
        ? 'border-destructive/30 bg-destructive/10 text-destructive'
        : 'bg-background text-muted-foreground'}"
      aria-live="polite"
    >
      <button
        type="button"
        class="flex w-full items-start gap-1.5 text-left"
        aria-expanded={statusOpen}
        title={statusOpen ? undefined : statusLine.text}
        onclick={() => (statusOpen = !statusOpen)}
      >
        {#if statusLine.error}<TriangleAlert class="mt-0.5 size-3.5 shrink-0" />{/if}
        <span class={statusOpen ? '' : 'truncate'}>{statusLine.text}</span>
      </button>
    </footer>
  {/if}
</div>
<SettingsDialog bind:open={settingsOpen} />

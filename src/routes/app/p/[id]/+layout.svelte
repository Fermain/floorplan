<script lang="ts">
  import { goto } from '$app/navigation'
  import { page } from '$app/state'
  import { untrack } from 'svelte'
  import { settings } from '$lib/state/settings.svelte'
  import Redo2 from '@lucide/svelte/icons/redo-2'
  import Undo2 from '@lucide/svelte/icons/undo-2'
  import { Button } from '$lib/components/ui/button'
  import { Input } from '$lib/components/ui/input'
  import { exportFloorSvg } from '$lib/export/svg'
  import { homeHref, sectionHref, type ProjectSection } from '$lib/routes/links'
  import { documentStore } from '$lib/state/document.svelte'
  import { deleteProject, saveProject } from '$lib/state/projects'
  import { exampleOf, session } from '$lib/state/session.svelte'
  import ChevronRight from '@lucide/svelte/icons/chevron-right'
  import ProjectMenubar from '$lib/components/app/ProjectMenubar.svelte'
  import SettingsDialog from '$lib/components/app/SettingsDialog.svelte'
  import Breadcrumbs from '$lib/components/app/Breadcrumbs.svelte'
  import RoomSymbol from '$lib/components/brand/RoomSymbol.svelte'
  import { statusLine } from '$lib/state/status.svelte'
  import { workspace } from '$lib/state/workspace.svelte'
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

  const day = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

  // The line under the project's name, as on a drawing's title block: when it was last saved, the country it is
  // drawn for, and whether the work is safe.
  type Particular = { text: string; tone?: 'line' | 'error' }
  const particulars = $derived.by((): Particular[] => {
    const out: Particular[] = []
    if (viewing) out.push({ text: 'Preview', tone: 'line' })
    const saved = session.project?.updatedAt
    if (saved) out.push({ text: day.format(saved) })
    out.push({ text: 'ZA' })
    if (saveLabel) out.push({ text: saveLabel, tone: session.saveState === 'error' ? 'error' : 'line' })
    return out
  })

  const note = $derived(!!statusLine.text && (statusLine.error || settings.hints))

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
      if (event.key === 'Escape') {
        if (workspace.stepOut()) {
          event.preventDefault()
          return
        }
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

<div class="flex h-dvh flex-col overflow-hidden bg-background">
  <!-- The title block: the symbol, the project's name over a line of particulars, the numbered sheets, and undo. -->
  <header class="z-20 grid grid-cols-[auto_minmax(0,1fr)_auto] border-b border-rule bg-background md:h-14 md:grid-cols-[auto_minmax(0,1fr)_auto_minmax(0,1fr)]">
    <a href={homeHref()} aria-label="All projects" title="All projects" class="grid size-12 place-items-center border-r border-rule hover:bg-accent md:size-14">
      <RoomSymbol />
    </a>
    <div class="flex min-w-0 flex-col justify-center gap-0.5 px-3 md:px-4">
      <div class="flex min-w-0 items-center gap-1.5">
        {#if viewing}
          <span class="min-w-0 truncate text-[15px] font-semibold">{session.project?.name ?? '…'}</span>
        {:else if renaming}
          <Input
            class="h-6 w-40 max-w-full sm:w-56"
            bind:value={nameDraft}
            autofocus
            onblur={() => void finishRename()}
            onkeydown={(event) => {
              if (event.key === 'Enter') void finishRename()
              if (event.key === 'Escape') renaming = false
            }}
          />
        {:else}
          <button type="button" class="-mx-1 min-w-0 truncate px-1 text-left text-[15px] font-semibold hover:bg-accent" title="Rename" onclick={startRename}>
            {session.project?.name ?? '…'}
          </button>
        {/if}
        {#if workspace.breadcrumbs.length > 0}
          <ChevronRight class="size-3.5 shrink-0 text-muted-foreground/50 max-sm:hidden" aria-hidden="true" />
          <div class="min-w-0 truncate max-sm:hidden">
            <Breadcrumbs items={workspace.breadcrumbs} />
          </div>
        {/if}
      </div>
      <p class="flex min-w-0 items-center gap-1.5 truncate font-mono text-[11px] tracking-wider whitespace-nowrap text-muted-foreground uppercase">
        {#each particulars as item, index (item.text)}
          {#if index > 0}<span aria-hidden="true">·</span>{/if}
          <span class={item.tone === 'error' ? 'text-destructive' : item.tone === 'line' ? 'text-line' : ''}>{item.text}</span>
        {/each}
      </p>
    </div>

    <div class="flex items-center justify-end gap-0.5 px-2 md:col-start-4 md:px-3">
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
    <!-- The sheets. The one in view has ink sides and a paper fill, and no bar beneath it. -->
    <nav
      class="col-span-full flex h-9 items-stretch overflow-x-auto border-t border-border text-sm md:col-span-1 md:col-start-3 md:row-start-1 md:h-auto md:overflow-visible md:border-t-0 md:border-l md:border-rule"
      aria-label="Sheets"
    >
      {#each sections as section, index (section.id)}
        {@const current = active === section.id}
        <a
          href={sectionHref(id, section.id)}
          aria-current={current ? 'page' : undefined}
          class="flex shrink-0 items-center gap-2 border-r px-3 md:px-4 {current
            ? 'border-rule bg-card font-semibold text-foreground'
            : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground'} {current && index > 0 ? '-ml-px border-l' : ''}"
        >
          <span class="font-mono text-[11px] font-normal {current ? 'text-line' : ''}">{String(index + 1).padStart(2, '0')}</span>
          <span>{section.label}</span>
        </a>
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
  <!-- The notes line under the drawing: what the tool in hand wants, or what has gone wrong. It is always there,
       so the drawing never shifts when a note comes or goes. A tap or click opens a long note out in full. -->
  <footer
    class="z-10 flex min-h-[30px] items-start gap-4 border-t border-rule bg-background px-3 pt-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] font-mono text-[11px] leading-[18px] text-muted-foreground"
  >
    <div class="min-w-0 flex-1" aria-live="polite">
      {#if note}
        <button
          type="button"
          class="flex w-full min-w-0 items-start gap-1.5 text-left"
          aria-expanded={statusOpen}
          title={statusOpen ? undefined : statusLine.text}
          onclick={() => (statusOpen = !statusOpen)}
        >
          <span class="shrink-0 tracking-wider {statusLine.error ? 'text-destructive' : 'text-line'}">{statusLine.error ? 'CHECK' : 'NOTE'}</span>
          <span aria-hidden="true">·</span>
          <span class="{statusOpen ? '' : 'truncate'} {statusLine.error ? 'text-destructive' : ''}">{statusLine.text}</span>
        </button>
      {/if}
    </div>
    <span class="shrink-0 tracking-wider whitespace-nowrap uppercase max-sm:hidden">SANS 10400 · ZAR</span>
  </footer>
</div>
<SettingsDialog bind:open={settingsOpen} />

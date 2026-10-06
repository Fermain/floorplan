<script lang="ts">
  import { goto } from '$app/navigation'
  import ChevronDown from '@lucide/svelte/icons/chevron-down'
  import ChevronRight from '@lucide/svelte/icons/chevron-right'
  import Plus from '@lucide/svelte/icons/plus'
  import Search from '@lucide/svelte/icons/search'
  import Settings from '@lucide/svelte/icons/settings'
  import Upload from '@lucide/svelte/icons/upload'
  import { onMount } from 'svelte'
  import { Button } from '$lib/components/ui/button'
  import type { Document } from '$lib/model/types'
  import { resolve } from '$app/paths'
  import { exampleHref, sectionHref } from '$lib/routes/links'
  import { deleteProject, isDocument, lastProjectId, listProjects, readProject, saveProject, type ProjectSummary } from '$lib/state/projects'
  import { session } from '$lib/state/session.svelte'
  import { EXAMPLES, type Example } from '$lib/examples'
  import { projectFacts } from '$lib/model/summary'
  import { takeoff, totalCost } from '$lib/cost/quantities'
  import PlanThumbnail from '$lib/components/project/PlanThumbnail.svelte'
  import SettingsDialog from '$lib/components/app/SettingsDialog.svelte'

  let projects = $state<ProjectSummary[]>([])
  // Drawings read for the preview, by project or example id. Raw, so a copy can be cloned from them.
  let drawings = $state.raw<Record<string, Document>>({})
  let loaded = $state(false)
  let problem = $state('')
  let opening = $state<string | null>(null)
  let settingsOpen = $state(false)

  // What is picked in the list: one of your projects or an example.
  type Pick = { kind: 'project' | 'example'; id: string }
  let pick = $state<Pick | null>(null)
  let filter = $state('')
  let sort = $state<{ by: 'name' | 'edited'; down: boolean }>({ by: 'edited', down: true })
  let folded = $state<string[]>([])
  let renaming = $state(false)
  let nameDraft = $state('')

  const shown = $derived.by(() => {
    const needle = filter.trim().toLowerCase()
    const list = needle ? projects.filter((project) => project.name.toLowerCase().includes(needle)) : [...projects]
    const sign = sort.down ? -1 : 1
    return list.sort((a, b) => sign * (sort.by === 'name' ? a.name.localeCompare(b.name) : a.updatedAt - b.updatedAt))
  })
  const shownExamples = $derived.by(() => {
    const needle = filter.trim().toLowerCase()
    return needle ? EXAMPLES.filter((example) => `${example.name} ${example.place}`.toLowerCase().includes(needle)) : [...EXAMPLES]
  })

  const pickedProject = $derived(pick?.kind === 'project' ? (projects.find((project) => project.id === pick?.id) ?? null) : null)
  const pickedExample = $derived(pick?.kind === 'example' ? (EXAMPLES.find((example) => example.id === pick?.id) ?? null) : null)
  const drawing = $derived(pick ? (drawings[pick.id] ?? null) : null)
  const facts = $derived(drawing ? projectFacts(drawing) : null)

  async function refresh(keep?: Pick) {
    projects = await listProjects()
    const last = await lastProjectId()
    loaded = true
    const still = keep ?? pick
    if (still && (still.kind === 'example' || projects.some((project) => project.id === still.id))) pick = still
    else if (projects.length > 0) pick = { kind: 'project', id: projects.find((project) => project.id === last)?.id ?? projects[0].id }
    else pick = { kind: 'example', id: EXAMPLES[0].id }
    void workOutCosts()
  }

  // The estimated cost of each project and example, worked out one at a time after the list shows so the page
  // stays quick. A project's cost is kept against the time it was last edited.
  let costs = $state<Record<string, number>>({})
  const costKey = (id: string, updatedAt = 0) => `${id}:${updatedAt}`
  let costing = false

  async function workOutCosts() {
    if (costing) return
    costing = true
    try {
      const jobs = [
        ...projects.map((project) => ({ id: project.id, key: costKey(project.id, project.updatedAt), read: () => readProject(project.id) })),
        ...EXAMPLES.map((example) => ({ id: example.id, key: costKey(example.id), read: () => example.load() as Promise<Document | null> })),
      ]
      for (const job of jobs) {
        if (costs[job.key] !== undefined) continue
        const document = drawings[job.id] ?? (await job.read())
        if (!document) continue
        if (!drawings[job.id]) drawings = { ...drawings, [job.id]: document }
        let cost = 0
        try {
          cost = totalCost(takeoff(document))
        } catch {
          cost = Number.NaN
        }
        costs = { ...costs, [job.key]: cost }
        await new Promise((resolve) => setTimeout(resolve, 0))
      }
    } finally {
      costing = false
    }
  }

  const money = new Intl.NumberFormat('en-ZA', { maximumFractionDigits: 0 })
  function costText(key: string): string {
    const cost = costs[key]
    if (cost === undefined) return '…'
    return Number.isFinite(cost) && cost > 0 ? `R ${money.format(cost)}` : '–'
  }

  // Read the drawing of whatever is picked, once, for its thumbnail and figures.
  $effect(() => {
    const now = pick
    if (!now || drawings[now.id]) return
    const read = now.kind === 'project' ? readProject(now.id) : (EXAMPLES.find((example) => example.id === now.id)?.load() ?? Promise.resolve(null))
    void read.then((document) => {
      if (document) drawings = { ...drawings, [now.id]: document }
    })
  })

  onMount(() => {
    void session.close().then(() => refresh())
  })

  const updated = new Intl.DateTimeFormat('en-ZA', { dateStyle: 'medium', timeStyle: 'short' })
  const number = new Intl.NumberFormat('en-ZA', { maximumFractionDigits: 0 })

  function choose(next: Pick) {
    pick = next
    renaming = false
  }

  function open(next: Pick) {
    if (next.kind === 'project') void goto(sectionHref(next.id, 'plan'))
    else {
      const example = EXAMPLES.find((item) => item.id === next.id)
      if (example) void openExample(example)
    }
  }

  // Arrow keys walk the list, across your projects and the examples; Enter opens what is picked.
  function rowKey(event: KeyboardEvent, here: Pick) {
    if (event.key === 'Enter') {
      event.preventDefault()
      open(here)
      return
    }
    const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0
    if (step === 0 || !(event.currentTarget instanceof HTMLElement)) return
    event.preventDefault()
    const rows = [...(event.currentTarget.closest('[data-picker]')?.querySelectorAll<HTMLElement>('button[data-row]') ?? [])]
    rows[rows.indexOf(event.currentTarget) + step]?.focus()
  }

  function sortBy(by: 'name' | 'edited') {
    sort = sort.by === by ? { by, down: !sort.down } : { by, down: by === 'edited' }
  }

  function fold(key: string) {
    folded = folded.includes(key) ? folded.filter((item) => item !== key) : [...folded, key]
  }

  async function openExample(example: Example) {
    opening = example.id
    try {
      const document = structuredClone(drawings[example.id] ?? (await example.load()))
      const saved = await saveProject(null, example.name, document)
      if (saved.ok) await goto(sectionHref(saved.project.id, 'plan'))
      else problem = 'The example could not be saved.'
    } finally {
      opening = null
    }
  }

  async function duplicate(project: ProjectSummary) {
    const document = drawings[project.id] ?? (await readProject(project.id))
    if (!document) return
    const saved = await saveProject(null, `${project.name} copy`, structuredClone(document))
    await refresh(saved.ok ? { kind: 'project', id: saved.project.id } : undefined)
  }

  async function rename(project: ProjectSummary) {
    renaming = false
    const name = nameDraft.trim()
    const document = drawings[project.id] ?? (await readProject(project.id))
    if (!name || name === project.name || !document) return
    await saveProject(project.id, name, document)
    await refresh()
  }

  function download(project: ProjectSummary) {
    const document = drawings[project.id]
    if (!document) return
    const url = URL.createObjectURL(new Blob([JSON.stringify(document, null, 2)], { type: 'application/json' }))
    const link = window.document.createElement('a')
    link.href = url
    link.download = `${project.name.replace(/[^\w-]+/g, '-').toLowerCase()}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  async function remove(project: ProjectSummary) {
    if (!window.confirm(`Delete “${project.name}”? This cannot be undone.`)) return
    await deleteProject(project.id)
    await refresh()
  }

  async function importFile(event: Event) {
    const input = event.currentTarget
    if (!(input instanceof HTMLInputElement) || !input.files?.[0]) return
    const file = input.files[0]
    input.value = ''
    try {
      const parsed: unknown = JSON.parse(await file.text())
      if (!isDocument(parsed)) {
        problem = 'That file is not a floorplan project.'
        return
      }
      const saved = await saveProject(null, file.name.replace(/\.json$/i, ''), parsed as Document)
      if (saved.ok) await goto(sectionHref(saved.project.id, 'plan'))
    } catch {
      problem = 'That file could not be read.'
    }
  }
</script>

<svelte:head>
  <title>Projects · Floorplan</title>
</svelte:head>

{#snippet band(key: string, title: string, count: number)}
  {@const shut = folded.includes(key)}
  <h2 class="sticky top-0 z-10 border-b bg-muted text-[13px]">
    <button type="button" class="flex w-full items-center gap-2 px-3 py-1.5 text-left" aria-expanded={!shut} onclick={() => fold(key)}>
      {#if shut}<ChevronRight class="size-3.5 shrink-0" />{:else}<ChevronDown class="size-3.5 shrink-0" />{/if}
      <span class="font-semibold">{title}</span>
      <span class="text-xs text-muted-foreground">{count}</span>
    </button>
  </h2>
{/snippet}

{#snippet sorter(by: 'name' | 'edited', label: string)}
  <button type="button" class="flex items-center gap-1 hover:text-foreground" onclick={() => sortBy(by)}>
    {label}
    {#if sort.by === by}<ChevronDown class="size-3 {sort.down ? '' : 'rotate-180'}" />{/if}
  </button>
{/snippet}

<div class="flex h-dvh flex-col overflow-hidden bg-muted/40">
  <header class="flex flex-wrap items-center justify-between gap-2 border-b bg-background px-3 py-1.5">
    <div class="flex items-baseline gap-2">
      <h1 class="text-sm font-semibold">Floorplan</h1>
      <p class="text-sm text-muted-foreground max-md:hidden">House design, priced and checked as you draw.</p>
    </div>
    <div class="flex items-center gap-2">
      <Button variant="ghost" size="sm" onclick={() => (settingsOpen = true)}><Settings /><span class="max-sm:sr-only">Settings</span></Button>
      <Button variant="outline" size="sm" onclick={() => document.getElementById('project-file')?.click()}>
        <Upload /><span class="max-sm:sr-only">Open file</span>
      </Button>
      <Button size="sm" href={`${resolve('/app/new')}?step=site`}><Plus />New project</Button>
      <input id="project-file" class="hidden" type="file" accept=".json,application/json" onchange={importFile} />
    </div>
  </header>
  {#if problem}
    <p class="border-b border-destructive/30 bg-destructive/10 px-3 py-1.5 text-sm text-destructive" aria-live="polite">{problem}</p>
  {/if}
  <div class="flex min-h-0 flex-1 flex-col max-lg:overflow-auto lg:flex-row">
    <div class="min-h-0 flex-1 bg-background max-lg:flex-none lg:overflow-auto" data-picker>
      <div class="flex items-center gap-2 border-b px-3 py-1.5">
        <Search class="size-4 shrink-0 text-muted-foreground" />
        <input
          type="search"
          class="h-7 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          placeholder="Find a project or an example"
          aria-label="Find a project or an example"
          bind:value={filter}
        />
      </div>

      <section>
        {@render band('projects', 'Your projects', shown.length)}
        {#if !folded.includes('projects')}
          {#if loaded && projects.length === 0}
            <a
              class="flex items-center gap-2 border-b px-3 py-2 text-[13px] font-medium outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset"
              href={`${resolve('/app/new')}?step=site`}
            >
              <Plus class="size-3.5 shrink-0" />
              <span>Start your first project</span>
              <span class="font-normal text-muted-foreground max-sm:hidden">or open a copy of an example below</span>
            </a>
          {:else if loaded && shown.length === 0}
            <p class="border-b px-3 py-3 text-[13px] text-muted-foreground">No project is called that.</p>
          {:else if shown.length > 0}
            <table class="sheet still">
              <thead>
                <tr>
                  <th class="w-10 text-center">#</th>
                  <th class="text-left">{@render sorter('name', 'Name')}</th>
                  <th class="w-44 text-left max-sm:hidden">{@render sorter('edited', 'Edited')}</th>
                  <th class="w-32 text-right">Estimate</th>
                  <th class="w-20"></th>
                </tr>
              </thead>
              <tbody>
                {#each shown as project, index (project.id)}
                  {@const here = { kind: 'project', id: project.id } as const}
                  {@const picked = pick?.kind === 'project' && pick.id === project.id}
                  <tr class="pick" class:picked onclick={() => choose(here)} ondblclick={() => open(here)}>
                    <td class="rownum">{index + 1}</td>
                    <td class="p-0!">
                      <button
                        type="button"
                        data-row
                        class="block w-full truncate px-2 py-1 text-left font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset"
                        aria-pressed={picked}
                        onfocus={() => choose(here)}
                        onkeydown={(event) => rowKey(event, here)}
                      >
                        {project.name}
                      </button>
                    </td>
                    <td class="text-muted-foreground tabular-nums max-sm:hidden">{updated.format(project.updatedAt)}</td>
                    <td class="text-right whitespace-nowrap tabular-nums">{costText(costKey(project.id, project.updatedAt))}</td>
                    <td class="text-right">
                      <a class="font-medium underline-offset-2 hover:underline" href={sectionHref(project.id, 'plan')}>Open</a>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          {/if}
        {/if}
      </section>

      <section>
        {@render band('examples', 'Examples', shownExamples.length)}
        {#if !folded.includes('examples') && shownExamples.length > 0}
          <table class="sheet still">
            <thead>
              <tr>
                <th class="w-10 text-center">#</th>
                <th class="text-left">Name</th>
                <th class="w-80 text-left max-md:hidden">Place</th>
                <th class="w-32 text-right">Estimate</th>
                <th class="w-28"></th>
              </tr>
            </thead>
            <tbody>
              {#each shownExamples as example, index (example.id)}
                {@const here = { kind: 'example', id: example.id } as const}
                {@const picked = pick?.kind === 'example' && pick.id === example.id}
                <tr class="pick" class:picked onclick={() => choose(here)} ondblclick={() => open(here)}>
                  <td class="rownum">{index + 1}</td>
                  <td class="p-0!">
                    <button
                      type="button"
                      data-row
                      class="block w-full truncate px-2 py-1 text-left font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset"
                      aria-pressed={picked}
                      onfocus={() => choose(here)}
                      onkeydown={(event) => rowKey(event, here)}
                    >
                      {example.name}
                    </button>
                  </td>
                  <td class="text-muted-foreground max-md:hidden">{example.place}</td>
                  <td class="text-right whitespace-nowrap tabular-nums">{costText(costKey(example.id))}</td>
                  <td class="text-right whitespace-nowrap">
                    <a class="mr-3 text-muted-foreground underline-offset-2 hover:underline" href={exampleHref(example.id)} onclick={(event) => event.stopPropagation()}>Preview</a>
                    <button
                      type="button"
                      class="font-medium underline-offset-2 hover:underline disabled:opacity-50"
                      disabled={opening !== null}
                      onclick={(event) => {
                        event.stopPropagation()
                        void openExample(example)
                      }}
                    >
                      {opening === example.id ? 'Opening…' : 'Open a copy'}
                    </button>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        {/if}
      </section>
    </div>

    <aside class="grid shrink-0 content-start gap-3 border-t bg-muted/40 p-3 text-sm lg:w-[26rem] lg:overflow-auto lg:border-t-0 lg:border-l" aria-label="Preview">
      {#if pickedProject || pickedExample}
        <div class="aspect-[4/3] rounded-md border bg-background p-3">
          {#if drawing}
            <PlanThumbnail document={drawing} class="h-full w-full" />
          {/if}
        </div>
      {/if}
      {#if pickedProject}
        {@const project = pickedProject}
        <div>
          {#if renaming}
            <input
              class="h-7 w-full rounded-md border bg-background px-2 text-base font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              aria-label="Project name"
              bind:value={nameDraft}
              onblur={() => void rename(project)}
              onkeydown={(event) => {
                if (event.key === 'Enter') void rename(project)
                if (event.key === 'Escape') renaming = false
              }}
              {@attach (node) => node.focus()}
            />
          {:else}
            <h2 class="text-base font-semibold">{project.name}</h2>
          {/if}
          <p class="text-muted-foreground">Edited {updated.format(project.updatedAt)}</p>
        </div>
      {:else if pickedExample}
        <div>
          <h2 class="text-base font-semibold">{pickedExample.name}</h2>
          <p class="text-muted-foreground">{pickedExample.place} · An example by {pickedExample.author}</p>
        </div>
        <p>{pickedExample.description}</p>
      {/if}
      {#if facts && (pickedProject || pickedExample)}
        <table class="sheet still rounded-md border">
          <tbody>
            <tr>
              <td class="label">Plot</td>
              <td class="w-28 text-right font-medium tabular-nums">{number.format(facts.plotArea)} m²</td>
            </tr>
            <tr>
              <td class="label">Floor area</td>
              <td class="text-right font-medium tabular-nums">{facts.floorArea > 0 ? `${number.format(facts.floorArea)} m²` : '–'}</td>
            </tr>
            <tr>
              <td class="label">Storeys</td>
              <td class="text-right font-medium tabular-nums">{facts.storeys || '–'}</td>
            </tr>
            <tr>
              <td class="label">Estimate</td>
              <td class="text-right font-medium tabular-nums">{costText(pickedProject ? costKey(pickedProject.id, pickedProject.updatedAt) : costKey(pick?.id ?? ''))}</td>
            </tr>
            <tr>
              <td class="label">Named rooms</td>
              <td class="text-right font-medium tabular-nums">{facts.rooms || '–'}</td>
            </tr>
          </tbody>
        </table>
      {/if}
      {#if pickedProject}
        {@const project = pickedProject}
        <div class="flex flex-wrap gap-2">
          <Button size="sm" href={sectionHref(project.id, 'plan')}>Open</Button>
          <Button
            variant="outline"
            size="sm"
            onclick={() => {
              nameDraft = project.name
              renaming = true
            }}
          >
            Rename
          </Button>
          <Button variant="outline" size="sm" onclick={() => void duplicate(project)}>Duplicate</Button>
          <Button variant="outline" size="sm" disabled={!drawing} onclick={() => download(project)}>Download</Button>
          <Button variant="ghost" size="sm" class="text-destructive hover:text-destructive" onclick={() => void remove(project)}>Delete</Button>
        </div>
      {:else if pickedExample}
        {@const example = pickedExample}
        <ul class="flex flex-wrap gap-1.5">
          {#each example.highlights as highlight (highlight)}
            <li class="rounded-sm border bg-background px-1.5 py-0.5 text-xs text-muted-foreground">{highlight}</li>
          {/each}
        </ul>
        <div class="flex flex-wrap gap-2">
          <Button size="sm" disabled={opening !== null} onclick={() => void openExample(example)}>
            {opening === example.id ? 'Opening…' : 'Open a copy'}
          </Button>
          <Button size="sm" variant="outline" href={exampleHref(example.id)}>Preview</Button>
        </div>
      {/if}
      <p class="text-muted-foreground">Projects are saved in this browser as you work. Back them up from Settings.</p>
    </aside>
  </div>
</div>

<SettingsDialog bind:open={settingsOpen} onrestored={() => void refresh()} />

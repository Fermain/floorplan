<script lang="ts">
  import { goto } from '$app/navigation'
  import Ellipsis from '@lucide/svelte/icons/ellipsis'
  import Plus from '@lucide/svelte/icons/plus'
  import Upload from '@lucide/svelte/icons/upload'
  import { onMount } from 'svelte'
  import { Button } from '$lib/components/ui/button'
  import * as Card from '$lib/components/ui/card'
  import * as Dialog from '$lib/components/ui/dialog'
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu'
  import { Input } from '$lib/components/ui/input'
  import { Label } from '$lib/components/ui/label'
  import * as Select from '$lib/components/ui/select'
  import { WALL_SYSTEMS, DEFAULT_WALL_SYSTEM_ID } from '$lib/model/systems'
  import type { Document, WallSystemId } from '$lib/model/types'
  import { DEFAULT_SAMPLE_ID, documentFromSample, SAMPLE_PLOTS, samplePlot, type SamplePlotId } from '$lib/plot/samples'
  import { resolve } from '$app/paths'
  import { sectionHref } from '$lib/routes/links'
  import {
    deleteProject,
    isDocument,
    lastProjectId,
    listProjects,
    openProject,
    saveProject,
    type ProjectSummary,
  } from '$lib/state/projects'
  import { session } from '$lib/state/session.svelte'

  let projects = $state<ProjectSummary[]>([])
  let last = $state<string | null>(null)
  let loaded = $state(false)
  let creating = $state(false)
  let name = $state('')
  let system = $state<WallSystemId>(DEFAULT_WALL_SYSTEM_ID)
  let site = $state<SamplePlotId>(DEFAULT_SAMPLE_ID)
  let problem = $state('')

  async function refresh() {
    projects = await listProjects()
    last = await lastProjectId()
    loaded = true
  }

  onMount(() => {
    void session.close().then(refresh)
  })

  const recent = $derived(projects.find((project) => project.id === last) ?? null)

  const updated = new Intl.DateTimeFormat('en-ZA', { dateStyle: 'medium', timeStyle: 'short' })

  async function create(event: SubmitEvent) {
    event.preventDefault()
    const document = documentFromSample(site, system, {})
    const saved = await saveProject(null, name || 'Untitled house', document)
    if (!saved.ok) {
      problem = saved.reason
      return
    }
    creating = false
    await goto(sectionHref(saved.project.id, 'plan'))
  }

  async function duplicate(project: ProjectSummary) {
    const opened = await openProject(project.id)
    if (!opened.ok) return
    await saveProject(null, `${project.name} copy`, opened.document)
    await refresh()
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

<div class="min-h-screen bg-muted/40">
  <div class="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-10">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Floorplan</h1>
        <p class="text-sm text-muted-foreground">Brick-by-brick house design, priced and checked as you draw.</p>
      </div>
      <div class="flex gap-2">
        <Button variant="outline" onclick={() => document.getElementById('project-file')?.click()}>
          <Upload />
          Open file
        </Button>
        <Dialog.Root
          bind:open={creating}
          onOpenChange={(open) => {
            if (open) {
              name = ''
              problem = ''
            }
          }}
        >
          <Dialog.Trigger>
            {#snippet child({ props })}
              <Button {...props}><Plus />New project</Button>
            {/snippet}
          </Dialog.Trigger>
          {@render newProject()}
        </Dialog.Root>
        <input id="project-file" class="hidden" type="file" accept=".json,application/json" onchange={importFile} />
      </div>
    </div>

    {#if problem && !creating}
      <p class="text-sm text-destructive">{problem}</p>
    {/if}

    {#if recent}
      <Card.Root>
        <Card.Header>
          <Card.Description>Continue where you left off</Card.Description>
          <Card.Title class="text-xl">{recent.name}</Card.Title>
          <Card.Description>Edited {updated.format(recent.updatedAt)}</Card.Description>
        </Card.Header>
        <Card.Footer>
          <Button href={sectionHref(recent.id, 'plan')}>Open</Button>
        </Card.Footer>
      </Card.Root>
    {/if}

    <Card.Root>
      <Card.Header>
        <Card.Title>Projects</Card.Title>
        <Card.Description>Saved in this browser. Changes save as you work.</Card.Description>
      </Card.Header>
      <Card.Content class="p-0">
        {#if loaded && projects.length === 0}
          <p class="px-6 pb-6 text-sm text-muted-foreground">No projects yet. Start one with New project.</p>
        {/if}
        <ul class="divide-y">
          {#each projects as project (project.id)}
            <li class="flex items-center gap-3 px-6 py-3">
              <a class="min-w-0 flex-1" href={sectionHref(project.id, 'plan')}>
                <div class="truncate font-medium">{project.name}</div>
                <div class="text-xs text-muted-foreground">Edited {updated.format(project.updatedAt)}</div>
              </a>
              <Button variant="outline" size="sm" href={sectionHref(project.id, 'plan')}>Open</Button>
              <DropdownMenu.Root>
                <DropdownMenu.Trigger>
                  {#snippet child({ props })}
                    <Button {...props} variant="ghost" size="icon-sm" aria-label="More for {project.name}">
                      <Ellipsis />
                    </Button>
                  {/snippet}
                </DropdownMenu.Trigger>
                <DropdownMenu.Content align="end">
                  <DropdownMenu.Item onclick={() => void duplicate(project)}>Duplicate</DropdownMenu.Item>
                  <DropdownMenu.Separator />
                  <DropdownMenu.Item variant="destructive" onclick={() => void remove(project)}>Delete</DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Root>
            </li>
          {/each}
        </ul>
      </Card.Content>
    </Card.Root>
  </div>
</div>

{#snippet newProject()}
  <Dialog.Content class="sm:max-w-md">
    <form class="grid gap-4" onsubmit={create}>
      <Dialog.Header>
        <Dialog.Title>New project</Dialog.Title>
        <Dialog.Description>Sensible defaults for a small house. Change any of them later on the Project page.</Dialog.Description>
      </Dialog.Header>
      <div class="grid gap-1.5">
        <Label for="project-name">Name</Label>
        <Input id="project-name" placeholder="Untitled house" bind:value={name} autofocus />
      </div>
      <div class="grid gap-1.5">
        <Label>Plot</Label>
        <Select.Root type="single" bind:value={site}>
          <Select.Trigger class="w-full">{samplePlot(site).name}</Select.Trigger>
          <Select.Content>
            {#each SAMPLE_PLOTS as item (item.id)}
              <Select.Item value={item.id} label={item.name}>
                <div>
                  <div>{item.name}</div>
                  <div class="text-xs text-muted-foreground">{item.place}</div>
                </div>
              </Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
      </div>
      <div class="grid gap-1.5">
        <Label>Walls</Label>
        <Select.Root type="single" bind:value={system}>
          <Select.Trigger class="w-full">
            {WALL_SYSTEMS.find((item) => item.id === system)?.name}
          </Select.Trigger>
          <Select.Content>
            {#each WALL_SYSTEMS as item (item.id)}
              <Select.Item value={item.id}>{item.name}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
      </div>
      {#if problem}
        <p class="text-sm text-destructive">{problem}</p>
      {/if}
      <Dialog.Footer class="sm:justify-between">
        <Button type="button" variant="link" class="px-0" href={`${resolve('/new')}?step=site`}>
          Step through every option…
        </Button>
        <div class="flex gap-2">
          <Button type="button" variant="outline" onclick={() => (creating = false)}>Cancel</Button>
          <Button type="submit">Create</Button>
        </div>
      </Dialog.Footer>
    </form>
  </Dialog.Content>
{/snippet}

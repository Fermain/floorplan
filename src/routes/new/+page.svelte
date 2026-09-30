<script lang="ts">
  import { goto } from '$app/navigation'
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import ArrowLeft from '@lucide/svelte/icons/arrow-left'
  import Check from '@lucide/svelte/icons/check'
  import Upload from '@lucide/svelte/icons/upload'
  import OpeningFields from '$lib/components/project/OpeningFields.svelte'
  import PlotThumbnail from '$lib/components/project/PlotThumbnail.svelte'
  import RoofPicker from '$lib/components/project/RoofPicker.svelte'
  import SitePicker from '$lib/components/project/SitePicker.svelte'
  import WallPicker from '$lib/components/project/WallPicker.svelte'
  import WallSwatch from '$lib/components/project/WallSwatch.svelte'
  import { Button } from '$lib/components/ui/button'
  import * as Card from '$lib/components/ui/card'
  import { Input } from '$lib/components/ui/input'
  import { Label } from '$lib/components/ui/label'
  import { coveringOf } from '$lib/geometry/coverings'
  import { defaultsProblem } from '$lib/model/defaults'
  import { wallSystem } from '$lib/model/systems'
  import { loadHeightfield, loadPlot } from '$lib/plot/load'
  import { documentFromSite, levelGround, samplePlot } from '$lib/plot/samples'
  import { homeHref, sectionHref } from '$lib/routes/links'
  import { draft, draftDefaults, resetDraft } from '$lib/state/newProject.svelte'
  import { saveProject } from '$lib/state/projects'
  import { cn } from '$lib/utils'

  const STEPS = [
    { id: 'site', label: 'Site' },
    { id: 'walls', label: 'Walls' },
    { id: 'roof', label: 'Roof' },
    { id: 'openings', label: 'Openings' },
    { id: 'name', label: 'Name' },
  ] as const

  type StepId = (typeof STEPS)[number]['id']

  const step = $derived<StepId>(STEPS.find((item) => item.id === page.url.searchParams.get('step'))?.id ?? 'site')
  const index = $derived(STEPS.findIndex((item) => item.id === step))
  let problem = $state('')
  let creating = $state(false)

  const site = $derived(
    draft.site === 'custom' && draft.customPlot
      ? { plot: draft.customPlot, heightfield: draft.customHeightfield ?? levelGround(draft.customPlot.ring) }
      : samplePlot(draft.site === 'custom' ? undefined : draft.site),
  )
  const system = $derived(wallSystem(draft.systemId))
  const sampleId = {
    get value() {
      return draft.site === 'custom' ? samplePlot(undefined).id : draft.site
    },
    set value(next) {
      draft.site = next
    },
  }

  function go(next: StepId) {
    problem = ''
    void goto(`${resolve('/new')}?step=${next}`)
  }

  async function readFile(event: Event): Promise<string | undefined> {
    const input = event.currentTarget
    if (!(input instanceof HTMLInputElement) || !input.files?.[0]) return
    const text = await input.files[0].text()
    input.value = ''
    return text
  }

  async function importPlot(event: Event) {
    const text = await readFile(event)
    if (!text) return
    try {
      draft.customPlot = loadPlot(text)
      draft.customHeightfield = null
      draft.site = 'custom'
      problem = ''
    } catch (err) {
      problem = err instanceof Error ? err.message : 'Could not read the plot.'
    }
  }

  async function importHeights(event: Event) {
    const text = await readFile(event)
    if (!text) return
    try {
      draft.customHeightfield = loadHeightfield(text)
      problem = ''
    } catch (err) {
      problem = err instanceof Error ? err.message : 'Could not read the ground levels.'
    }
  }

  async function create() {
    const defaults = draftDefaults()
    const invalid = defaultsProblem(defaults)
    if (invalid) {
      problem = `Openings: ${invalid}.`
      return
    }
    creating = true
    const document = documentFromSite(site.plot, site.heightfield, draft.systemId, defaults)
    const saved = await saveProject(null, draft.name || 'Untitled house', document)
    creating = false
    if (!saved.ok) {
      problem = saved.reason
      return
    }
    resetDraft()
    await goto(sectionHref(saved.project.id, 'plan'))
  }

  const mm = (m: number) => Math.round(m * 1000)
</script>

<div class="flex min-h-screen flex-col bg-muted/40">
  <header class="flex items-center gap-3 border-b bg-background px-3 py-2">
    <Button variant="ghost" size="icon-sm" href={homeHref()} aria-label="All projects"><ArrowLeft /></Button>
    <span class="text-sm font-medium">New project</span>
    <ol class="mx-auto flex items-center gap-1 text-sm" aria-label="Steps">
      {#each STEPS as item, i (item.id)}
        <li>
          <button
            type="button"
            class={cn(
              'flex items-center gap-1.5 rounded-md px-2 py-1',
              item.id === step ? 'bg-muted font-medium' : 'text-muted-foreground hover:bg-muted/60',
            )}
            aria-current={item.id === step ? 'step' : undefined}
            onclick={() => go(item.id)}
          >
            <span
              class={cn(
                'flex size-5 items-center justify-center rounded-full border text-xs',
                i < index && 'border-primary bg-primary text-primary-foreground',
                i === index && 'border-primary',
              )}
            >
              {#if i < index}<Check class="size-3" />{:else}{i + 1}{/if}
            </span>
            {item.label}
          </button>
        </li>
      {/each}
    </ol>
    <span class="w-24"></span>
  </header>

  <main class="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-8">
    {#if step === 'site'}
      <div>
        <h1 class="text-xl font-semibold">Where are you building?</h1>
        <p class="text-sm text-muted-foreground">
          Pick a sample plot to start from, or bring your own boundary. In South Africa a north-facing slope catches the
          winter sun.
        </p>
      </div>
      <SitePicker bind:value={sampleId.value} />
      <Card.Root class={cn(draft.site === 'custom' && 'border-primary ring-2 ring-primary/20')}>
        <Card.Header>
          <Card.Title>Your own plot</Card.Title>
          <Card.Description>
            A boundary as GeoJSON or KML in metres, and optionally ground levels as a heightfield file. Without levels
            the ground is flat.
          </Card.Description>
        </Card.Header>
        <Card.Content class="flex flex-wrap items-center gap-3">
          <Button variant="outline" onclick={() => document.getElementById('new-plot')?.click()}>
            <Upload />Import boundary…
          </Button>
          <Button
            variant="outline"
            disabled={!draft.customPlot}
            onclick={() => document.getElementById('new-heights')?.click()}
          >
            <Upload />Import ground levels…
          </Button>
          {#if draft.customPlot}
            <PlotThumbnail
              class="h-20 w-28 rounded-md"
              plot={draft.customPlot}
              heightfield={draft.customHeightfield ?? levelGround(draft.customPlot.ring)}
            />
            <Button variant="ghost" size="sm" onclick={() => (draft.site = 'custom')}>Use this plot</Button>
          {/if}
          <input id="new-plot" class="hidden" type="file" accept=".geojson,.json,.kml" onchange={importPlot} />
          <input id="new-heights" class="hidden" type="file" accept=".json" onchange={importHeights} />
        </Card.Content>
      </Card.Root>
    {:else if step === 'walls'}
      <div>
        <h1 class="text-xl font-semibold">What will the walls be built from?</h1>
        <p class="text-sm text-muted-foreground">
          New walls start in this system. You can change any wall later in Focus. Costs are units only, at the example
          rates.
        </p>
      </div>
      <WallPicker bind:value={draft.systemId} />
    {:else if step === 'roof'}
      <div>
        <h1 class="text-xl font-semibold">What kind of roof?</h1>
        <p class="text-sm text-muted-foreground">Used whenever you add a roof. Each roof can still be changed.</p>
      </div>
      <RoofPicker
        bind:form={draft.roofForm}
        bind:covering={draft.roofCovering}
        bind:pitchDeg={draft.roofPitchDeg}
        bind:eaves={draft.roofEaves}
      />
    {:else if step === 'openings'}
      <div>
        <h1 class="text-xl font-semibold">Standard window and door sizes</h1>
        <p class="text-sm text-muted-foreground">New openings start at these sizes and share one sill and head line.</p>
      </div>
      <OpeningFields
        systemId={draft.systemId}
        bind:windowWidth={draft.windowWidth}
        bind:windowHeight={draft.windowHeight}
        bind:sill={draft.sill}
        bind:doorHeight={draft.doorHeight}
      />
    {:else}
      <div>
        <h1 class="text-xl font-semibold">Name your project</h1>
        <p class="text-sm text-muted-foreground">Everything below can be changed later on the Project page.</p>
      </div>
      <div class="grid max-w-md gap-1.5">
        <Label for="new-name">Name</Label>
        <Input
          id="new-name"
          placeholder="Untitled house"
          bind:value={draft.name}
          autofocus
          onkeydown={(event) => {
            if (event.key === 'Enter') void create()
          }}
        />
      </div>
      <div class="grid gap-4 md:grid-cols-3">
        <Card.Root>
          <Card.Header>
            <Card.Description>Site</Card.Description>
            <Card.Title>{draft.site === 'custom' ? 'Your own plot' : samplePlot(draft.site).name}</Card.Title>
          </Card.Header>
          <Card.Content>
            <PlotThumbnail class="aspect-[4/3] w-full rounded-md" plot={site.plot} heightfield={site.heightfield} />
          </Card.Content>
        </Card.Root>
        <Card.Root>
          <Card.Header>
            <Card.Description>Walls</Card.Description>
            <Card.Title>{system.name}</Card.Title>
          </Card.Header>
          <Card.Content>
            <WallSwatch class="w-full rounded-md" {system} />
          </Card.Content>
        </Card.Root>
        <Card.Root>
          <Card.Header>
            <Card.Description>Roof and openings</Card.Description>
            <Card.Title>
              {{ hip: 'Hip', gable: 'Gable', mono: 'Mono-pitch' }[draft.roofForm]}, {coveringOf({
                covering: draft.roofCovering,
              }).name.toLowerCase()}
            </Card.Title>
          </Card.Header>
          <Card.Content class="text-sm text-muted-foreground">
            {draft.roofPitchDeg}° pitch, {mm(draft.roofEaves)} mm eaves. Windows {mm(draft.windowWidth)} × {mm(
              draft.windowHeight,
            )} mm on a {mm(draft.sill)} mm sill; doors {mm(draft.doorHeight)} mm high.
          </Card.Content>
        </Card.Root>
      </div>
    {/if}
    {#if problem}
      <p class="text-sm text-destructive">{problem}</p>
    {/if}
  </main>

  <footer class="sticky bottom-0 flex items-center justify-between gap-3 border-t bg-background px-6 py-3">
    <Button variant="ghost" onclick={() => (index > 0 ? go(STEPS[index - 1].id) : void goto(homeHref()))}>
      {index > 0 ? 'Back' : 'Cancel'}
    </Button>
    <div class="flex gap-2">
      {#if index < STEPS.length - 1}
        <Button variant="outline" onclick={() => go('name')}>Skip to the end</Button>
        <Button onclick={() => go(STEPS[index + 1].id)}>Next</Button>
      {:else}
        <Button disabled={creating} onclick={() => void create()}>Create project</Button>
      {/if}
    </div>
  </footer>
</div>

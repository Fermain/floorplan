<script lang="ts">
  import ReviewScene from './ReviewScene.svelte'
  import Snowflake from '@lucide/svelte/icons/snowflake'
  import Sun from '@lucide/svelte/icons/sun'
  import Scan from '@lucide/svelte/icons/scan'
  import LoaderCircle from '@lucide/svelte/icons/loader-circle'
  import { view } from '../../lib/state/workspace.svelte'
  import { Toggle } from '$lib/components/ui/toggle'
  import { runLength, SERVICE_KINDS, serviceRuns } from '../../lib/geometry/serviceRuns'
  import { Separator } from '$lib/components/ui/separator'
  import * as ToggleGroup from '$lib/components/ui/toggle-group'
  import { documentStore } from '../../lib/state/document.svelte'
  import { summerSolstice, winterSolstice } from '../../lib/solar/sun'
  import type { CutShape } from './cutaway'

  const YEAR = 2026
  const SAST_OFFSET_HOURS = 2
  const UTC_MONTHS = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ]

  type SolsticeKind = 'summer' | 'winter'


  const latitude = $derived(documentStore.document.plot.latitude)

  function solsticeDate(kind: SolsticeKind): Date {
    return kind === 'summer'
      ? summerSolstice(YEAR, latitude)
      : winterSolstice(YEAR, latitude)
  }

  function solsticeLabel(kind: SolsticeKind): string {
    const date = solsticeDate(kind)
    const day = date.getUTCDate()
    const month = UTC_MONTHS[date.getUTCMonth()]
    return `${day} ${month} ${date.getUTCFullYear()} · ${kind}`
  }

  function dateAtHour(kind: SolsticeKind, h: number): Date {
    const base = solsticeDate(kind)
    const hourOfDay = Math.min(23, h)
    const minute = h >= 24 ? 59 : 0
    return new Date(
      Date.UTC(
        base.getUTCFullYear(),
        base.getUTCMonth(),
        base.getUTCDate(),
        hourOfDay - SAST_OFFSET_HOURS,
        minute,
        0,
      ),
    )
  }

  interface Props {
    hour?: number
    season?: SolsticeKind
    onSelectWall?: (wallId: string) => void
    onStatus?: (status: { text: string; error: boolean }) => void
  }

  let { hour = $bindable(12), season: solsticeKind = $bindable('summer'), onSelectWall, onStatus }: Props = $props()

  // Seeing inside: a cutaway that eats what is close in front of the camera, walls cut low or hidden, and the
  // storeys above one lifted off with the roof.
  const CUTAWAYS: { value: string; label: string; shape: CutShape; depth: number }[] = [
    { value: 'none', label: 'No cutaway', shape: 'box', depth: 0 },
    { value: 'box-near', label: 'Box cut', shape: 'box', depth: 8 },
    { value: 'box-deep', label: 'Deep box cut', shape: 'box', depth: 14 },
    { value: 'cone', label: 'Cone cut', shape: 'cone', depth: 8 },
  ]
  const chosenCut = $derived(CUTAWAYS.find((item) => item.value === view.cutaway) ?? CUTAWAYS[1])
  // Services: the building fades and the pipes and cables in it are drawn.
  const serviceLegend = $derived.by(() => {
    if (!view.xray) return []
    const runs = serviceRuns(documentStore.document)
    return SERVICE_KINDS.map((kind) => ({ ...kind, length: runs.filter((run) => run.kind === kind.id).reduce((sum, run) => sum + runLength(run), 0) })).filter((kind) => kind.length > 0)
  })
  const storeys = $derived(
    [...new Set(documentStore.document.building.floors.filter((floor) => floor.walls.length > 0).map((floor) => floor.index))].sort((a, b) => a - b),
  )
  // A storey that is no longer there falls back to the whole house.
  $effect(() => {
    if (view.upTo !== 'all' && !storeys.includes(Number(view.upTo))) view.upTo = 'all'
  })

  // Building the model holds the page up for a moment on a big project. The scene is started a beat after the
  // view opens, so that the notice saying so is on screen first, and the notice goes when the model is built.
  let started = $state(false)
  let built = $state(false)
  $effect(() => {
    const timer = setTimeout(() => (started = true), 40)
    return () => clearTimeout(timer)
  })

  const sunDate = $derived(dateAtHour(solsticeKind, hour))
  const summerLabel = $derived(solsticeLabel('summer'))
  const winterLabel = $derived(solsticeLabel('winter'))
  const activeLabel = $derived(solsticeKind === 'summer' ? summerLabel : winterLabel)

  $effect(() => {
    onStatus?.({ text: `${activeLabel}, ${String(hour).padStart(2, '0')}:00 SAST`, error: false })
    return () => onStatus?.({ text: '', error: false })
  })
</script>

<div class="root">
  <div class="flex flex-wrap items-center gap-x-3 gap-y-2 border-b bg-background px-3 py-1.5 text-sm">
    <ToggleGroup.Root
      type="single"
      variant="outline"
      size="sm"
      value={solsticeKind}
      onValueChange={(next) => {
        if (next) solsticeKind = next as SolsticeKind
      }}
      aria-label="Season"
    >
      <ToggleGroup.Item value="summer" aria-label="Summer solstice"><Sun />Summer</ToggleGroup.Item>
      <ToggleGroup.Item value="winter" aria-label="Winter solstice"><Snowflake />Winter</ToggleGroup.Item>
    </ToggleGroup.Root>
    <Separator orientation="vertical" class="hidden h-5 sm:block" />
    <label class="flex min-w-0 basis-full items-center gap-2 sm:basis-auto sm:flex-1">
      <span class="text-muted-foreground">Time</span>
      <input class="min-w-0 flex-1 accent-primary sm:max-w-48" type="range" min="0" max="24" step="1" bind:value={hour} />
      <span class="shrink-0 tabular-nums">{String(hour).padStart(2, '0')}:00 SAST</span>
    </label>
    <div class="flex flex-wrap items-center gap-2">
      <Toggle size="sm" variant="outline" bind:pressed={view.xray} aria-label="Show services" title="Fade the building to show the pipes and cables in it">
        <Scan />Services
      </Toggle>
    </div>
    {#if view.xray}
      <div class="flex basis-full flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
        {#each serviceLegend as kind (kind.id)}
          <span class="flex items-center gap-1.5">
            <span class="inline-block h-1 w-4 rounded-full" style:background={kind.colour}></span>
            {kind.name}
            <span class="text-muted-foreground tabular-nums">{Math.round(kind.length)} m</span>
          </span>
        {:else}
          <span class="text-muted-foreground">No services yet: place fittings on the plan and they are routed here.</span>
        {/each}
        <span class="text-muted-foreground">Indicative routes, not a drawing to build from.</span>
      </div>
    {/if}
  </div>
  <div class="viewport">
    {#if started}
      <ReviewScene onReady={() => (built = true)} {sunDate} {onSelectWall} cutDepth={chosenCut.depth} cutShape={chosenCut.shape} walls={view.walls} upTo={view.upTo === 'all' ? null : Number(view.upTo)} roofs={view.roofs} xray={view.xray} />
    {/if}
    {#if !built}
      <div class="building" role="status" aria-live="polite">
        <LoaderCircle class="size-5 animate-spin" />
        <span>Building the model…</span>
      </div>
    {/if}
  </div>
</div>

<style>
  .root {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
  }

  .viewport {
    position: relative;
    flex: 1;
    min-height: 0;
    width: 100%;
  }

  /* Over the scene while a big house is being put together, so the page is never just blank. */
  .building {
    position: absolute;
    inset: 0;
    z-index: 5;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.6rem;
    background: var(--muted);
    color: var(--muted-foreground);
    font-size: 0.875rem;
  }

  .viewport :global(canvas) {
    display: block;
    width: 100%;
    height: 100%;
  }
</style>

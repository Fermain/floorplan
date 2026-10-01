<script lang="ts">
  import ReviewScene from './ReviewScene.svelte'
  import Snowflake from '@lucide/svelte/icons/snowflake'
  import Sun from '@lucide/svelte/icons/sun'
  import { Separator } from '$lib/components/ui/separator'
  import * as ToggleGroup from '$lib/components/ui/toggle-group'
  import { documentStore } from '../../lib/state/document.svelte'
  import { summerSolstice, winterSolstice } from '../../lib/solar/sun'
  import * as Select from '$lib/components/ui/select'
  import type { CutShape, WallView } from './cutaway'

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
  const WALL_VIEWS: { value: WallView; label: string }[] = [
    { value: 'full', label: 'Full walls' },
    { value: 'half', label: 'Half walls' },
    { value: 'hidden', label: 'No walls' },
  ]
  let cutaway = $state('box-near')
  const chosenCut = $derived(CUTAWAYS.find((item) => item.value === cutaway) ?? CUTAWAYS[1])
  let walls = $state<WallView>('full')
  let upTo = $state('all')
  const storeys = $derived(
    [...new Set(documentStore.document.building.floors.filter((floor) => floor.walls.length > 0).map((floor) => floor.index))].sort((a, b) => a - b),
  )
  const storeyLabel = (index: number) => (index === 0 ? 'Ground floor' : `Up to storey ${index + 1}`)
  const upToLabel = $derived(upTo === 'all' ? 'Whole house' : storeyLabel(Number(upTo)))
  // A storey that is no longer there falls back to the whole house.
  $effect(() => {
    if (upTo !== 'all' && !storeys.includes(Number(upTo))) upTo = 'all'
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
      <Select.Root type="single" bind:value={cutaway}>
        <Select.Trigger size="sm" class="w-32" aria-label="Cutaway" title="Cut away what is close in front of the camera as you zoom in">
          {chosenCut.label}
        </Select.Trigger>
        <Select.Content>
          {#each CUTAWAYS as item (item.value)}
            <Select.Item value={item.value} label={item.label} />
          {/each}
        </Select.Content>
      </Select.Root>
      <Select.Root type="single" value={walls} onValueChange={(next) => next && (walls = next as WallView)}>
        <Select.Trigger size="sm" class="w-28" aria-label="Walls">{WALL_VIEWS.find((item) => item.value === walls)?.label}</Select.Trigger>
        <Select.Content>
          {#each WALL_VIEWS as item (item.value)}
            <Select.Item value={item.value} label={item.label} />
          {/each}
        </Select.Content>
      </Select.Root>
      {#if storeys.length > 1}
        <Select.Root type="single" bind:value={upTo}>
          <Select.Trigger size="sm" class="w-36" aria-label="Storeys shown">{upToLabel}</Select.Trigger>
          <Select.Content>
            <Select.Item value="all" label="Whole house" />
            {#each storeys as index (index)}
              <Select.Item value={String(index)} label={storeyLabel(index)} />
            {/each}
          </Select.Content>
        </Select.Root>
      {/if}
    </div>
  </div>
  <div class="viewport">
    <ReviewScene {sunDate} {onSelectWall} cutDepth={chosenCut.depth} cutShape={chosenCut.shape} {walls} upTo={upTo === 'all' ? null : Number(upTo)} />
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
    flex: 1;
    min-height: 0;
    width: 100%;
  }

  .viewport :global(canvas) {
    display: block;
    width: 100%;
    height: 100%;
  }
</style>

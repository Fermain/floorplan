<script lang="ts">
  import ReviewScene from './ReviewScene.svelte'
  import Snowflake from '@lucide/svelte/icons/snowflake'
  import Sun from '@lucide/svelte/icons/sun'
  import { Separator } from '$lib/components/ui/separator'
  import * as ToggleGroup from '$lib/components/ui/toggle-group'
  import { documentStore } from '../../lib/state/document.svelte'
  import { summerSolstice, winterSolstice } from '../../lib/solar/sun'

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
  <div class="flex flex-wrap items-center gap-3 border-b bg-background px-3 py-1.5 text-sm">
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
    <Separator orientation="vertical" class="h-5" />
    <label class="flex items-center gap-2">
      <span class="text-muted-foreground">Time</span>
      <input class="w-48 accent-primary" type="range" min="0" max="24" step="1" bind:value={hour} />
      <span class="whitespace-nowrap tabular-nums">{String(hour).padStart(2, '0')}:00 SAST</span>
    </label>
  </div>
  <div class="viewport">
    <ReviewScene {sunDate} {onSelectWall} />
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

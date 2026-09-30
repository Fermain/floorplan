<script lang="ts">
  import ReviewScene from './ReviewScene.svelte'
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
  <div class="bar">
    <label class="scrub">
      Hour (SAST)
      <input type="range" min="0" max="24" step="1" bind:value={hour} />
      <span class="hour">{hour}</span>
    </label>
    <button type="button" class:active={solsticeKind === 'summer'} onclick={() => (solsticeKind = 'summer')}>
      Summer
    </button>
    <button type="button" class:active={solsticeKind === 'winter'} onclick={() => (solsticeKind = 'winter')}>
      Winter
    </button>
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

  .bar {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.75rem 1rem;
    padding: 0.5rem 0.75rem;
    background: #fff;
    border-bottom: 1px solid #e4e4e7;
    font: 0.875rem system-ui, sans-serif;
    flex-shrink: 0;
  }

  .bar button {
    padding: 0.35rem 0.65rem;
    border: 1px solid #d4d4d8;
    border-radius: 4px;
    background: #fff;
    font: inherit;
    cursor: pointer;
  }

  .bar button.active {
    border-color: #2563eb;
    background: #eff6ff;
  }

  .scrub {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .hour {
    font-variant-numeric: tabular-nums;
    min-width: 1.5rem;
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

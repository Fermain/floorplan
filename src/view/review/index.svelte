<script lang="ts">
  import ReviewScene from './ReviewScene.svelte'
  import { documentStore } from '../../lib/state/document.svelte'
  import { summerSolstice, winterSolstice } from '../../lib/solar/sun'

  const YEAR = 2026
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

  let hour = $state(12)
  let solsticeKind = $state<SolsticeKind>('summer')

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
        hourOfDay,
        minute,
        0,
      ),
    )
  }

  interface Props {
    onSelectWall?: (wallId: string) => void
  }

  let { onSelectWall }: Props = $props()

  const sunDate = $derived(dateAtHour(solsticeKind, hour))
  const summerLabel = $derived(solsticeLabel('summer'))
  const winterLabel = $derived(solsticeLabel('winter'))
</script>

<div class="root">
  <div class="bar">
    <label class="scrub">
      Hour (UTC)
      <input type="range" min="0" max="24" step="1" bind:value={hour} />
      <span class="hour">{hour}</span>
    </label>
    <button type="button" onclick={() => (solsticeKind = 'summer')}>{summerLabel}</button>
    <button type="button" onclick={() => (solsticeKind = 'winter')}>{winterLabel}</button>
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
    gap: 1rem;
    padding: 0.75rem 1rem;
    font: 0.9375rem system-ui, sans-serif;
    border-bottom: 1px solid #ddd;
    flex-shrink: 0;
  }

  .bar button {
    font: inherit;
    padding: 0.35rem 0.75rem;
    cursor: pointer;
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

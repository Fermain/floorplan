<script lang="ts">
  import { goto } from '$app/navigation'
  import { page } from '$app/state'
  import { wallHref } from '$lib/routes/links'
  import { statusLine } from '$lib/state/status.svelte'
  import ReviewView from '$view/review/index.svelte'

  type Season = 'summer' | 'winter'

  const id = $derived(page.params.id ?? '')
  const urlSeason = $derived<Season>(page.url.searchParams.get('season') === 'winter' ? 'winter' : 'summer')
  const urlHour = $derived.by(() => {
    const value = Number(page.url.searchParams.get('hour') ?? 12)
    return Number.isFinite(value) ? Math.min(24, Math.max(0, Math.round(value))) : 12
  })

  let season = $derived(urlSeason)
  let hour = $derived(urlHour)

  $effect(() => {
    const nextSeason = season
    const nextHour = hour
    if (nextSeason === urlSeason && nextHour === urlHour) return
    const url = new URL(page.url)
    url.searchParams.set('season', nextSeason)
    url.searchParams.set('hour', String(nextHour))
    void goto(`${url.pathname}${url.search}`, { replaceState: true, keepFocus: true, noScroll: true })
  })
</script>

<ReviewView
  bind:season
  bind:hour
  onSelectWall={(wallId) => void goto(wallHref(id, wallId))}
  onStatus={(status) => statusLine.set(status)}
/>

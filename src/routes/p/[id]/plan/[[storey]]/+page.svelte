<script lang="ts">
  import { goto } from '$app/navigation'
  import { page } from '$app/state'
  import { planHref, wallHref } from '$lib/routes/links'
  import { statusLine } from '$lib/state/status.svelte'
  import PlanView from '$view/plan/index.svelte'

  const id = $derived(page.params.id ?? '')
  const urlStorey = $derived(Math.max(0, Number(page.params.storey ?? 0) || 0))
  const room = $derived(page.url.searchParams.get('room'))

  let storey = $derived(urlStorey)
  let selectedWallId = $state<string | null>(null)
  let activeFloorId = $state('')

  $effect(() => {
    const next = storey
    if (next === urlStorey) return
    void goto(planHref(id, next), { keepFocus: true, noScroll: true })
  })
</script>

<PlanView
  bind:storey
  bind:selectedWallId
  bind:activeFloorId
  focusSpace={room}
  viewKey={id}
  onStatus={(status) => statusLine.set(status)}
  onFocus={(wallId) => void goto(wallHref(id, wallId))}
/>

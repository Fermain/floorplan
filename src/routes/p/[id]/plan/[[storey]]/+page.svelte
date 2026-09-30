<script lang="ts">
  import { goto } from '$app/navigation'
  import { page } from '$app/state'
  import { planHref, wallHref } from '$lib/routes/links'
  import { documentStore } from '$lib/state/document.svelte'
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

  $effect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target
      if (target instanceof HTMLElement) {
        const tag = target.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) return
      }
      if (event.key !== 'Delete' && event.key !== 'Backspace') return
      const wallId = selectedWallId
      if (!wallId) return
      const floor = documentStore.document.building.floors.find((item) => item.walls.some((wall) => wall.id === wallId))
      if (!floor) return
      event.preventDefault()
      documentStore.removeWall(floor.id, wallId)
      selectedWallId = null
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
</script>

<PlanView
  bind:storey
  bind:selectedWallId
  bind:activeFloorId
  focusSpace={room}
  onStatus={(status) => statusLine.set(status)}
  onFocus={(wallId) => void goto(wallHref(id, wallId))}
/>

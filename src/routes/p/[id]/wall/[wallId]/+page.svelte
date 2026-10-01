<script lang="ts">
  import { goto } from '$app/navigation'
  import { page } from '$app/state'
  import { planHref } from '$lib/routes/links'
  import { documentStore } from '$lib/state/document.svelte'
  import { statusLine } from '$lib/state/status.svelte'
  import ElevationView from '$view/elevation/index.svelte'

  const id = $derived(page.params.id ?? '')
  const wallId = $derived(page.params.wallId ?? '')
  const floor = $derived(
    documentStore.document.building.floors.find((item) => item.walls.some((wall) => wall.id === wallId)),
  )

  let selectedOpeningId = $state<string | null>(null)

  $effect(() => {
    if (!floor) void goto(planHref(id), { replaceState: true })
  })

  $effect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target
      if (target instanceof HTMLElement) {
        const tag = target.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        void goto(planHref(id, floor?.index ?? 0))
        return
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && floor && selectedOpeningId) {
        event.preventDefault()
        documentStore.removeOpening(floor.id, wallId, selectedOpeningId)
        selectedOpeningId = null
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
</script>

{#if floor}
  <ElevationView
    {wallId}
    {selectedOpeningId}
    onSelectOpening={(openingId) => (selectedOpeningId = openingId)}
    onStatus={(status) => statusLine.set(status)}
    onExit={() => void goto(planHref(id, floor?.index ?? 0))}
  />
{/if}

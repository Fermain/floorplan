<script lang="ts">
  import { Button } from '$lib/components/ui/button'
  import { alterationTakeoff, totalCost } from '$lib/cost/quantities'
  import { alterations } from '$lib/geometry/alterations'
  import { documentStore } from '$lib/state/document.svelte'
  import InfoTip from './InfoTip.svelte'

  // The house as built, and what has been changed since: where a project is turned into an alteration and back.
  let { onmessage }: { onmessage?: (text: string | null) => void } = $props()

  const doc = $derived(documentStore.document)
  const changes = $derived(alterations(doc))
  const cost = $derived.by(() => {
    const lines = alterationTakeoff(doc)
    return lines ? totalCost(lines) : null
  })
  const metres = new Intl.NumberFormat('en-ZA', { maximumFractionDigits: 1 })
  const rand = new Intl.NumberFormat('en-ZA', { maximumFractionDigits: 0 })
  const day = new Intl.DateTimeFormat('en-ZA', { dateStyle: 'medium' })

  function run(result: { ok: boolean; reason?: string }) {
    onmessage?.(result.ok ? null : (result.reason ?? 'That could not be done.'))
  }

  const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
  const others = $derived.by(() => {
    if (!changes) return ''
    const names = { counters: ['counter', 'counters'], carports: ['carport', 'carports'], paving: ['paved area', 'paved areas'], retaining: ['retaining wall', 'retaining walls'] } as const
    const parts: string[] = []
    for (const key of ['counters', 'carports', 'paving', 'retaining'] as const) {
      if (changes.added[key] > 0) parts.push(`${count(changes.added[key], names[key][0], names[key][1])} added`)
      if (changes.removed[key] > 0) parts.push(`${count(changes.removed[key], names[key][0], names[key][1])} removed`)
    }
    return parts.join(', ')
  })
</script>

<section>
  <div class="flex items-center gap-1.5 border-b bg-muted px-3 py-1.5 text-[13px]">
    <h2 class="font-semibold">Alterations</h2>
    <InfoTip label="About alterations">
      Draw the house as it stands and mark it as built. What you change after that is shown against it on the plan,
      and Quantities prices only the difference and the breaking out, not the whole house.
    </InfoTip>
  </div>
  {#if changes && doc.baseline}
    <table class="sheet still">
      <tbody>
        <tr>
          <td class="label w-44 sm:w-56">Marked as built</td>
          <td class="font-medium">{day.format(doc.baseline.at)}</td>
        </tr>
        <tr>
          <td class="label">Walls</td>
          <td>
            {#if changes.builtLength + changes.demolishedLength < 0.05}
              As built
            {:else}
              {metres.format(changes.builtLength)} m built, {metres.format(changes.demolishedLength)} m taken down, {metres.format(changes.kept)} m kept
            {/if}
          </td>
        </tr>
        <tr>
          <td class="label">Openings</td>
          <td>{changes.cut.length + changes.closed.length === 0 ? 'As built' : `${changes.cut.length} cut into standing walls, ${changes.closed.length} closed up`}</td>
        </tr>
        <tr>
          <td class="label">Fittings</td>
          <td>
            {changes.fittingsAdded.length + changes.fittingsRemoved.length + changes.fittingsMoved.length === 0
              ? 'As built'
              : `${changes.fittingsAdded.length} put in, ${changes.fittingsRemoved.length} taken out, ${changes.fittingsMoved.length} moved`}
          </td>
        </tr>
        {#if others}
          <tr>
            <td class="label">Outside and joinery</td>
            <td>{others}</td>
          </tr>
        {/if}
        <tr>
          <td class="label">Estimate for the alterations</td>
          <td class="font-medium tabular-nums">{cost === null || !changes.any ? 'Nothing changed yet' : `R ${rand.format(cost)}`}</td>
        </tr>
      </tbody>
    </table>
    <div class="flex flex-wrap gap-2 border-b p-3">
      <Button
        variant="outline"
        size="sm"
        disabled={!changes.any}
        onclick={() => window.confirm('Take the house as it is drawn now as the house as built? The changes so far will no longer show as changes.') && run(documentStore.markAsBuilt(Date.now()))}
      >
        Mark as built again, as it is now
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={!changes.any}
        onclick={() => window.confirm('Put the drawing back to the house as built? Undo brings the changes back.') && run(documentStore.revertToBuilt())}
      >
        Put the drawing back
      </Button>
      <Button variant="ghost" size="sm" class="text-muted-foreground" onclick={() => window.confirm('Stop comparing with the house as built? The project is priced as a whole house again.') && run(documentStore.clearBaseline())}>
        Stop comparing
      </Button>
    </div>
  {:else}
    <div class="flex flex-wrap items-center justify-between gap-3 border-b p-3 text-sm">
      <p class="text-muted-foreground">This project is priced as a new house.</p>
      <Button variant="outline" size="sm" onclick={() => run(documentStore.markAsBuilt(Date.now()))}>Mark the house as built</Button>
    </div>
  {/if}
</section>

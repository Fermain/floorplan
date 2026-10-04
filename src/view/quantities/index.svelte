<script lang="ts">
  import { GROUP_ORDER, quantitiesCsv, takeoff, totalCost, type QuantityLine } from '../../lib/cost/quantities'
  import { assumptionsOf, rateIsDefault } from '../../lib/cost/rates'
  import type { CostAssumptions } from '../../lib/model/types'
  import { documentStore } from '../../lib/state/document.svelte'
  import ChevronDown from '@lucide/svelte/icons/chevron-down'
  import ChevronRight from '@lucide/svelte/icons/chevron-right'
  import Download from '@lucide/svelte/icons/download'
  import RotateCcw from '@lucide/svelte/icons/rotate-ccw'
  import { Button } from '$lib/components/ui/button'

  const doc = $derived(documentStore.document)
  const lines = $derived(takeoff(doc))
  const total = $derived(totalCost(lines))
  const assumptions = $derived(assumptionsOf(doc.costing))

  // Groups folded away, by name; only their subtotal row shows.
  let folded = $state<string[]>([])

  const groups = $derived(
    GROUP_ORDER.map((group) => ({ group, lines: lines.filter((line) => line.group === group) })).filter(
      (entry) => entry.lines.length > 0,
    ),
  )

  const money = new Intl.NumberFormat('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const count = new Intl.NumberFormat('en-ZA', { maximumFractionDigits: 2 })

  const assumptionFields: { key: keyof CostAssumptions; label: string; unit: string; step: number }[] = [
    { key: 'wastePct', label: 'Waste', unit: '%', step: 1 },
    { key: 'mortarAllowancePct', label: 'Mortar over the joints', unit: '%', step: 5 },
    { key: 'cementBagsPerM3', label: 'Cement per m³ of mortar', unit: 'bags', step: 0.5 },
    { key: 'sandM3PerM3', label: 'Sand per m³ of mortar', unit: 'm³', step: 0.05 },
    { key: 'footingWidth', label: 'Footing width', unit: 'm', step: 0.05 },
    { key: 'footingDepth', label: 'Footing depth', unit: 'm', step: 0.05 },
  ]

  function groupTotal(items: QuantityLine[]): number {
    return items.reduce((sum, line) => sum + line.amount, 0)
  }

  function fold(group: string) {
    folded = folded.includes(group) ? folded.filter((item) => item !== group) : [...folded, group]
  }

  function commitRate(key: string, raw: string) {
    const trimmed = raw.trim()
    const value = Number(trimmed.replace(',', '.'))
    if (trimmed !== '' && !(Number.isFinite(value) && value >= 0)) return
    documentStore.setRate(key, trimmed === '' ? null : value)
  }

  function commitAssumption(key: keyof CostAssumptions, raw: string) {
    const value = Number(raw)
    if (raw.trim() === '' || !Number.isFinite(value)) return
    documentStore.setAssumption(key, value)
  }

  // Sheet keys in an editable cell: Enter and the down arrow go to the cell below, the up arrow to the one above,
  // and Esc puts back what was there.
  function cellKey(event: KeyboardEvent, restore: number) {
    const input = event.currentTarget
    if (!(input instanceof HTMLInputElement)) return
    if (event.key === 'Escape') {
      input.value = String(restore)
      input.blur()
      return
    }
    const step = event.key === 'Enter' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0
    if (step === 0) return
    event.preventDefault()
    const cells = [...(input.closest('[data-sheet]')?.querySelectorAll<HTMLInputElement>('input[data-cell]') ?? [])]
    const next = cells[cells.indexOf(input) + step]
    if (next) {
      next.focus()
      next.select()
    } else input.blur()
  }

  function downloadCsv() {
    const url = URL.createObjectURL(new Blob([quantitiesCsv(lines)], { type: 'text/csv' }))
    const link = window.document.createElement('a')
    link.href = url
    link.download = 'quantities.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  const edited = $derived(lines.filter((line) => !rateIsDefault(doc.costing, line.rateKey)).length)
</script>

<div class="flex h-full flex-col">
  <div class="flex flex-wrap items-center justify-between gap-2 border-b bg-background px-3 py-1.5 text-sm">
    <p>
      <span class="text-muted-foreground">Estimated total</span>
      <span class="ml-1 text-base font-semibold tabular-nums">R {money.format(total)}</span>
      {#if edited > 0}
        <span class="ml-2 text-muted-foreground">{edited} {edited === 1 ? 'rate' : 'rates'} of your own</span>
      {/if}
    </p>
    <Button variant="outline" size="sm" onclick={downloadCsv} disabled={lines.length === 0}>
      <Download />Download CSV
    </Button>
  </div>
  <div class="flex min-h-0 flex-1 flex-col max-lg:overflow-auto lg:flex-row">
    <div class="min-h-0 flex-1 bg-background max-lg:flex-none lg:overflow-auto" data-sheet>
      {#if lines.length === 0}
        <p class="p-4 text-sm text-muted-foreground">Draw some walls and the quantities appear here.</p>
      {:else}
        <table class="sheet">
          <thead>
            <tr>
              <th class="w-10 text-center">#</th>
              <th class="min-w-48 text-left">Item</th>
              <th class="min-w-64 text-left max-md:hidden">How it is measured</th>
              <th class="w-24 text-right">Quantity</th>
              <th class="w-14 text-left">Unit</th>
              <th class="w-32 text-right">Rate (R)</th>
              <th class="w-32 text-right">Amount (R)</th>
            </tr>
          </thead>
          {#each groups as entry (entry.group)}
            {@const shut = folded.includes(entry.group)}
            <tbody>
              <tr class="group-row">
                <td class="text-center">
                  <button
                    type="button"
                    class="grid size-full place-items-center"
                    aria-expanded={!shut}
                    aria-label="{shut ? 'Show' : 'Hide'} {entry.group}"
                    onclick={() => fold(entry.group)}
                  >
                    {#if shut}<ChevronRight class="size-3.5" />{:else}<ChevronDown class="size-3.5" />{/if}
                  </button>
                </td>
                <td colspan="2" class="max-md:hidden">{entry.group} <span class="count">{entry.lines.length}</span></td>
                <td class="md:hidden">{entry.group} <span class="count">{entry.lines.length}</span></td>
                <td colspan="3"></td>
                <td class="text-right tabular-nums">{money.format(groupTotal(entry.lines))}</td>
              </tr>
              {#if !shut}
                {#each entry.lines as line (line.id)}
                  {@const own = !rateIsDefault(doc.costing, line.rateKey)}
                  <tr>
                    <td class="rownum">{lines.indexOf(line) + 1}</td>
                    <td>
                      {line.label}
                      <div class="text-xs text-muted-foreground md:hidden">{line.note}</div>
                    </td>
                    <td class="text-muted-foreground max-md:hidden">{line.note}</td>
                    <td class="text-right tabular-nums">{count.format(line.quantity)}</td>
                    <td class="text-muted-foreground">{line.unit}</td>
                    <td class="cell" class:own>
                      <input
                        data-cell
                        type="text"
                        inputmode="decimal"
                        value={line.rate}
                        aria-label="Rate for {line.label}"
                        title={own ? 'Your rate. Clear the cell to go back to the example.' : 'An example rate. Type your own.'}
                        onfocus={(event) => event.currentTarget.select()}
                        onkeydown={(event) => cellKey(event, line.rate)}
                        onchange={(event) => commitRate(line.rateKey, event.currentTarget.value)}
                      />
                      {#if own}
                        <button type="button" class="reset" title="Back to the example rate" aria-label="Reset the rate for {line.label}" onclick={() => documentStore.setRate(line.rateKey, null)}>
                          <RotateCcw class="size-3" />
                        </button>
                      {/if}
                    </td>
                    <td class="text-right tabular-nums">{money.format(line.amount)}</td>
                  </tr>
                {/each}
              {/if}
            </tbody>
          {/each}
          <tfoot>
            <tr>
              <td></td>
              <td>Estimated total</td>
              <td class="max-md:hidden"></td>
              <td colspan="3"></td>
              <td class="text-right tabular-nums">{money.format(total)}</td>
            </tr>
          </tfoot>
        </table>
      {/if}
    </div>
    <aside class="grid shrink-0 content-start gap-3 border-t bg-muted/40 p-3 text-sm lg:w-72 lg:overflow-auto lg:border-t-0 lg:border-l" data-sheet>
      <div>
        <h2 class="font-semibold">Assumptions</h2>
        <p class="text-muted-foreground">These shape the quantities.</p>
      </div>
      <table class="sheet rounded-md border">
        <tbody>
          {#each assumptionFields as field (field.key)}
            <tr>
              <td><label for="assumption-{field.key}">{field.label}</label></td>
              <td class="cell w-20">
                <input
                  data-cell
                  id="assumption-{field.key}"
                  type="number"
                  min="0"
                  step={field.step}
                  value={assumptions[field.key]}
                  onkeydown={(event) => event.key === 'Enter' && cellKey(event, assumptions[field.key])}
                  onchange={(event) => commitAssumption(field.key, event.currentTarget.value)}
                />
              </td>
              <td class="w-12 text-muted-foreground">{field.unit}</td>
            </tr>
          {/each}
        </tbody>
      </table>
      <p class="text-muted-foreground">
        White cells take your figures; the rest is worked out from the drawing. Rates in grey are rough examples, not
        quotes: type your supplier's price over one, or clear the cell to return to the example. Enter and the arrow keys
        move down and up the column.
      </p>
      <p class="text-muted-foreground">
        Foundations below the footing and reinforcement are not measured yet.
      </p>
    </aside>
  </div>
</div>

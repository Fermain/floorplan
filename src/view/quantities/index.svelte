<script lang="ts">
  import { GROUP_ORDER, quantitiesCsv, takeoff, totalCost, type QuantityLine } from '../../lib/cost/quantities'
  import { assumptionsOf, rateIsDefault } from '../../lib/cost/rates'
  import type { CostAssumptions } from '../../lib/model/types'
  import { documentStore } from '../../lib/state/document.svelte'
  import Download from '@lucide/svelte/icons/download'
  import { Button } from '$lib/components/ui/button'
  import * as Card from '$lib/components/ui/card'
  import { Input } from '$lib/components/ui/input'
  import { Label } from '$lib/components/ui/label'
  import * as Table from '$lib/components/ui/table'

  const doc = $derived(documentStore.document)
  const lines = $derived(takeoff(doc))
  const total = $derived(totalCost(lines))
  const assumptions = $derived(assumptionsOf(doc.costing))

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

  function commitRate(key: string, raw: string) {
    const trimmed = raw.trim()
    documentStore.setRate(key, trimmed === '' ? null : Number(trimmed))
  }

  function commitAssumption(key: keyof CostAssumptions, raw: string) {
    const value = Number(raw)
    if (raw.trim() === '' || !Number.isFinite(value)) return
    documentStore.setAssumption(key, value)
  }

  function downloadCsv() {
    const url = URL.createObjectURL(new Blob([quantitiesCsv(lines)], { type: 'text/csv' }))
    const link = window.document.createElement('a')
    link.href = url
    link.download = 'quantities.csv'
    link.click()
    URL.revokeObjectURL(url)
  }
</script>

<div class="flex h-full flex-col">
  <div class="flex items-center justify-between gap-3 border-b bg-background px-3 py-1.5 text-sm">
    <p>
      <span class="text-muted-foreground">Estimated total</span>
      <span class="ml-1 text-base font-semibold tabular-nums">R {money.format(total)}</span>
    </p>
    <Button variant="outline" size="sm" onclick={downloadCsv} disabled={lines.length === 0}>
      <Download />Download CSV
    </Button>
  </div>
  <div class="min-h-0 flex-1 overflow-auto">
    <div class="mx-auto flex max-w-5xl flex-col gap-4 p-6">
      {#if lines.length === 0}
        <p class="text-sm text-muted-foreground">Draw some walls and the quantities appear here.</p>
      {:else}
        <Card.Root>
          <Card.Content class="p-0">
            <Table.Root>
              <Table.Header>
                <Table.Row>
                  <Table.Head class="pl-4">Item</Table.Head>
                  <Table.Head class="text-right">Quantity</Table.Head>
                  <Table.Head>Unit</Table.Head>
                  <Table.Head class="text-right">Rate (R)</Table.Head>
                  <Table.Head class="pr-4 text-right">Amount (R)</Table.Head>
                </Table.Row>
              </Table.Header>
              {#each groups as entry (entry.group)}
                <Table.Body>
                  <Table.Row class="bg-muted/50 hover:bg-muted/50">
                    <Table.Cell colspan={4} class="pl-4 font-semibold">{entry.group}</Table.Cell>
                    <Table.Cell class="pr-4 text-right font-semibold tabular-nums">
                      {money.format(groupTotal(entry.lines))}
                    </Table.Cell>
                  </Table.Row>
                  {#each entry.lines as line (line.id)}
                    <Table.Row>
                      <Table.Cell class="pl-4 whitespace-normal">
                        <div>{line.label}</div>
                        <div class="text-xs text-muted-foreground">{line.note}</div>
                      </Table.Cell>
                      <Table.Cell class="text-right tabular-nums">{count.format(line.quantity)}</Table.Cell>
                      <Table.Cell class="text-muted-foreground">{line.unit}</Table.Cell>
                      <Table.Cell class="text-right">
                        <Input
                          type="number"
                          min="0"
                          step="any"
                          class="ml-auto h-7 w-28 text-right tabular-nums {rateIsDefault(doc.costing, line.rateKey)
                            ? 'text-muted-foreground'
                            : ''}"
                          value={line.rate}
                          aria-label={`Rate for ${line.label}`}
                          onchange={(event) => commitRate(line.rateKey, event.currentTarget.value)}
                        />
                      </Table.Cell>
                      <Table.Cell class="pr-4 text-right tabular-nums">{money.format(line.amount)}</Table.Cell>
                    </Table.Row>
                  {/each}
                </Table.Body>
              {/each}
            </Table.Root>
          </Card.Content>
        </Card.Root>
        <p class="text-sm text-muted-foreground">
          Rates in grey are rough examples, not quotes. Type your supplier's price to replace one, or clear a field to
          return to the example. Quantities come from the drawn walls, openings, slabs and roofs; foundations below the
          footing, reinforcement, plaster, finishes and labour are not included yet.
        </p>
      {/if}
      <Card.Root>
        <Card.Header>
          <Card.Title>Assumptions</Card.Title>
          <Card.Description>These shape the quantities above.</Card.Description>
        </Card.Header>
        <Card.Content class="grid gap-4 sm:grid-cols-3">
          {#each assumptionFields as field (field.key)}
            <div class="grid gap-1.5">
              <Label for={`assumption-${field.key}`}>{field.label} ({field.unit})</Label>
              <Input
                id={`assumption-${field.key}`}
                type="number"
                min="0"
                step={field.step}
                value={assumptions[field.key]}
                onchange={(event) => commitAssumption(field.key, event.currentTarget.value)}
              />
            </div>
          {/each}
        </Card.Content>
      </Card.Root>
    </div>
  </div>
</div>

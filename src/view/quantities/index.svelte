<script lang="ts">
  import { GROUP_ORDER, quantitiesCsv, takeoff, totalCost, type QuantityLine } from '../../lib/cost/quantities'
  import { assumptionsOf, rateIsDefault } from '../../lib/cost/rates'
  import type { CostAssumptions } from '../../lib/model/types'
  import { documentStore } from '../../lib/state/document.svelte'

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

<div class="root">
  <div class="bar">
    <p class="total">Estimated total <strong>R {money.format(total)}</strong></p>
    <button type="button" onclick={downloadCsv} disabled={lines.length === 0}>Download CSV</button>
  </div>
  <div class="page">
    {#if lines.length === 0}
      <p class="empty">Draw some walls and the quantities appear here.</p>
    {:else}
      <table>
        <thead>
          <tr>
            <th class="item">Item</th>
            <th class="num">Quantity</th>
            <th>Unit</th>
            <th class="num">Rate (R)</th>
            <th class="num">Amount (R)</th>
          </tr>
        </thead>
        {#each groups as entry (entry.group)}
          <tbody>
            <tr class="group">
              <th colspan="4">{entry.group}</th>
              <td class="num">{money.format(groupTotal(entry.lines))}</td>
            </tr>
            {#each entry.lines as line (line.id)}
              <tr>
                <td class="item">
                  {line.label}
                  <span class="note">{line.note}</span>
                </td>
                <td class="num">{count.format(line.quantity)}</td>
                <td>{line.unit}</td>
                <td class="num">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    class:default={rateIsDefault(doc.costing, line.rateKey)}
                    value={line.rate}
                    aria-label={`Rate for ${line.label}`}
                    onchange={(event) => commitRate(line.rateKey, event.currentTarget.value)}
                  />
                </td>
                <td class="num">{money.format(line.amount)}</td>
              </tr>
            {/each}
          </tbody>
        {/each}
      </table>
      <p class="caveat">
        Rates in grey are rough examples, not quotes. Type your supplier's price to replace one, or clear a field to
        return to the example. Quantities come from the drawn walls, openings, slabs and roofs; foundations below the
        footing, reinforcement, plaster, finishes and labour are not included yet.
      </p>
    {/if}
    <section class="assumptions">
      <h2>Assumptions</h2>
      <div class="fields">
        {#each assumptionFields as field (field.key)}
          <label>
            <span>{field.label}</span>
            <input
              type="number"
              min="0"
              step={field.step}
              value={assumptions[field.key]}
              onchange={(event) => commitAssumption(field.key, event.currentTarget.value)}
            />
            <span class="unit">{field.unit}</span>
          </label>
        {/each}
      </div>
    </section>
  </div>
</div>

<style>
  .root {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    font: 0.875rem system-ui, sans-serif;
  }

  .bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.5rem 0.75rem;
    background: #fff;
    border-bottom: 1px solid #e4e4e7;
    flex-shrink: 0;
  }

  .total {
    margin: 0;
  }

  button {
    padding: 0.35rem 0.65rem;
    border: 1px solid #d4d4d8;
    border-radius: 4px;
    background: #fff;
    font: inherit;
    cursor: pointer;
  }

  button:disabled {
    cursor: default;
    opacity: 0.45;
  }

  .page {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 1rem 0.75rem 2rem;
  }

  .empty {
    color: #52525b;
  }

  table {
    width: 100%;
    max-width: 60rem;
    border-collapse: collapse;
    background: #fff;
    border: 1px solid #e4e4e7;
  }

  th,
  td {
    padding: 0.4rem 0.6rem;
    border-bottom: 1px solid #f0f0f1;
    text-align: left;
    vertical-align: top;
  }

  thead th {
    font-weight: 600;
    color: #52525b;
    border-bottom: 1px solid #e4e4e7;
  }

  tr.group th,
  tr.group td {
    background: #fafafa;
    font-weight: 600;
  }

  .num {
    text-align: right;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .note {
    display: block;
    color: #71717a;
    font-size: 0.8125rem;
  }

  input {
    width: 6.5rem;
    padding: 0.2rem 0.35rem;
    border: 1px solid #d4d4d8;
    border-radius: 3px;
    font: inherit;
    text-align: right;
  }

  input.default {
    color: #a1a1aa;
  }

  .caveat {
    max-width: 60rem;
    color: #52525b;
    line-height: 1.45;
  }

  .assumptions {
    max-width: 60rem;
    margin-top: 1.5rem;
  }

  h2 {
    margin: 0 0 0.5rem;
    font-size: 0.9375rem;
  }

  .fields {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 1.25rem;
  }

  .fields label {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .fields input {
    width: 4.5rem;
  }

  .unit {
    color: #71717a;
  }
</style>

<script lang="ts">
  import { Label } from '$lib/components/ui/label'
  import * as Select from '$lib/components/ui/select'
  import { PAVING, PAVING_LIST } from '$lib/geometry/paving'
  import type { PavingSurface } from '$lib/model/types'
  import SwatchPicker from './SwatchPicker.svelte'
  import { pavingSwatch } from './swatches'

  // The apron laid round the outside of the house: how wide, and what of.
  let { width = $bindable(), surface = $bindable() }: { width: number; surface: PavingSurface } = $props()

  const WIDTHS = [
    { value: 0, label: 'No apron' },
    { value: 0.6, label: '600 mm' },
    { value: 1, label: '1000 mm' },
    { value: 1.5, label: '1500 mm' },
  ]
  const widthLabel = $derived(WIDTHS.find((item) => Math.abs(item.value - width) < 1e-6)?.label ?? `${Math.round(width * 1000)} mm`)
</script>

<div class="grid gap-3 sm:grid-cols-2">
  <div class="grid gap-1.5">
    <Label for="apron-width-choice">Width</Label>
    <Select.Root type="single" value={String(width)} onValueChange={(next) => next !== undefined && (width = Number(next))}>
      <Select.Trigger id="apron-width-choice" class="w-full">{widthLabel}</Select.Trigger>
      <Select.Content>
        {#each WIDTHS as item (item.value)}
          <Select.Item value={String(item.value)} label={item.label} />
        {/each}
      </Select.Content>
    </Select.Root>
  </div>
  <div class="grid gap-1.5">
    <div class="flex items-baseline justify-between gap-2">
      <Label>Surface</Label>
      <span class="text-sm text-muted-foreground">{width === 0 ? 'None' : PAVING[surface].name}</span>
    </div>
    <SwatchPicker
      label="Apron surface"
      options={PAVING_LIST.map((spec) => ({ id: spec.id, name: spec.name, swatch: pavingSwatch(spec.id) }))}
      value={width === 0 ? null : surface}
      onchange={(next) => (surface = next)}
      disabled={width === 0}
      compact
    />
  </div>
  <p class="text-sm text-muted-foreground sm:col-span-2">
    A strip along every outside wall, sloping away to carry rain clear of the foundations. Draw driveways, paths and
    patios with the Paving tool on the plan.
  </p>
</div>

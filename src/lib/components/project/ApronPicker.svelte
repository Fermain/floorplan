<script lang="ts">
  import { Label } from '$lib/components/ui/label'
  import * as Select from '$lib/components/ui/select'
  import { PAVING, PAVING_LIST } from '$lib/geometry/paving'
  import type { PavingSurface } from '$lib/model/types'

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
    <Label for="apron-surface-choice">Surface</Label>
    <Select.Root type="single" value={surface} onValueChange={(next) => next && (surface = next as PavingSurface)} disabled={width === 0}>
      <Select.Trigger id="apron-surface-choice" class="w-full">{PAVING[surface].name}</Select.Trigger>
      <Select.Content>
        {#each PAVING_LIST as spec (spec.id)}
          <Select.Item value={spec.id} label={spec.name} />
        {/each}
      </Select.Content>
    </Select.Root>
  </div>
  <p class="text-sm text-muted-foreground sm:col-span-2">
    A strip along every outside wall, sloping away to carry rain clear of the foundations. Draw driveways, paths and
    patios with the Paving tool on the plan.
  </p>
</div>

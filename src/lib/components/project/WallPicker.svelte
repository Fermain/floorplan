<script lang="ts">
  import { Badge } from '$lib/components/ui/badge'
  import { WALL_SYSTEMS } from '$lib/model/systems'
  import type { WallSystemId } from '$lib/model/types'
  import { cn } from '$lib/utils'
  import WallSwatch from './WallSwatch.svelte'
  import { thicknessMm, unitCostPerSquareMetre, unitsPerSquareMetre, WALL_BLURBS } from './wallInfo'

  // onchoose runs on a double-click, after the system is selected.
  let { value = $bindable(), onchoose }: { value: WallSystemId; onchoose?: () => void } = $props()

  const money = new Intl.NumberFormat('en-ZA', { maximumFractionDigits: 0 })
</script>

<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" role="radiogroup" aria-label="Wall system">
  {#each WALL_SYSTEMS as system (system.id)}
    <button
      type="button"
      role="radio"
      aria-checked={value === system.id}
      class={cn(
        'flex flex-col gap-2 rounded-xl border bg-card p-3 text-left transition-colors hover:bg-muted/50',
        value === system.id && 'border-primary ring-2 ring-primary/20',
      )}
      onclick={() => (value = system.id)}
      ondblclick={() => {
        value = system.id
        onchoose?.()
      }}
    >
      <WallSwatch class="w-full rounded-md" {system} />
      <div>
        <div class="font-medium">{system.name}</div>
        <div class="text-xs text-muted-foreground">{system.unitName}</div>
      </div>
      <p class="text-xs text-muted-foreground">{WALL_BLURBS[system.id].text}</p>
      <div class="mt-auto flex flex-wrap gap-1">
        <Badge variant="secondary">{thicknessMm(system)} mm</Badge>
        <Badge variant="secondary">{Math.round(unitsPerSquareMetre(system))} units/m²</Badge>
        <Badge variant="outline">≈ R {money.format(unitCostPerSquareMetre(system))}/m²</Badge>
      </div>
      <div class="text-xs font-medium text-muted-foreground">{WALL_BLURBS[system.id].use}</div>
    </button>
  {/each}
</div>

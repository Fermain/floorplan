<script lang="ts">
  import { Badge } from '$lib/components/ui/badge'
  import { plotFacts, SAMPLE_PLOTS, type SamplePlotId } from '$lib/plot/samples'
  import { cn } from '$lib/utils'
  import PlotThumbnail from './PlotThumbnail.svelte'

  let { value = $bindable() }: { value: SamplePlotId } = $props()

  const number = new Intl.NumberFormat('en-ZA', { maximumFractionDigits: 1 })
  const cards = SAMPLE_PLOTS.map((sample) => ({ sample, facts: plotFacts(sample.plot, sample.heightfield) }))
</script>

<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" role="radiogroup" aria-label="Sample plot">
  {#each cards as { sample, facts } (sample.id)}
    <button
      type="button"
      role="radio"
      aria-checked={value === sample.id}
      class={cn(
        'flex flex-col gap-2 rounded-xl border bg-card p-3 text-left transition-colors hover:bg-muted/50',
        value === sample.id && 'border-primary ring-2 ring-primary/20',
      )}
      onclick={() => (value = sample.id)}
    >
      <PlotThumbnail class="aspect-[4/3] w-full rounded-md" plot={sample.plot} heightfield={sample.heightfield} />
      <div>
        <div class="font-medium">{sample.name}</div>
        <div class="text-xs text-muted-foreground">{sample.place}</div>
      </div>
      <p class="text-xs text-muted-foreground">{sample.description}</p>
      <div class="mt-auto flex flex-wrap gap-1">
        <Badge variant="secondary">{number.format(facts.area)} m²</Badge>
        <Badge variant="secondary">{number.format(facts.fall)} m fall</Badge>
        <Badge variant="secondary">{facts.facing ? `faces ${facts.facing}` : 'level'}</Badge>
      </div>
    </button>
  {/each}
</div>

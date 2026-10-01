<script lang="ts">
  import { cn } from '$lib/utils'
  import { CORNICES, SKIRTINGS } from '$lib/model/trims'
  import type { CorniceType, SkirtingType } from '$lib/model/types'
  import TrimGlyph from './TrimGlyph.svelte'

  let {
    skirting = $bindable(),
    cornice = $bindable(),
    onchoose,
  }: { skirting: SkirtingType | 'none'; cornice: CorniceType | 'none'; onchoose?: () => void } = $props()

  const skirtings = [...SKIRTINGS.map((item) => ({ id: item.id, name: item.name, text: item.text })), { id: 'none' as const, name: 'None', text: 'No skirting; the floor finish runs to the wall.' }]
  const cornices = [...CORNICES.map((item) => ({ id: item.id, name: item.name, text: item.text })), { id: 'none' as const, name: 'None', text: 'A plain joint between wall and ceiling.' }]
</script>

<div class="grid gap-6">
  <div class="grid gap-2">
    <h3 class="text-sm font-medium">Skirting</h3>
    <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" role="radiogroup" aria-label="Skirting">
      {#each skirtings as item (item.id)}
        <button
          type="button"
          role="radio"
          aria-checked={skirting === item.id}
          class={cn(
            'flex flex-col gap-2 rounded-xl border bg-card p-3 text-left transition-colors hover:bg-muted/50',
            skirting === item.id && 'border-primary ring-2 ring-primary/20',
          )}
          onclick={() => (skirting = item.id)}
          ondblclick={() => {
            skirting = item.id
            onchoose?.()
          }}
        >
          <TrimGlyph class="h-16 w-full" kind="skirting" type={item.id} />
          <div class="font-medium">{item.name}</div>
          <p class="text-xs text-muted-foreground">{item.text}</p>
        </button>
      {/each}
    </div>
  </div>
  <div class="grid gap-2">
    <h3 class="text-sm font-medium">Cornice</h3>
    <div class="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Cornice">
      {#each cornices as item (item.id)}
        <button
          type="button"
          role="radio"
          aria-checked={cornice === item.id}
          class={cn(
            'flex flex-col gap-2 rounded-xl border bg-card p-3 text-left transition-colors hover:bg-muted/50',
            cornice === item.id && 'border-primary ring-2 ring-primary/20',
          )}
          onclick={() => (cornice = item.id)}
          ondblclick={() => {
            cornice = item.id
            onchoose?.()
          }}
        >
          <TrimGlyph class="h-16 w-full" kind="cornice" type={item.id} />
          <div class="font-medium">{item.name}</div>
          <p class="text-xs text-muted-foreground">{item.text}</p>
        </button>
      {/each}
    </div>
  </div>
</div>

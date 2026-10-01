<script lang="ts">
  import { Input } from '$lib/components/ui/input'
  import { Label } from '$lib/components/ui/label'
  import { COVERINGS, fitPitch } from '$lib/geometry/coverings'
  import type { RoofCovering, RoofForm } from '$lib/model/types'
  import { cn } from '$lib/utils'
  import CoveringSwatch from './CoveringSwatch.svelte'
  import RoofGlyph from './RoofGlyph.svelte'

  let {
    form = $bindable(),
    covering = $bindable(),
    pitchDeg = $bindable(),
    eaves = $bindable(),
    onchoose,
  }: { form: RoofForm; covering: RoofCovering; pitchDeg: number; eaves: number; onchoose?: () => void } = $props()

  const FORMS: { id: RoofForm; name: string; text: string }[] = [
    { id: 'hip', name: 'Hip', text: 'Slopes on every side. Sheds wind well and needs no gable walls.' },
    { id: 'gable', name: 'Gable', text: 'Two slopes meeting at a ridge, with the end walls built up to the roof.' },
    { id: 'mono', name: 'Mono-pitch', text: 'One slope, falling from a high wall to a low one. Simple and cheap.' },
  ]

  const spec = $derived(COVERINGS.find((item) => item.id === covering) ?? COVERINGS[0])

  function chooseForm(next: RoofForm) {
    if (next === 'mono' && form !== 'mono') pitchDeg = 10
    if (next !== 'mono' && form === 'mono') pitchDeg = 30
    form = next
    pitchDeg = fitPitch(pitchDeg, covering)
  }

  function chooseCovering(next: RoofCovering) {
    const previous = covering
    covering = next
    pitchDeg = fitPitch(pitchDeg, next, previous)
  }
</script>

<div class="grid gap-6">
  <div class="grid gap-2">
    <h3 class="text-sm font-medium">Form</h3>
    <div class="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Roof form">
      {#each FORMS as item (item.id)}
        <button
          type="button"
          role="radio"
          aria-checked={form === item.id}
          class={cn(
            'flex flex-col gap-2 rounded-xl border bg-card p-3 text-left transition-colors hover:bg-muted/50',
            form === item.id && 'border-primary ring-2 ring-primary/20',
          )}
          onclick={() => chooseForm(item.id)}
          ondblclick={() => {
            chooseForm(item.id)
            onchoose?.()
          }}
        >
          <RoofGlyph class="h-16 w-full" form={item.id} />
          <div class="font-medium">{item.name}</div>
          <p class="text-xs text-muted-foreground">{item.text}</p>
        </button>
      {/each}
    </div>
  </div>
  <div class="grid gap-2">
    <h3 class="text-sm font-medium">Covering</h3>
    <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" role="radiogroup" aria-label="Roof covering">
      {#each COVERINGS as item (item.id)}
        <button
          type="button"
          role="radio"
          aria-checked={covering === item.id}
          class={cn(
            'flex flex-col gap-2 rounded-xl border bg-card p-3 text-left transition-colors hover:bg-muted/50',
            covering === item.id && 'border-primary ring-2 ring-primary/20',
          )}
          onclick={() => chooseCovering(item.id)}
          ondblclick={() => {
            chooseCovering(item.id)
            onchoose?.()
          }}
        >
          <CoveringSwatch class="h-14 w-full rounded-md" spec={item} />
          <div class="font-medium">{item.name}</div>
          <p class="text-xs text-muted-foreground">Usually at least {item.minPitchDeg}°</p>
        </button>
      {/each}
    </div>
  </div>
  <div class="grid max-w-sm grid-cols-2 gap-3">
    <div class="grid gap-1.5">
      <Label for="default-pitch">Pitch (°)</Label>
      <Input id="default-pitch" type="number" min="1" max="89" step="1" bind:value={pitchDeg} />
    </div>
    <div class="grid gap-1.5">
      <Label for="default-eaves">Eaves (mm)</Label>
      <Input
        id="default-eaves"
        type="number"
        min="0"
        step="10"
        value={Math.round(eaves * 1000)}
        onchange={(event) => (eaves = Math.max(0, Number(event.currentTarget.value) || 0) / 1000)}
      />
    </div>
  </div>
  {#if pitchDeg < spec.minPitchDeg}
    <p class="text-sm text-amber-700">
      {spec.name} usually need at least {spec.minPitchDeg}°. Check the manufacturer's minimum.
    </p>
  {/if}
</div>

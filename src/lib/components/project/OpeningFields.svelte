<script lang="ts">
  import { Input } from '$lib/components/ui/input'
  import { Label } from '$lib/components/ui/label'
  import { wallSystem } from '$lib/model/systems'
  import type { WallSystemId } from '$lib/model/types'
  import OpeningPreview from './OpeningPreview.svelte'

  let {
    systemId,
    windowWidth = $bindable(),
    windowHeight = $bindable(),
    sill = $bindable(),
    doorHeight = $bindable(),
  }: {
    systemId: WallSystemId
    windowWidth: number
    windowHeight: number
    sill: number
    doorHeight: number
  } = $props()

  const system = $derived(wallSystem(systemId))

  const fields = [
    { id: 'windowWidth', label: 'Window width' },
    { id: 'windowHeight', label: 'Window height' },
    { id: 'sill', label: 'Sill height' },
    { id: 'doorHeight', label: 'Door height' },
  ] as const

  function read(id: (typeof fields)[number]['id']): number {
    return id === 'windowWidth' ? windowWidth : id === 'windowHeight' ? windowHeight : id === 'sill' ? sill : doorHeight
  }

  function write(id: (typeof fields)[number]['id'], raw: string) {
    const value = Number(raw) / 1000
    if (!Number.isFinite(value) || value < 0) return
    if (id === 'windowWidth') windowWidth = value
    else if (id === 'windowHeight') windowHeight = value
    else if (id === 'sill') sill = value
    else doorHeight = value
  }
</script>

<div class="grid gap-6 lg:grid-cols-[18rem_1fr]">
  <div class="grid content-start gap-3">
    {#each fields as field (field.id)}
      <div class="grid gap-1.5">
        <Label for={`default-${field.id}`}>{field.label} (mm)</Label>
        <Input
          id={`default-${field.id}`}
          type="number"
          min="0"
          step="10"
          value={Math.round(read(field.id) * 1000)}
          onchange={(event) => write(field.id, event.currentTarget.value)}
        />
      </div>
    {/each}
    <p class="text-xs text-muted-foreground">
      Openings snap to whole courses of the {system.name.toLowerCase()} wall, shown on the right. SANS 10400 Part O asks
      for glazing of about a tenth of a habitable room's floor area.
    </p>
  </div>
  <OpeningPreview
    class="w-full rounded-lg border bg-background p-2"
    {system}
    defaults={{ windowWidth, windowHeight, sill, doorHeight }}
  />
</div>

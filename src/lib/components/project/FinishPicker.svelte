<script lang="ts">
  import { Label } from '$lib/components/ui/label'
  import * as Select from '$lib/components/ui/select'
  import { autoFinish, finishSpec, NO_PAINT, PAINTS, paintSpec, WALL_FINISHES } from '$lib/model/finishes'
  import type { WallFinish, WallSystemId } from '$lib/model/types'

  // How the walls are finished and painted, outside and in. Any face can be changed on its own in Focus.
  let {
    systemId,
    outsideFinish = $bindable(),
    insideFinish = $bindable(),
    outsidePaint = $bindable(),
    insidePaint = $bindable(),
  }: {
    systemId: WallSystemId
    outsideFinish: WallFinish | 'auto'
    insideFinish: WallFinish | 'auto'
    outsidePaint: string
    insidePaint: string
  } = $props()

  const faces = $derived([
    { id: 'outside', label: 'Outside walls', outside: true, finish: outsideFinish, paint: outsidePaint },
    { id: 'inside', label: 'Inside walls', outside: false, finish: insideFinish, paint: insidePaint },
  ] as const)

  function setFinish(outside: boolean, next: WallFinish | 'auto') {
    if (outside) outsideFinish = next
    else insideFinish = next
  }

  function setPaint(outside: boolean, next: string) {
    if (outside) outsidePaint = next
    else insidePaint = next
  }

  const resolved = (finish: WallFinish | 'auto', outside: boolean) => (finish === 'auto' ? autoFinish(systemId, outside) : finish)
  const finishLabel = (finish: WallFinish | 'auto', outside: boolean) =>
    finish === 'auto' ? `Automatic (${finishSpec(autoFinish(systemId, outside)).name.toLowerCase()})` : finishSpec(finish).name
</script>

<div class="grid gap-4 sm:grid-cols-2">
  {#each faces as face (face.id)}
    {@const shown = resolved(face.finish, face.outside)}
    <div class="grid content-start gap-3">
      <div class="grid gap-1.5">
        <Label for="finish-{face.id}">{face.label}</Label>
        <Select.Root type="single" value={face.finish} onValueChange={(next) => next && setFinish(face.outside, next as WallFinish | 'auto')}>
          <Select.Trigger id="finish-{face.id}" class="w-full">{finishLabel(face.finish, face.outside)}</Select.Trigger>
          <Select.Content>
            <Select.Item value="auto" label={finishLabel('auto', face.outside)} />
            {#each WALL_FINISHES as spec (spec.id)}
              <Select.Item value={spec.id} label={spec.name} />
            {/each}
          </Select.Content>
        </Select.Root>
        <p class="text-sm text-muted-foreground">{finishSpec(shown).text}</p>
      </div>
      <div class="grid gap-1.5">
        <Label for="paint-{face.id}">Paint</Label>
        <Select.Root type="single" value={face.paint} onValueChange={(next) => next && setPaint(face.outside, next)} disabled={shown === 'exposed'}>
          <Select.Trigger id="paint-{face.id}" class="w-full">
            {#if shown === 'exposed'}
              Not painted
            {:else}
              <span class="flex items-center gap-2">
                <span class="inline-block size-3 rounded-full border" style:background={paintSpec(face.paint)?.colour ?? 'transparent'}></span>
                {paintSpec(face.paint)?.name ?? 'Unpainted'}
              </span>
            {/if}
          </Select.Trigger>
          <Select.Content>
            {#each PAINTS as paint (paint.id)}
              <Select.Item value={paint.id} label={paint.name} />
            {/each}
            <Select.Item value={NO_PAINT} label="Unpainted" />
          </Select.Content>
        </Select.Root>
      </div>
    </div>
  {/each}
</div>

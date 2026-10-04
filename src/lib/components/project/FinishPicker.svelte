<script lang="ts">
  import { Label } from '$lib/components/ui/label'
  import * as Select from '$lib/components/ui/select'
  import { autoFinish, finishSpec, NO_PAINT, PAINTS, paintSpec, WALL_FINISHES } from '$lib/model/finishes'
  import type { WallFinish, WallSystemId } from '$lib/model/types'
  import SwatchPicker from './SwatchPicker.svelte'
  import InfoTip from './InfoTip.svelte'

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

  const paintOptions = [...PAINTS.map((paint) => ({ id: paint.id, name: paint.name, swatch: paint.colour })), { id: NO_PAINT, name: 'Unpainted', swatch: null }]

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
        <div class="flex items-center gap-1.5">
          <Label for="finish-{face.id}">{face.label}</Label>
          <InfoTip label="About the finishes">
            {#each WALL_FINISHES as spec (spec.id)}
              <p><span class="font-medium">{spec.name}.</span> {spec.text}</p>
            {/each}
          </InfoTip>
        </div>
        <Select.Root type="single" value={face.finish} onValueChange={(next) => next && setFinish(face.outside, next as WallFinish | 'auto')}>
          <Select.Trigger id="finish-{face.id}" class="w-full">{finishLabel(face.finish, face.outside)}</Select.Trigger>
          <Select.Content>
            <Select.Item value="auto" label={finishLabel('auto', face.outside)} />
            {#each WALL_FINISHES as spec (spec.id)}
              <Select.Item value={spec.id} label={spec.name} />
            {/each}
          </Select.Content>
        </Select.Root>
      </div>
      <div class="grid gap-1.5">
        <div class="flex items-baseline justify-between gap-2">
          <Label>Paint</Label>
          <span class="text-sm text-muted-foreground">
            {shown === 'exposed' ? 'Not painted' : (paintSpec(face.paint)?.name ?? 'Unpainted')}
          </span>
        </div>
        <SwatchPicker
          label="{face.label}: paint"
          options={paintOptions}
          value={shown === 'exposed' ? null : face.paint}
          disabled={shown === 'exposed'}
          onchange={(next) => setPaint(face.outside, next)}
          compact
        />
      </div>
    </div>
  {/each}
</div>

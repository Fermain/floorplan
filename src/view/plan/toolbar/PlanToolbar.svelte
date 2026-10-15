<script lang="ts">
  import { Button } from '$lib/components/ui/button'
  import * as ToggleGroup from '$lib/components/ui/toggle-group'
  import * as Select from '$lib/components/ui/select'
  import MousePointer2 from '@lucide/svelte/icons/mouse-pointer-2'
  import BrickWall from '@lucide/svelte/icons/brick-wall'
  import SquareDashed from '@lucide/svelte/icons/square-dashed'
  import Footprints from '@lucide/svelte/icons/footprints'
  import ChefHat from '@lucide/svelte/icons/chef-hat'
  import Plug from '@lucide/svelte/icons/plug'
  import Maximize2 from '@lucide/svelte/icons/maximize-2'
  import Home from '@lucide/svelte/icons/home'
  import Trees from '@lucide/svelte/icons/trees'
  import Grid2x2 from '@lucide/svelte/icons/grid-2x2'
  import Sprout from '@lucide/svelte/icons/sprout'
  import CarFront from '@lucide/svelte/icons/car-front'
  import Mountain from '@lucide/svelte/icons/mountain'
  import RotateCw from '@lucide/svelte/icons/rotate-cw'
  import Check from '@lucide/svelte/icons/check'
  import Undo2 from '@lucide/svelte/icons/undo-2'
  import Trash2 from '@lucide/svelte/icons/trash-2'
  import type { Tool, PlanScope } from '../scope'
  import { COUNTER_KINDS, COUNTER_TOPS, counterTopSpec } from '../../../lib/model/counters'
  import type { CounterKind, CounterTop, Carport, CarportRoof, PavingSurface, BedMaterial, FixtureKind, RetainingType } from '../../../lib/model/types'
  import { CARPORT_BAYS, CARPORT_ROOFS, carportName, carportRoofSpec } from '../../../lib/model/carports'
  import { PAVING, PAVING_LIST } from '../../../lib/geometry/paving'
  import { pavingSwatch } from '$lib/components/project/swatches'
  import { BED_MATERIALS, DEFAULT_RAISED_HEIGHT, bedMaterialSpec } from '../../../lib/model/beds'
  import { RETAINING_TYPES, retainingSpec } from '../../../lib/model/retaining'
  import { documentStore } from '../../../lib/state/document.svelte'
  import FixturePickerPopover from './FixturePickerPopover.svelte'

  interface Props {
    planScope: PlanScope
    onSwitchScope: (scope: PlanScope) => void
    focusedCells: { name: string } | null
    onLeaveRoom: () => void
    tool: Tool
    onSetTool: (tool: Tool) => void
    counterKind: CounterKind
    onCounterKindChange: (kind: CounterKind) => void
    counterTop: CounterTop
    onCounterTopChange: (top: CounterTop) => void
    carportBays: Carport['bays']
    onCarportBaysChange: (bays: Carport['bays']) => void
    carportRoof: CarportRoof
    onCarportRoofChange: (roof: CarportRoof) => void
    onCarportTurn: () => void
    pavingShape: 'rect' | 'outline'
    onPavingShapeChange: (shape: 'rect' | 'outline') => void
    pavingSurface: PavingSurface
    onPavingSurfaceChange: (surface: PavingSurface) => void
    pavingDraftLength: number
    onFinishPaving: () => void
    onUndoPaving: () => void
    bedShape: 'rect' | 'outline'
    onBedShapeChange: (shape: 'rect' | 'outline') => void
    bedHeight: number
    onBedHeightChange: (height: number) => void
    bedMaterial: BedMaterial
    onBedMaterialChange: (material: BedMaterial) => void
    bedFlatEdging: BedMaterial | 'none'
    onBedFlatEdgingChange: (edging: BedMaterial | 'none') => void
    bedDraftLength: number
    onFinishBed: () => void
    onUndoBed: () => void
    fixtureKind: FixtureKind
    onFixtureKindChange: (kind: FixtureKind) => void
    placeSize: { name: string } | null
    onStepPlaceSize: (delta: 1 | -1) => void
    retainingType: RetainingType
    onRetainingTypeChange: (type: RetainingType) => void
    retainingDraftLength: number
    onFinishRetaining: () => void
    deletable: { label: string; run: () => void } | null
  }

  let {
    planScope,
    onSwitchScope,
    focusedCells,
    onLeaveRoom,
    tool,
    onSetTool,
    counterKind,
    onCounterKindChange,
    counterTop,
    onCounterTopChange,
    carportBays,
    onCarportBaysChange,
    carportRoof,
    onCarportRoofChange,
    onCarportTurn,
    pavingShape,
    onPavingShapeChange,
    pavingSurface,
    onPavingSurfaceChange,
    pavingDraftLength,
    onFinishPaving,
    onUndoPaving,
    bedShape,
    onBedShapeChange,
    bedHeight,
    onBedHeightChange,
    bedMaterial,
    onBedMaterialChange,
    bedFlatEdging,
    onBedFlatEdgingChange,
    bedDraftLength,
    onFinishBed,
    onUndoBed,
    fixtureKind,
    onFixtureKindChange,
    placeSize,
    onStepPlaceSize,
    retainingType,
    onRetainingTypeChange,
    retainingDraftLength,
    onFinishRetaining,
    deletable,
  }: Props = $props()
</script>

<div class="flex flex-wrap items-center gap-2 border-b bg-background px-2 py-1.5 sm:gap-3 sm:px-3" class:hidden={documentStore.readOnly}>
  {#if focusedCells}
    <div class="flex items-center gap-1.5 text-xs font-medium px-1">
      <span class="rounded bg-muted px-1.5 py-0.5 font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Room</span>
      <span class="font-semibold text-foreground truncate max-w-[120px] sm:max-w-none">{focusedCells.name}</span>
    </div>
    <div class="h-4 w-px bg-border shrink-0"></div>
    <ToggleGroup.Root
      type="single"
      variant="outline"
      size="sm"
      value={tool}
      onValueChange={(next) => {
        if (next) onSetTool(next as Tool)
      }}
      aria-label="Room interior tools"
    >
      <ToggleGroup.Item value="select" aria-label="Select" title="Select (V)" class="max-sm:px-2">
        <MousePointer2 /><span class="hidden sm:inline">Select</span>
      </ToggleGroup.Item>
      <ToggleGroup.Item value="draw-counter" aria-label="Counters & Cupboards" title="Counters & Cupboards: kitchen worktops and built-in cupboards" class="max-sm:px-2">
        <ChefHat /><span class="hidden sm:inline">Counters</span>
      </ToggleGroup.Item>
      <ToggleGroup.Item value="draw-fixture" aria-label="Fittings" title="Fittings: sockets, lights, toilets, basins and more" class="max-sm:px-2">
        <Plug /><span class="hidden sm:inline">Fittings</span>
      </ToggleGroup.Item>
    </ToggleGroup.Root>
    <div class="h-4 w-px bg-border shrink-0"></div>
    <Button size="sm" variant="outline" title="Back to the whole plan (Esc)" onclick={onLeaveRoom} class="max-sm:px-2">
      <Maximize2 /><span class="hidden sm:inline">Whole Plan (Esc)</span><span class="sm:hidden">Whole Plan</span>
    </Button>
  {:else}
    <ToggleGroup.Root
      type="single"
      variant="outline"
      size="sm"
      value={planScope}
      onValueChange={(next) => {
        if (next) onSwitchScope(next as PlanScope)
      }}
      aria-label="Scope"
    >
      <ToggleGroup.Item value="building" aria-label="Building Mode" title="Building Mode: walls, rooms, stairs, counters, fittings" class="max-sm:px-2">
        <Home /><span class="hidden sm:inline">Building</span>
      </ToggleGroup.Item>
      <ToggleGroup.Item value="site" aria-label="Site Mode" title="Site Mode: paving, beds, carports, retaining walls" class="max-sm:px-2">
        <Trees /><span class="hidden sm:inline">Site</span>
      </ToggleGroup.Item>
    </ToggleGroup.Root>
    <div class="h-4 w-px bg-border shrink-0"></div>
    {#if planScope === 'building'}
      <ToggleGroup.Root
        type="single"
        variant="outline"
        size="sm"
        value={tool === 'draw-rect' ? 'draw-double' : tool}
        onValueChange={(next) => {
          if (next) onSetTool(next as Tool)
        }}
        aria-label="Building tools"
      >
        <ToggleGroup.Item value="select" aria-label="Select" title="Select (V)" class="max-sm:px-2">
          <MousePointer2 /><span class="hidden sm:inline">Select</span>
        </ToggleGroup.Item>
        <ToggleGroup.Item value="draw-double" aria-label="Wall" title="Wall. Hold Shift to draw a rectangle." class="max-sm:px-2">
          <BrickWall /><span class="hidden sm:inline">Wall</span>
        </ToggleGroup.Item>
        <ToggleGroup.Item value="draw-logical" aria-label="Logical wall" title="Logical wall: divides a room without building anything" class="max-sm:px-2">
          <SquareDashed /><span class="hidden sm:inline">Logical</span>
        </ToggleGroup.Item>
        <ToggleGroup.Item value="draw-stair" aria-label="Stair" title="Stair" class="max-sm:px-2">
          <Footprints /><span class="hidden sm:inline">Stair</span>
        </ToggleGroup.Item>
        <ToggleGroup.Item value="draw-counter" aria-label="Counters & Cupboards" title="Counters & Cupboards: kitchen worktops and built-in cupboards" class="max-sm:px-2">
          <ChefHat /><span class="hidden sm:inline">Counters</span>
        </ToggleGroup.Item>
        <ToggleGroup.Item value="draw-fixture" aria-label="Fittings" title="Fittings: sockets, lights, toilets, basins and more" class="max-sm:px-2">
          <Plug /><span class="hidden sm:inline">Fittings</span>
        </ToggleGroup.Item>
      </ToggleGroup.Root>
    {:else}
      <ToggleGroup.Root
        type="single"
        variant="outline"
        size="sm"
        value={tool}
        onValueChange={(next) => {
          if (next) onSetTool(next as Tool)
        }}
        aria-label="Site tools"
      >
        <ToggleGroup.Item value="select" aria-label="Select" title="Select (V)" class="max-sm:px-2">
          <MousePointer2 /><span class="hidden sm:inline">Select</span>
        </ToggleGroup.Item>
        <ToggleGroup.Item value="draw-paving" aria-label="Paving" title="Paving: driveways, paths and patios on the ground" class="max-sm:px-2">
          <Grid2x2 /><span class="hidden sm:inline">Paving</span>
        </ToggleGroup.Item>
        <ToggleGroup.Item value="draw-bed" aria-label="Garden beds" title="Garden beds: flower beds and raised planters on the ground" class="max-sm:px-2">
          <Sprout /><span class="hidden sm:inline">Beds</span>
        </ToggleGroup.Item>
        <ToggleGroup.Item value="draw-carport" aria-label="Carport" title="Carport: a roof on posts, standing free" class="max-sm:px-2">
          <CarFront /><span class="hidden sm:inline">Carport</span>
        </ToggleGroup.Item>
        <ToggleGroup.Item value="draw-retaining" aria-label="Retaining wall" title="Retaining wall: holds a bank back" class="max-sm:px-2">
          <Mountain /><span class="hidden sm:inline">Retaining</span>
        </ToggleGroup.Item>
      </ToggleGroup.Root>
    {/if}
  {/if}
  {#if tool === 'draw-retaining'}
    <Select.Root type="single" value={retainingType} onValueChange={(next) => next && onRetainingTypeChange(next as RetainingType)}>
      <Select.Trigger size="sm" class="w-44" aria-label="Kind of retaining wall">{retainingSpec(retainingType).name}</Select.Trigger>
      <Select.Content>
        {#each RETAINING_TYPES as spec (spec.id)}
          <Select.Item value={spec.id} label={spec.name} />
        {/each}
      </Select.Content>
    </Select.Root>
    {#if retainingDraftLength > 0}
      <Button size="sm" disabled={retainingDraftLength < 2} title="Build the wall (Enter)" onclick={onFinishRetaining}>
        <Check />Finish
      </Button>
    {/if}
  {/if}
  {#if tool === 'draw-counter'}
    <ToggleGroup.Root
      type="single"
      variant="outline"
      size="sm"
      value={counterKind}
      onValueChange={(next) => {
        if (next) onCounterKindChange(next as CounterKind)
      }}
      aria-label="Kind of counter"
    >
      {#each COUNTER_KINDS as spec (spec.id)}
        <ToggleGroup.Item value={spec.id} title={spec.text}>{spec.name}</ToggleGroup.Item>
      {/each}
    </ToggleGroup.Root>
    {#if counterKind !== 'cupboard'}
      <Select.Root type="single" value={counterTop} onValueChange={(next) => next && onCounterTopChange(next as CounterTop)}>
        <Select.Trigger size="sm" class="w-36" aria-label="Worktop">
          <span class="flex items-center gap-2">
            <span class="inline-block size-4 shrink-0 rounded-sm border border-black/15" style:background={counterTopSpec(counterTop).colour}></span>
            {counterTopSpec(counterTop).name}
          </span>
        </Select.Trigger>
        <Select.Content>
          {#each COUNTER_TOPS as spec (spec.id)}
            <Select.Item value={spec.id} label={spec.name}>
              <span class="inline-block size-4 shrink-0 rounded-sm border border-black/15" style:background={spec.colour}></span>
              {spec.name}
            </Select.Item>
          {/each}
        </Select.Content>
      </Select.Root>
    {/if}
  {/if}
  {#if tool === 'draw-carport'}
    <ToggleGroup.Root
      type="single"
      variant="outline"
      size="sm"
      value={String(carportBays)}
      onValueChange={(next) => next && onCarportBaysChange(Number(next) as Carport['bays'])}
      aria-label="How many cars"
    >
      {#each CARPORT_BAYS as bays (bays)}
        <ToggleGroup.Item value={String(bays)} title={carportName(bays)}>{bays === 1 ? 'Single' : bays === 2 ? 'Double' : 'Triple'}</ToggleGroup.Item>
      {/each}
    </ToggleGroup.Root>
    <Select.Root type="single" value={carportRoof} onValueChange={(next) => next && onCarportRoofChange(next as CarportRoof)}>
      <Select.Trigger size="sm" class="w-40" aria-label="Carport roof">{carportRoofSpec(carportRoof).name}</Select.Trigger>
      <Select.Content>
        {#each CARPORT_ROOFS as spec (spec.id)}
          <Select.Item value={spec.id} label={spec.name} />
        {/each}
      </Select.Content>
    </Select.Root>
    <Button size="sm" variant="outline" title="Turn it a quarter turn (R)" onclick={onCarportTurn}>
      <RotateCw /><span class="hidden sm:inline">Turn</span>
    </Button>
  {/if}
  {#if tool === 'draw-paving'}
    <ToggleGroup.Root
      type="single"
      variant="outline"
      size="sm"
      value={pavingShape}
      onValueChange={(next) => {
        if (next) onPavingShapeChange(next as 'rect' | 'outline')
      }}
      aria-label="Paving shape"
    >
      <ToggleGroup.Item value="rect" title="Two opposite corners">Rectangle</ToggleGroup.Item>
      <ToggleGroup.Item value="outline" title="Each corner in turn">Outline</ToggleGroup.Item>
    </ToggleGroup.Root>
    <Select.Root type="single" value={pavingSurface} onValueChange={(next) => next && onPavingSurfaceChange(next as PavingSurface)}>
      <Select.Trigger size="sm" class="w-40" aria-label="Paving surface">
        <span class="flex items-center gap-2">
          <span class="inline-block size-4 shrink-0 rounded-sm border border-black/15" style:background={pavingSwatch(pavingSurface)}></span>
          {PAVING[pavingSurface].name}
        </span>
      </Select.Trigger>
      <Select.Content>
        {#each PAVING_LIST as spec (spec.id)}
          <Select.Item value={spec.id} label={spec.name}>
            <span class="inline-block size-4 shrink-0 rounded-sm border border-black/15" style:background={pavingSwatch(spec.id)}></span>
            {spec.name}
          </Select.Item>
        {/each}
      </Select.Content>
    </Select.Root>
    {#if pavingShape === 'outline' && pavingDraftLength > 0}
      <Button size="sm" disabled={pavingDraftLength < 3} title="Lay the paving (Enter)" onclick={onFinishPaving}>
        <Check />Finish
      </Button>
      <Button size="sm" variant="outline" title="Take back the last corner (Backspace)" onclick={onUndoPaving}>
        <Undo2 /><span class="hidden sm:inline">Corner</span>
      </Button>
    {/if}
  {/if}
  {#if tool === 'draw-bed'}
    <ToggleGroup.Root
      type="single"
      variant="outline"
      size="sm"
      value={bedShape}
      onValueChange={(next) => {
        if (next) onBedShapeChange(next as 'rect' | 'outline')
      }}
      aria-label="Bed shape"
    >
      <ToggleGroup.Item value="rect" title="Two opposite corners">Rectangle</ToggleGroup.Item>
      <ToggleGroup.Item value="outline" title="Each corner in turn">Outline</ToggleGroup.Item>
    </ToggleGroup.Root>
    <ToggleGroup.Root
      type="single"
      variant="outline"
      size="sm"
      value={bedHeight <= 0.05 ? 'ground' : 'raised'}
      onValueChange={(val) => {
        if (val === 'ground') onBedHeightChange(0)
        else if (val === 'raised') onBedHeightChange(DEFAULT_RAISED_HEIGHT)
      }}
      aria-label="Bed height"
    >
      <ToggleGroup.Item value="ground" title="In-ground flower bed">Flat</ToggleGroup.Item>
      <ToggleGroup.Item value="raised" title="Raised planter bed">Raised</ToggleGroup.Item>
    </ToggleGroup.Root>
    {#if bedHeight > 0.05}
      <Select.Root type="single" value={bedMaterial} onValueChange={(next) => next && onBedMaterialChange(next as BedMaterial)}>
        <Select.Trigger size="sm" class="w-40" aria-label="Raised bed wall material">
          <span class="flex items-center gap-2">
            <span class="inline-block size-4 shrink-0 rounded-sm border border-black/15" style:background={bedMaterialSpec(bedMaterial).colour}></span>
            {bedMaterialSpec(bedMaterial).name}
          </span>
        </Select.Trigger>
        <Select.Content>
          {#each BED_MATERIALS as spec (spec.id)}
            <Select.Item value={spec.id} label={spec.name}>
              <span class="inline-block size-4 shrink-0 rounded-sm border border-black/15" style:background={spec.colour}></span>
              {spec.name}
            </Select.Item>
          {/each}
        </Select.Content>
      </Select.Root>
    {:else}
      <Select.Root type="single" value={bedFlatEdging} onValueChange={(next) => next && onBedFlatEdgingChange(next as BedMaterial | 'none')}>
        <Select.Trigger size="sm" class="w-40" aria-label="Flush edging">
          <span class="flex items-center gap-2">
            {#if bedFlatEdging !== 'none'}
              <span class="inline-block size-4 shrink-0 rounded-sm border border-black/15" style:background={bedMaterialSpec(bedFlatEdging).colour}></span>
              {bedMaterialSpec(bedFlatEdging).name}
            {:else}
              <span class="inline-block size-4 shrink-0 rounded-sm border border-black/15 bg-transparent"></span>
              No edging
            {/if}
          </span>
        </Select.Trigger>
        <Select.Content>
          <Select.Item value="none" label="No edging">No edging</Select.Item>
          {#each BED_MATERIALS as spec (spec.id)}
            <Select.Item value={spec.id} label={spec.name}>
              <span class="inline-block size-4 shrink-0 rounded-sm border border-black/15" style:background={spec.colour}></span>
              {spec.name}
            </Select.Item>
          {/each}
        </Select.Content>
      </Select.Root>
    {/if}
    {#if bedShape === 'outline' && bedDraftLength > 0}
      <Button size="sm" disabled={bedDraftLength < 3} title="Build the bed (Enter)" onclick={onFinishBed}>
        <Check />Finish
      </Button>
      <Button size="sm" variant="outline" title="Take back the last corner (Backspace)" onclick={onUndoBed}>
        <Undo2 /><span class="hidden sm:inline">Corner</span>
      </Button>
    {/if}
  {/if}
  {#if tool === 'draw-fixture'}
    <FixturePickerPopover
      {fixtureKind}
      {onFixtureKindChange}
      {placeSize}
      {onStepPlaceSize}
    />
  {/if}
  {#if deletable}
    <Button
      variant="ghost"
      size="sm"
      class="ml-auto text-destructive hover:text-destructive"
      title="{deletable.label} (Delete or Backspace)"
      onclick={deletable.run}
    >
      <Trash2 />{deletable.label}
      <kbd class="ml-1 hidden rounded border px-1 font-sans text-[10px] text-muted-foreground sm:inline">⌫</kbd>
    </Button>
  {/if}
</div>

<script lang="ts">
  import { Input } from '$lib/components/ui/input'
  import { Label } from '$lib/components/ui/label'
  import * as Select from '$lib/components/ui/select'
  import { airconLayout } from '../../lib/geometry/aircon'
  import { chimneyLayout } from '../../lib/geometry/chimney'
  import { gasLayout } from '../../lib/geometry/gas'
  import { gutterLayout } from '../../lib/geometry/gutters'
  import {
    AIRCON_BTUS,
    AIRCON_SIZES,
    BOTTLE_SIZES,
    BOTTLES,
    bottleSetup,
    BUILT_IN,
    DEFAULT_AIRCON_BTU,
    DEFAULT_WOOD_BURNER_KW,
    fitFixtureY,
    fixtureSpec,
    MAX_BOTTLES,
    swapsFor,
    TANK_SIZES,
    TANKS,
    tankLitres,
    WOOD_BURNER_KWS,
    WOOD_BURNER_SIZES,
  } from '../../lib/model/fixtures'
  import type { AirconBtu, BottleSize, Fixture, FixtureKind, MutationResult, TankLitres, WoodBurnerKw } from '../../lib/model/types'
  import { documentStore } from '../../lib/state/document.svelte'

  // A fitting's own controls, the same in Plan and Focus: what kind it is, its size, and its height.
  let { floorId, fixture, onresult }: { floorId: string; fixture: Fixture; onresult?: (result: MutationResult) => void } = $props()

  const spec = $derived(fixtureSpec(fixture.kind))
  const swaps = $derived(swapsFor(fixture.kind))
  const setup = $derived(bottleSetup(fixture))
  const doc = $derived(documentStore.document)
  const feeds = $derived(fixture.kind === 'water-tank' ? gutterLayout(doc).downpipes.filter((pipe) => pipe.tank?.id === fixture.id).length : 0)
  const gas = $derived(spec.trade === 'gas' ? gasLayout(doc) : null)
  const fed = $derived(gas ? gas.runs.filter((run) => run.cylinder.fixture.id === fixture.id) : [])
  const run = $derived(gas ? gas.runs.find((item) => item.item.fixture.id === fixture.id) : undefined)
  const aircon = $derived(fixture.kind === 'aircon-indoor' || fixture.kind === 'aircon-outdoor' ? airconLayout(doc) : null)
  const airconPair = $derived(aircon ? aircon.pairs.find((p) => p.indoor.fixture.id === fixture.id || p.outdoor.fixture.id === fixture.id) : null)
  const chimney = $derived(fixture.kind === 'wood-burner' ? chimneyLayout(doc) : null)
  const burnerInfo = $derived(chimney ? chimney.woodBurners.find((b) => b.fixture.id === fixture.id) : null)
  const metres = new Intl.NumberFormat('en-ZA', { maximumFractionDigits: 1 })
  const id = $derived(`fitting-${fixture.id}`)

  function apply(result: MutationResult) {
    onresult?.(result)
  }

  function setSetup(patch: Partial<Pick<Fixture, 'bottles' | 'bottleKg' | 'cage' | 'litres' | 'btu' | 'kw'>>) {
    apply(documentStore.setFixtureSetup(floorId, fixture.id, patch))
  }

  function setHeight(mm: number) {
    if (!Number.isFinite(mm)) return
    apply(documentStore.updateFixture(floorId, fixture.id, { y: fitFixtureY(fixture.kind, mm / 1000) }))
  }
</script>

{#if BUILT_IN.includes(fixture.kind)}
  <label class="flex cursor-pointer items-center gap-2">
    <input
      type="checkbox"
      class="size-4 accent-primary"
      checked={fixture.builtIn ?? false}
      onchange={(event) => apply(documentStore.updateFixture(floorId, fixture.id, { builtIn: event.currentTarget.checked }))}
    />
    Built in: a hob in the worktop, with an oven under it
  </label>
{/if}
{#if swaps.length > 0}
  <div class="grid gap-1.5">
    <Label for="{id}-kind">Type</Label>
    <Select.Root type="single" value={fixture.kind} onValueChange={(next) => next && apply(documentStore.setFixtureKind(floorId, fixture.id, next as FixtureKind))}>
      <Select.Trigger id="{id}-kind" size="sm" class="w-full">{spec.name}</Select.Trigger>
      <Select.Content>
        {#each swaps as kind (kind)}
          <Select.Item value={kind} label={fixtureSpec(kind).name} />
        {/each}
      </Select.Content>
    </Select.Root>
  </div>
{/if}

{#if fixture.kind === 'water-tank'}
  <div class="grid gap-1.5">
    <Label for="{id}-litres">Size</Label>
    <Select.Root type="single" value={String(tankLitres(fixture))} onValueChange={(next) => next && setSetup({ litres: Number(next) as TankLitres })}>
      <Select.Trigger id="{id}-litres" size="sm" class="w-full">{TANKS[tankLitres(fixture)].name}</Select.Trigger>
      <Select.Content>
        {#each TANK_SIZES as litres (litres)}
          <Select.Item value={String(litres)} label={TANKS[litres].name} />
        {/each}
      </Select.Content>
    </Select.Root>
  </div>
  {#if feeds > 0}
    <p>Fed by {feeds} {feeds === 1 ? 'downpipe' : 'downpipes'} from the gutters, through a leaf trap and first-flush diverter.</p>
  {:else}
    <p class="text-amber-700">No downpipe reaches it. Move it along the wall to stand under one.</p>
  {/if}
{/if}

{#if fixture.kind === 'gas-cylinder'}
  <div class="grid grid-cols-2 gap-2">
    <div class="grid gap-1.5">
      <Label for="{id}-bottles">Bottles</Label>
      <Select.Root type="single" value={String(setup.count)} onValueChange={(next) => next && setSetup({ bottles: Number(next) })}>
        <Select.Trigger id="{id}-bottles" size="sm" class="w-full">{setup.count}</Select.Trigger>
        <Select.Content>
          {#each Array.from({ length: MAX_BOTTLES }, (_, i) => i + 1) as count (count)}
            <Select.Item value={String(count)} label={String(count)} />
          {/each}
        </Select.Content>
      </Select.Root>
    </div>
    <div class="grid gap-1.5">
      <Label for="{id}-kg">Size</Label>
      <Select.Root type="single" value={String(setup.kg)} onValueChange={(next) => next && setSetup({ bottleKg: Number(next) as BottleSize })}>
        <Select.Trigger id="{id}-kg" size="sm" class="w-full">{BOTTLES[setup.kg].name}</Select.Trigger>
        <Select.Content>
          {#each BOTTLE_SIZES as kg (kg)}
            <Select.Item value={String(kg)} label={BOTTLES[kg].name} />
          {/each}
        </Select.Content>
      </Select.Root>
    </div>
    <div class="col-span-2 grid gap-1.5">
      <Label for="{id}-cage">Cage</Label>
      <Select.Root type="single" value={setup.cage ? 'yes' : 'no'} onValueChange={(next) => next && setSetup({ cage: next === 'yes' })}>
        <Select.Trigger id="{id}-cage" size="sm" class="w-full">{setup.cage ? 'Locked steel cage' : 'No cage'}</Select.Trigger>
        <Select.Content>
          <Select.Item value="yes" label="Locked steel cage" />
          <Select.Item value="no" label="No cage" />
        </Select.Content>
      </Select.Root>
    </div>
  </div>
  <p>
    Feeds {fed.length} {fed.length === 1 ? 'appliance' : 'appliances'}{fed.length > 0
      ? `, through about ${metres.format(fed.reduce((sum, item) => sum + item.length, 0))} m of 15 mm copper pipe.`
      : '.'}
  </p>
{:else if gas}
  {#if run}
    <p>
      About {metres.format(run.length)} m of 15 mm copper pipe from the gas bottles: {metres.format(run.outside)} m along the outside
      wall{run.inside > 0.05 ? `, ${metres.format(run.inside)} m through and inside` : ''}.
    </p>
  {:else}
    <p class="text-amber-700">No gas yet: place gas bottles against an outside wall.</p>
  {/if}
{/if}

{#if fixture.kind === 'aircon-indoor' || fixture.kind === 'aircon-outdoor'}
  <div class="grid gap-1.5">
    <Label for="{id}-btu">Capacity</Label>
    <Select.Root
      type="single"
      value={String(fixture.btu ?? DEFAULT_AIRCON_BTU)}
      onValueChange={(next) => next && setSetup({ btu: Number(next) as AirconBtu })}
    >
      <Select.Trigger id="{id}-btu" size="sm" class="w-full">
        {(fixture.btu ?? DEFAULT_AIRCON_BTU).toLocaleString('en-ZA')} BTU (up to {AIRCON_SIZES[fixture.btu ?? DEFAULT_AIRCON_BTU].indoor.m2Max} m²)
      </Select.Trigger>
      <Select.Content>
        {#each AIRCON_BTUS as btu (btu)}
          <Select.Item value={String(btu)} label="{btu.toLocaleString('en-ZA')} BTU (up to {AIRCON_SIZES[btu].indoor.m2Max} m²)" />
        {/each}
      </Select.Content>
    </Select.Root>
  </div>
  {#if airconPair}
    {#if airconPair.direct}
      <p>
        Back-to-back installation: about {metres.format(airconPair.pipeLength)} m pipe through the wall to the
        {fixture.kind === 'aircon-indoor' ? 'outdoor compressor' : 'indoor unit'}.
      </p>
    {:else}
      <p>
        Connected to the {fixture.kind === 'aircon-indoor' ? 'outdoor compressor' : 'indoor unit'}: about {metres.format(airconPair.pipeLength)} m of
        insulated refrigerant pipe.
      </p>
    {/if}
  {:else}
    <p class="text-amber-700">
      {fixture.kind === 'aircon-indoor'
        ? 'No outdoor compressor connected: place one against an outside wall.'
        : 'No indoor unit connected: place an indoor aircon in a room.'}
    </p>
  {/if}
{/if}

{#if fixture.kind === 'wood-burner'}
  <div class="grid gap-1.5">
    <Label for="{id}-kw">Heat output</Label>
    <Select.Root
      type="single"
      value={String(fixture.kw ?? DEFAULT_WOOD_BURNER_KW)}
      onValueChange={(next) => next && setSetup({ kw: Number(next) as WoodBurnerKw })}
    >
      <Select.Trigger id="{id}-kw" size="sm" class="w-full">
        {fixture.kw ?? DEFAULT_WOOD_BURNER_KW} kW (heats up to {WOOD_BURNER_SIZES[fixture.kw ?? DEFAULT_WOOD_BURNER_KW].m2Max} m²)
      </Select.Trigger>
      <Select.Content>
        {#each WOOD_BURNER_KWS as kw (kw)}
          <Select.Item value={String(kw)} label="{kw} kW (heats up to {WOOD_BURNER_SIZES[kw].m2Max} m²)" />
        {/each}
      </Select.Content>
    </Select.Root>
  </div>
  {#if burnerInfo}
    {#if burnerInfo.roofTopY !== null}
      <p>
        Flue rises through the ceiling and roof: about {metres.format(burnerInfo.flueLength)} m of pipe to the cowl on the roof.
      </p>
    {:else}
      <p class="text-amber-700">No roof above the wood burner for the chimney flue to exit through.</p>
    {/if}
  {/if}
{/if}

{#if spec.mount !== 'ceiling'}
  <div class="grid gap-1.5">
    <Label for="{id}-height">{spec.mount === 'wall' ? 'Height above floor (mm)' : 'Raised off the floor (mm)'}</Label>
    <Input
      id="{id}-height"
      type="number"
      min="0"
      step="50"
      value={Math.round(fixture.y * 1000)}
      onchange={(event) => setHeight(Number(event.currentTarget.value))}
    />
  </div>
{/if}

<script lang="ts">
  import type { Component } from 'svelte'
  import { Popover } from 'bits-ui'
  import { Button } from '$lib/components/ui/button'
  import { FIXTURES, fixtureSpec, type Trade } from '../../lib/model/fixtures'
  import type { FixtureKind } from '../../lib/model/types'
  import { cn } from '$lib/utils'

  // Lucide Icons for all fixtures
  import Plug from '@lucide/svelte/icons/plug'
  import ToggleLeft from '@lucide/svelte/icons/toggle-left'
  import Lightbulb from '@lucide/svelte/icons/lightbulb'
  import Sun from '@lucide/svelte/icons/sun'
  import ShieldAlert from '@lucide/svelte/icons/shield-alert'
  import Fan from '@lucide/svelte/icons/fan'
  import Cpu from '@lucide/svelte/icons/cpu'
  import Toilet from '@lucide/svelte/icons/toilet'
  import Faucet from '@lucide/svelte/icons/faucet'
  import ShowerHead from '@lucide/svelte/icons/shower-head'
  import Bath from '@lucide/svelte/icons/bath'
  import UtensilsCrossed from '@lucide/svelte/icons/utensils-crossed'
  import WashingMachine from '@lucide/svelte/icons/washing-machine'
  import Heater from '@lucide/svelte/icons/heater'
  import Cylinder from '@lucide/svelte/icons/cylinder'
  import CookingPot from '@lucide/svelte/icons/cooking-pot'
  import Flame from '@lucide/svelte/icons/flame'
  import AirVent from '@lucide/svelte/icons/air-vent'
  import Wind from '@lucide/svelte/icons/wind'
  import FlameKindling from '@lucide/svelte/icons/flame-kindling'
  import Droplets from '@lucide/svelte/icons/droplets'
  import ChevronDown from '@lucide/svelte/icons/chevron-down'
  import Zap from '@lucide/svelte/icons/zap'
  import Minus from '@lucide/svelte/icons/minus'
  import Plus from '@lucide/svelte/icons/plus'
  import Check from '@lucide/svelte/icons/check'

  let {
    fixtureKind,
    onFixtureKindChange,
    allowedKinds,
    placeSize,
    onStepPlaceSize,
  }: {
    fixtureKind: FixtureKind
    onFixtureKindChange: (kind: FixtureKind) => void
    allowedKinds?: FixtureKind[]
    placeSize?: { name: string } | null
    onStepPlaceSize?: (delta: 1 | -1) => void
  } = $props()

  let open = $state(false)
  let activeTradeFilter = $state<Trade | 'all'>('all')

  const ICONS: Record<FixtureKind, Component> = {
    socket: Plug,
    switch: ToggleLeft,
    light: Lightbulb,
    'outdoor-light': Sun,
    'stove-isolator': ShieldAlert,
    extractor: Fan,
    'db-board': Cpu,
    wc: Toilet,
    basin: Faucet,
    shower: ShowerHead,
    bath: Bath,
    sink: UtensilsCrossed,
    'washing-machine': WashingMachine,
    geyser: Heater,
    'solar-geyser': Sun,
    'water-tank': Cylinder,
    stove: CookingPot,
    'gas-stove': Flame,
    'gas-geyser': Flame,
    'gas-cylinder': Cylinder,
    'air-brick': AirVent,
    'aircon-indoor': Wind,
    'aircon-outdoor': Fan,
    'wood-burner': FlameKindling,
    'outside-tap': Droplets,
  }

  const TRADE_GROUPS: { id: Trade; name: string; icon: Component }[] = [
    { id: 'plumbing', name: 'Plumbing', icon: Droplets },
    { id: 'electrical', name: 'Electrical', icon: Zap },
    { id: 'gas', name: 'Gas', icon: Flame },
    { id: 'building', name: 'Building', icon: Wind },
  ]

  // Direct 1-click toolbar shortcuts for the most frequent fittings per trade
  const TRADE_SHORTCUTS: Record<Trade, FixtureKind[]> = {
    plumbing: ['wc', 'basin', 'shower', 'sink', 'outside-tap'],
    electrical: ['socket', 'switch', 'light', 'stove'],
    gas: ['gas-stove', 'gas-geyser', 'gas-cylinder'],
    building: ['aircon-indoor', 'wood-burner', 'air-brick', 'aircon-outdoor'],
  }

  const currentTrade = $derived(fixtureSpec(fixtureKind).trade)
  const ActiveIcon = $derived(ICONS[fixtureKind] ?? Plug)
  const activeSpec = $derived(fixtureSpec(fixtureKind))

  // Available trades based on allowedKinds (if specified)
  const availableTrades = $derived(
    TRADE_GROUPS.filter((group) =>
      FIXTURES.some((f) => f.trade === group.id && (!allowedKinds || allowedKinds.includes(f.id))),
    ),
  )

  // Direct shortcuts filtered by allowedKinds
  const shortcuts = $derived(
    (TRADE_SHORTCUTS[currentTrade] ?? []).filter((k) => !allowedKinds || allowedKinds.includes(k)),
  )

  function selectFixture(id: FixtureKind) {
    onFixtureKindChange(id)
    open = false
  }
</script>

<div class="flex items-center gap-1.5">
  <Popover.Root bind:open>
    <Popover.Trigger
      class="flex h-8 items-center gap-2 rounded-md border border-input bg-background px-2.5 text-xs font-medium shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
      aria-label="Choose fitting"
      title="Choose fitting: {activeSpec.name}"
    >
      <ActiveIcon class="size-3.5 text-primary shrink-0" />
      <span class="max-w-[130px] truncate">{activeSpec.name}</span>
      <ChevronDown class="size-3 text-muted-foreground opacity-60 ml-0.5" />
    </Popover.Trigger>

    <Popover.Portal>
      <Popover.Content
        sideOffset={6}
        align="start"
        collisionPadding={12}
        class="z-50 w-[420px] max-w-[calc(100vw-2rem)] rounded-lg border bg-popover p-3 shadow-xl outline-none"
      >
        <!-- Trade Filter Tabs -->
        <div class="flex items-center gap-1 border-b pb-2 mb-2 overflow-x-auto">
          <button
            type="button"
            class={cn(
              'rounded px-2 py-1 text-xs font-medium transition-colors',
              activeTradeFilter === 'all'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
            onclick={() => (activeTradeFilter = 'all')}
          >
            All
          </button>
          {#each availableTrades as group (group.id)}
            {@const GroupIcon = group.icon}
            <button
              type="button"
              class={cn(
                'flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors shrink-0',
                activeTradeFilter === group.id
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
              onclick={() => (activeTradeFilter = group.id)}
            >
              <GroupIcon class="size-3 shrink-0" />
              {group.name}
            </button>
          {/each}
        </div>

        <!-- Scrollable Sections Grid -->
        <div class="max-h-[340px] overflow-y-auto space-y-3 pr-1">
          {#each availableTrades as group (group.id)}
            {#if activeTradeFilter === 'all' || activeTradeFilter === group.id}
              {@const GroupIcon = group.icon}
              {@const items = FIXTURES.filter((f) => f.trade === group.id && (!allowedKinds || allowedKinds.includes(f.id)))}
              {#if items.length > 0}
                <div>
                  <div class="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 px-1">
                    <GroupIcon class="size-3 text-muted-foreground/80" />
                    <span>{group.name}</span>
                    <span class="text-[10px] text-muted-foreground/60 font-normal">({items.length})</span>
                  </div>
                  <div class="grid grid-cols-2 sm:grid-cols-3 gap-1">
                    {#each items as item (item.id)}
                      {@const ItemIcon = ICONS[item.id] ?? Plug}
                      {@const isSelected = item.id === fixtureKind}
                      <button
                        type="button"
                        class={cn(
                          'flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors group',
                          isSelected
                            ? 'bg-primary/10 font-semibold text-primary ring-1 ring-primary/40'
                            : 'text-foreground hover:bg-accent hover:text-accent-foreground',
                        )}
                        onclick={() => selectFixture(item.id)}
                        title="{item.name}: {item.text}"
                      >
                        <ItemIcon
                          class={cn(
                            'size-3.5 shrink-0 transition-colors',
                            isSelected ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground',
                          )}
                        />
                        <span class="truncate flex-1">{item.name}</span>
                        {#if isSelected}
                          <Check class="size-3 text-primary shrink-0" />
                        {/if}
                      </button>
                    {/each}
                  </div>
                </div>
              {/if}
            {/if}
          {/each}
        </div>

        <!-- Active Fitting Description Footer -->
        <div class="mt-2.5 pt-2 border-t text-[11px] text-muted-foreground leading-normal flex items-start gap-1.5">
          <ActiveIcon class="size-3.5 text-primary shrink-0 mt-0.5" />
          <div>
            <span class="font-medium text-foreground">{activeSpec.name}:</span>
            <span> {activeSpec.text}</span>
          </div>
        </div>
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>

  <!-- Quick 1-click Toolbar Shortcuts for the active trade -->
  {#if shortcuts.length > 0}
    <div class="hidden sm:flex items-center gap-0.5 border-l pl-1.5">
      {#each shortcuts as kind (kind)}
        {@const ShortcutIcon = ICONS[kind] ?? Plug}
        {@const spec = fixtureSpec(kind)}
        {@const isSelected = kind === fixtureKind}
        <Button
          variant={isSelected ? 'secondary' : 'ghost'}
          size="icon-sm"
          class={cn(
            'size-8 transition-colors',
            isSelected && 'bg-primary/15 text-primary font-semibold ring-1 ring-primary/30',
          )}
          title="Quick-select {spec.name}"
          aria-label={spec.name}
          onclick={() => onFixtureKindChange(kind)}
        >
          <ShortcutIcon class="size-3.5" />
        </Button>
      {/each}
    </div>
  {/if}

  <!-- Size Stepper (if applicable to chosen fixture) -->
  {#if placeSize && onStepPlaceSize}
    <div class="flex items-center gap-1 border-l pl-1.5" role="group" aria-label="Size">
      <Button variant="outline" size="icon-sm" title="Smaller (−)" aria-label="Smaller" onclick={() => onStepPlaceSize(-1)}>
        <Minus />
      </Button>
      <span class="min-w-16 text-center text-xs tabular-nums">{placeSize.name}</span>
      <Button variant="outline" size="icon-sm" title="Bigger (+)" aria-label="Bigger" onclick={() => onStepPlaceSize(1)}>
        <Plus />
      </Button>
    </div>
  {/if}
</div>

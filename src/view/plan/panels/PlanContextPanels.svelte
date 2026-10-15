<script lang="ts">
  import ContextPanel from '../../shared/ContextPanel.svelte'
  import FittingSetup from '../../shared/FittingSetup.svelte'
  import SwatchPicker from '$lib/components/project/SwatchPicker.svelte'
  import { Button } from '$lib/components/ui/button'
  import { Input } from '$lib/components/ui/input'
  import { Label } from '$lib/components/ui/label'
  import { Badge } from '$lib/components/ui/badge'
  import * as Select from '$lib/components/ui/select'
  import * as ToggleGroup from '$lib/components/ui/toggle-group'
  import Footprints from '@lucide/svelte/icons/footprints'
  import RotateCw from '@lucide/svelte/icons/rotate-cw'
  import BrickWall from '@lucide/svelte/icons/brick-wall'
  import SquareDashed from '@lucide/svelte/icons/square-dashed'
  import Droplets from '@lucide/svelte/icons/droplets'
  import Plug from '@lucide/svelte/icons/plug'
  import Mountain from '@lucide/svelte/icons/mountain'
  import ChefHat from '@lucide/svelte/icons/chef-hat'
  import CarFront from '@lucide/svelte/icons/car-front'
  import Grid2x2 from '@lucide/svelte/icons/grid-2x2'
  import Sprout from '@lucide/svelte/icons/sprout'
  import DoorClosed from '@lucide/svelte/icons/door-closed'
  import Maximize2 from '@lucide/svelte/icons/maximize-2'
  import Home from '@lucide/svelte/icons/home'

  import type {
    Document,
    Floor,
    Stair,
    Wall,
    Fixture,
    Space,
    RetainingWall,
    Counter,
    Carport,
    PavingArea,
    GardenBed,
    Roof,
    SewerType,
    WallSystemId,
    RetainingType,
    CounterTop,
    CarportRoof,
    PavingSurface,
    BedMaterial,
    RoomType,
    FloorFinish,
    RoofForm,
    RoofCovering,
    GutterType,
  } from '../../../lib/model/types'
  import { MAX_RISER_M, MIN_GOING_M, stairLayout } from '../../../lib/geometry/stairs'
  import { systemOf, WALL_SYSTEMS } from '../../../lib/model/systems'
  import { wallLength } from '../../../lib/model/geom'
  import {
    DRAIN_FALL,
    SEPTIC_CLEAR_BUILDING_M,
    SOAKAWAY_CLEAR_BUILDING_M,
    SOAKAWAY_CLEAR_BOUNDARY_M,
    SEPTIC_INLET_DEPTH_M,
    DEFAULT_SEWER_DEPTH_M,
    plumbingLayout,
  } from '../../../lib/geometry/plumbing'
  import type { electricalLayout } from '../../../lib/geometry/electrical'
  import { plotSide } from '../../../lib/geometry/roads'
  import { retainingSpec, RETAINING_ENGINEER_M, RETAINING_TYPES } from '../../../lib/model/retaining'
  import type { RetainingMeasure } from '../../../lib/geometry/retaining'
  import { counterKindSpec, COUNTER_TOPS } from '../../../lib/model/counters'
  import { counterIssues } from '../../../lib/geometry/counters'
  import { carportName, carportRoofSpec, CARPORT_BAYS, CARPORT_ROOFS, carportSize } from '../../../lib/model/carports'
  import type { carportIssues } from '../../../lib/geometry/carports'
  import { PAVING } from '../../../lib/geometry/paving'
  import { projectDefaults } from '../../../lib/model/defaults'
  import {
    bedArea,
    bedPerimeter,
    bedSoilVolume,
    bedMaterialSpec,
    DEFAULT_BED_MATERIAL,
    DEFAULT_RAISED_HEIGHT,
    BED_MATERIALS,
  } from '../../../lib/model/beds'
  import { isHabitable, roomTypeLabel, ROOM_TYPES, type Cell, type ResolvedSpace } from '../../../lib/geometry/spaces'
  import { floorFinishSpec } from '../../../lib/model/floorFinishes'
  import { COVERINGS, coveringOf, DEFAULT_COVERING } from '../../../lib/geometry/coverings'
  import { GUTTERS, gutterOf } from '../../../lib/geometry/gutters'
  import type { checksForSpace } from '../../../lib/geometry/sans'
  import type { FixtureSpec } from '../../../lib/model/fixtures'
  import type { fixtureWall } from '../../../lib/geometry/fixtures'
  import { documentStore } from '../../../lib/state/document.svelte'

  const ROOF_FORMS: Record<RoofForm, string> = { hip: 'Hip', gable: 'Gable', mono: 'Mono-pitch' }

  interface Props {
    document: Document
    roofFloor: Floor | null | undefined
    // Stair
    chosenStair: { floorId: string; stair: Stair; layout: ReturnType<typeof stairLayout> } | null
    turnChosenStair: () => void
    removeChosenStair: () => void
    patchChosenStair: (patch: Partial<Pick<Stair, 'width' | 'x' | 'z' | 'dx' | 'dz'>>) => void
    // Wall
    chosenWall: { floor: Floor; wall: Wall } | null
    onFocus?: (wallId: string) => void
    squareToSelectedWall: () => void
    removeChosenWall: () => void
    // Services
    selectedService: 'sewer' | 'water' | null
    showServices: boolean
    plumbing: ReturnType<typeof plumbingLayout>
    sewerProfile: ReturnType<typeof plumbingLayout>['profile'] | null
    straightenSelected: () => void
    // Fixture
    chosenFixture: { floorId: string; fixture: Fixture; spec: FixtureSpec; onWall: ReturnType<typeof fixtureWall> | null } | null
    shownCircuits: ReturnType<typeof electricalLayout>['circuits']
    wiring: ReturnType<typeof electricalLayout>
    removeChosenFixture: () => void
    // Plot Edge
    selectedEdge: number | null
    // Retaining
    chosenRetaining: { wall: RetainingWall; measure: RetainingMeasure } | null
    removeChosenRetaining: () => void
    // Counter
    chosenCounter: Counter | null
    patchChosenCounter: (patch: Partial<Omit<Counter, 'id'>>) => void
    removeChosenCounter: () => void
    // Carport
    chosenCarport: Carport | null
    turnChosenCarport: () => void
    removeChosenCarport: () => void
    carportWarnings: ReturnType<typeof carportIssues>
    // Paving
    chosenPaving: { apron: true; area: number; item?: undefined } | { apron: false; item: PavingArea; area: number } | null
    pavingOptions: { id: PavingSurface; name: string; swatch: string }[]
    removeChosenPaving: () => void
    // Bed
    chosenBed: GardenBed | null
    removeChosenBed: () => void
    // Room
    selectedRoom: { floorId: string; cell: Cell; resolved: ResolvedSpace | null } | null
    selectedChecks?: ReturnType<typeof checksForSpace>
    focusedRoom: string | null
    layOutRoom: (space: Space, rings: { x: number; z: number }[][]) => void
    leaveRoom: () => void
    suggestForSelectedRoom: () => void
    patchSelectedSpace: (patch: Partial<Pick<Space, 'name' | 'type' | 'finish' | 'open'>>) => void
    floorOptions: { id: FloorFinish; name: string; swatch: string | null; title?: string }[]
    selectedRoomFixtures: number
    newRoomType: RoomType
    onNewRoomTypeChange: (type: RoomType) => void
    nameSelectedRoom: () => void
    // Roof
    roofRooms: { floorId: string; space: Space }[]
    turnRoof: () => void
    setRoofForm: (form: RoofForm) => void
    setRoofCovering: (covering: RoofCovering) => void
    floorRoof: (floorId: string, roof: Roof) => void
    setRoofPitch: (pitch: number) => void
    setRoofEavesMm: (eavesMm: number) => void
    removeRoof: () => void
    addRoof: () => void
    // Selection & store results
    chooseSelection: (next: Record<string, unknown>) => void
    applyResult: (res: { ok: boolean; reason?: string }) => boolean
  }

  let {
    document,
    roofFloor,
    chosenStair,
    turnChosenStair,
    removeChosenStair,
    patchChosenStair,
    chosenWall,
    onFocus,
    squareToSelectedWall,
    removeChosenWall,
    selectedService,
    showServices,
    plumbing,
    sewerProfile,
    straightenSelected,
    chosenFixture,
    shownCircuits,
    wiring,
    removeChosenFixture,
    selectedEdge,
    chosenRetaining,
    removeChosenRetaining,
    chosenCounter,
    patchChosenCounter,
    removeChosenCounter,
    chosenCarport,
    turnChosenCarport,
    removeChosenCarport,
    carportWarnings,
    chosenPaving,
    pavingOptions,
    removeChosenPaving,
    chosenBed,
    removeChosenBed,
    selectedRoom,
    selectedChecks,
    focusedRoom,
    layOutRoom,
    leaveRoom,
    suggestForSelectedRoom,
    patchSelectedSpace,
    floorOptions,
    selectedRoomFixtures,
    newRoomType,
    onNewRoomTypeChange,
    nameSelectedRoom,
    roofRooms,
    turnRoof,
    setRoofForm,
    setRoofCovering,
    floorRoof,
    setRoofPitch,
    setRoofEavesMm,
    removeRoof,
    addRoof,
    chooseSelection,
    applyResult,
  }: Props = $props()

  const checkFormat = new Intl.NumberFormat('en-ZA', { maximumFractionDigits: 1 })
  const areaFormat = new Intl.NumberFormat('en-ZA', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
</script>

{#if chosenStair && !roofFloor}
  <ContextPanel
    label="Stair"
    tag="Stair"
    icon={Footprints}
    title="Stair flight"
    subtitle={`${chosenStair.layout.risers} risers · ${Math.round(chosenStair.layout.riser * 1000)} mm riser · ${checkFormat.format(chosenStair.layout.length)} m long`}
    onclose={() => chooseSelection({})}
  >
    {#snippet actions()}
      <Button class="w-full" variant="outline" onclick={turnChosenStair}><RotateCw />Turn around</Button>
      <Button class="w-full" variant="destructive" onclick={removeChosenStair}>Remove stair</Button>
    {/snippet}
    <p class="text-xs text-muted-foreground">
      Laid out to SANS 10400 Part M: risers at most {Math.round(MAX_RISER_M * 1000)} mm, goings at least {Math.round(
        MIN_GOING_M * 1000,
      )} mm.
    </p>
    <div class="grid gap-1.5">
      <Label for="stair-width">Width (mm)</Label>
      <Input
        id="stair-width"
        type="number"
        min="600"
        step="50"
        value={Math.round(chosenStair.stair.width * 1000)}
        onchange={(event) => patchChosenStair({ width: Number(event.currentTarget.value) / 1000 })}
      />
    </div>
  </ContextPanel>
{/if}

{#if chosenWall && !roofFloor}
  {@const wall = chosenWall.wall}
  {@const system = systemOf(wall)}
  {@const len = wallLength(chosenWall.floor.corners, wall.startCornerId, wall.endCornerId)}
  {@const openings = wall.openings.length}
  <ContextPanel
    label="Wall"
    tag={wall.skin === 'logical' ? 'Logical wall' : 'Wall'}
    title={wall.skin === 'logical' ? 'Logical wall' : system.name}
    subtitle={`${len.toFixed(2)} m · ${openings === 0 ? 'no openings' : `${openings} ${openings === 1 ? 'opening' : 'openings'}`}`}
    icon={wall.skin === 'logical' ? SquareDashed : BrickWall}
    description={wall.skin === 'logical' ? 'Divides rooms or carries fences/posts without building masonry.' : system.unitName}
    onclose={() => chooseSelection({})}
  >
    {#snippet actions()}
      <Button class="w-full" onclick={() => onFocus?.(wall.id)}>
        Open in Focus (Elevation)
      </Button>
      <Button class="w-full" variant="outline" onclick={squareToSelectedWall}>
        Square to this wall
      </Button>
    {/snippet}
    <div class="grid gap-2">
      {#if wall.skin !== 'logical'}
        <div class="grid gap-1.5">
          <Label>Wall system</Label>
          <Select.Root
            type="single"
            value={wall.systemId}
            onValueChange={(next) => next && applyResult(documentStore.setWallSystem(chosenWall.floor.id, wall.id, next as WallSystemId))}
          >
            <Select.Trigger class="w-full">{system.name}</Select.Trigger>
            <Select.Content>
              {#each WALL_SYSTEMS as opt (opt.id)}
                <Select.Item value={opt.id}>{opt.name}</Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
        </div>
      {/if}
      <p class="text-xs text-muted-foreground">Double-click a wall to open it directly in Focus (Elevation).</p>
      <Button variant="destructive" onclick={removeChosenWall}>
        {wall.skin === 'logical' ? 'Delete logical wall' : 'Delete wall'}
      </Button>
    </div>
  </ContextPanel>
{/if}

{#if selectedService && showServices && !roofFloor}
  <ContextPanel
    label={selectedService === 'sewer' ? 'Drain to the sewer' : 'Water main'}
    tag="Services"
    icon={Droplets}
    title={selectedService === 'sewer' ? (plumbing.septic ? 'Drain to septic tank' : 'Drain to municipal sewer') : 'Water main'}
    subtitle={selectedService === 'sewer'
      ? (sewerProfile ? `${checkFormat.format(sewerProfile.length)} m of 110 mm drain` : 'Drainage connection')
      : `${checkFormat.format(plumbing.waterMain)} m of 22 mm pipe`}
    onclose={() => chooseSelection({})}
  >
    {#snippet actions()}
      <Button class="w-full" variant="outline" onclick={straightenSelected}>Straighten the route</Button>
    {/snippet}

    {#if selectedService === 'sewer'}
      <div class="grid gap-1.5">
        <Label>Connects to</Label>
        <Select.Root
          type="single"
          value={document.services?.sewerType ?? 'municipal'}
          onValueChange={(next) => applyResult(documentStore.setSewerType(next as SewerType))}
        >
          <Select.Trigger class="w-full">{plumbing.septic ? 'Septic tank and soakaway' : 'Municipal sewer'}</Select.Trigger>
          <Select.Content>
            <Select.Item value="municipal" label="Municipal sewer" />
            <Select.Item value="septic" label="Septic tank and soakaway" />
          </Select.Content>
        </Select.Root>
      </div>
      {#if plumbing.septic}
        <p>
          A {plumbing.septic.litres.toLocaleString('en-ZA')} litre tank for {plumbing.septic.bedrooms}
          {plumbing.septic.bedrooms === 1 ? 'bedroom' : 'bedrooms'}, overflowing to a soakaway downhill. Drag either to move it.
        </p>
        <p class="text-xs text-muted-foreground">
          Rules of thumb: the tank {SEPTIC_CLEAR_BUILDING_M} m from buildings, the soakaway {SOAKAWAY_CLEAR_BUILDING_M} m from
          buildings and {SOAKAWAY_CLEAR_BOUNDARY_M} m from the boundary. Your municipality sets the real figures.
        </p>
      {/if}
      {#if sewerProfile}
        {@const last = sewerProfile.points.at(-1)!}
        <p>
          {checkFormat.format(sewerProfile.length)} m of 110 mm drain at 1 in {DRAIN_FALL[110]} or steeper, down to
          {checkFormat.format(sewerProfile.deepest)} m at its deepest.
        </p>
        {#if sewerProfile.shortBy > 0.005}
          <p class="text-amber-700">
            It reaches the connection {Math.round(sewerProfile.shortBy * 1000)} mm too low. Drag the connection to lower
            ground, bend the route over lower ground, or plan for a pump.
          </p>
        {:else}
          <p class="text-muted-foreground">
            It arrives {Math.round((last.ground - last.invert) * 1000)} mm below the ground, above the
            {plumbing.septic ? 'tank inlet' : 'sewer'} at
            {Math.round((plumbing.septic ? SEPTIC_INLET_DEPTH_M : (document.services?.sewerDepth ?? DEFAULT_SEWER_DEPTH_M)) * 1000)} mm.
          </p>
        {/if}
      {:else}
        <p class="text-muted-foreground">Place a toilet, basin, shower, bath or sink and the drain appears.</p>
      {/if}
      <div class="grid gap-1.5" hidden={plumbing.septic !== null}>
        <Label for="sewer-depth">Sewer depth at the connection (mm)</Label>
        <Input
          id="sewer-depth"
          type="number"
          min="300"
          step="50"
          value={Math.round((document.services?.sewerDepth ?? DEFAULT_SEWER_DEPTH_M) * 1000)}
          onchange={(event) => applyResult(documentStore.setSewerDepth(Number(event.currentTarget.value) / 1000))}
        />
      </div>
    {:else}
      <p>{checkFormat.format(plumbing.waterMain)} m of 22 mm pipe from the meter to the house, in a 450 mm trench.</p>
    {/if}
    <p class="text-xs text-muted-foreground">
      Drag the {selectedService === 'sewer' ? 'connection' : 'meter'} along the boundary, drag a + to add a bend, and Delete removes a selected bend.
    </p>
  </ContextPanel>
{/if}

{#if chosenFixture && !roofFloor}
  <ContextPanel
    label="Fitting"
    tag={chosenFixture.spec.trade === 'electrical' ? 'Electrical' : chosenFixture.spec.trade === 'plumbing' ? 'Plumbing' : 'Fitting'}
    icon={Plug}
    title={chosenFixture.spec.name}
    subtitle={chosenFixture.spec.text}
    onclose={() => chooseSelection({})}
  >
    {#snippet actions()}
      {#if chosenFixture.onWall}
        <Button class="w-full" variant="outline" onclick={() => chosenFixture?.onWall && onFocus?.(chosenFixture.onWall.wall.id)}>Show the wall in Focus</Button>
      {/if}
      <Button class="w-full" variant="destructive" onclick={removeChosenFixture}>Remove fitting</Button>
    {/snippet}

    {#if chosenFixture.fixture.kind === 'db-board'}
      <p>
        Feeds {wiring.circuits.length} {wiring.circuits.length === 1 ? 'circuit' : 'circuits'}{wiring.boardSize
          ? `; a ${wiring.boardSize}-way board.`
          : '.'}
      </p>
    {:else if shownCircuits[0]}
      {@const circuit = shownCircuits[0]}
      <p>
        On <span class="font-medium">{circuit.id}</span>, {circuit.name.toLowerCase()}: {circuit.breaker} A breaker,
        {circuit.cable} mm² cable, {circuit.points.length}
        {circuit.points.length === 1 ? 'point' : 'points'}, about {checkFormat.format(circuit.length)} m of cable.
      </p>
    {:else if chosenFixture.spec.trade === 'electrical' && chosenFixture.fixture.kind !== 'stove'}
      <p class="text-amber-700">Not on a circuit yet: place a distribution board.</p>
    {/if}
    <FittingSetup floorId={chosenFixture.floorId} fixture={chosenFixture.fixture} onresult={applyResult} />
  </ContextPanel>
{/if}

{#if selectedEdge !== null && !roofFloor}
  {@const side = plotSide(document.plot, selectedEdge)}
  {#if side}
    {@const onRoad = (document.plot.roads ?? []).includes(selectedEdge)}
    <ContextPanel
      label="Side of the plot"
      tag="Boundary"
      icon={SquareDashed}
      title="Side of the plot"
      subtitle="{checkFormat.format(side.length)} m along the boundary · facing {side.facing}"
      onclose={() => chooseSelection({})}
    >
      <div class="grid gap-1.5">
        <Label for="plot-road">Road access</Label>
        <Select.Root
          type="single"
          value={onRoad ? 'road' : 'none'}
          onValueChange={(next) => next && selectedEdge !== null && applyResult(documentStore.setPlotRoad(selectedEdge, next === 'road'))}
        >
          <Select.Trigger id="plot-road" size="sm" class="w-full">{onRoad ? 'On a road' : 'No road'}</Select.Trigger>
          <Select.Content>
            <Select.Item value="road" label="On a road" />
            <Select.Item value="none" label="No road" />
          </Select.Content>
        </Select.Root>
      </div>
      <p class="text-muted-foreground">
        {onRoad
          ? 'A street runs along this side: a grass verge, then the road. It is drawn for context; it is not costed.'
          : 'Mark the sides of the plot that are on a street. A corner plot has two.'}
      </p>
    </ContextPanel>
  {/if}
{/if}

{#if chosenRetaining && !roofFloor}
  {@const measure = chosenRetaining.measure}
  <ContextPanel
    label="Retaining wall"
    tag="Site"
    icon={Mountain}
    title={retainingSpec(chosenRetaining.wall.type).name}
    subtitle="{checkFormat.format(measure.length)} m long · holds back up to {checkFormat.format(measure.highest)} m"
    onclose={() => chooseSelection({})}
  >
    {#snippet estimate()}
      <table class="w-full text-xs">
        <tbody>
          <tr class="border-b border-border/40"><td class="py-1 text-muted-foreground">Length</td><td class="py-1 text-right font-medium tabular-nums">{checkFormat.format(measure.length)} m</td></tr>
          <tr class="border-b border-border/40">
            <td class="py-1 text-muted-foreground">Max height</td>
            <td class="py-1 text-right font-medium tabular-nums" class:text-amber-700={measure.highest > RETAINING_ENGINEER_M}>{checkFormat.format(measure.highest)} m</td>
          </tr>
          <tr><td class="py-1 text-muted-foreground">Average height</td><td class="py-1 text-right font-medium tabular-nums">{checkFormat.format(measure.average)} m</td></tr>
        </tbody>
      </table>
      {#if measure.highest > RETAINING_ENGINEER_M}
        <p class="text-xs text-amber-700">Over {RETAINING_ENGINEER_M} m of retained ground needs an engineer's design.</p>
      {/if}
    {/snippet}

    {#snippet actions()}
      <Button class="w-full" variant="destructive" onclick={removeChosenRetaining}>Remove retaining wall</Button>
    {/snippet}

    <div class="grid gap-1.5">
      <Label for="retaining-type">Built of</Label>
      <Select.Root
        type="single"
        value={chosenRetaining.wall.type}
        onValueChange={(next) => next && chosenRetaining && applyResult(documentStore.updateRetainingWall(chosenRetaining.wall.id, { type: next as RetainingType }))}
      >
        <Select.Trigger id="retaining-type" size="sm" class="w-full">{retainingSpec(chosenRetaining.wall.type).name}</Select.Trigger>
        <Select.Content>
          {#each RETAINING_TYPES as spec (spec.id)}
            <Select.Item value={spec.id} label={spec.name} />
          {/each}
        </Select.Content>
      </Select.Root>
    </div>
  </ContextPanel>
{/if}

{#if chosenCounter && !roofFloor}
  <ContextPanel
    label={chosenCounter.kind === 'cupboard' ? 'Cupboard' : 'Counter'}
    tag={chosenCounter.kind === 'cupboard' ? 'Cupboard' : 'Counter'}
    icon={ChefHat}
    title={counterKindSpec(chosenCounter.kind).name}
    subtitle="{Math.round(chosenCounter.length * 1000)} × {Math.round(chosenCounter.depth * 1000)} mm · {counterKindSpec(chosenCounter.kind).height * 1000} mm high"
    onclose={() => chooseSelection({})}
  >
    {#snippet actions()}
      <Button class="w-full" variant="destructive" onclick={removeChosenCounter}>
        {chosenCounter.kind === 'cupboard' ? 'Remove cupboard' : 'Remove counter'}
      </Button>
    {/snippet}

    {#if chosenCounter.kind !== 'cupboard'}
      <div class="grid gap-1.5">
        <Label>Worktop</Label>
        <SwatchPicker
          label="Worktop"
          options={COUNTER_TOPS.map((spec) => ({ id: spec.id, name: spec.name, swatch: spec.colour }))}
          value={chosenCounter.top}
          onchange={(next: string) => patchChosenCounter({ top: next as CounterTop })}
        />
      </div>
    {/if}
    <div class="grid grid-cols-2 gap-2">
      <div class="grid gap-1.5">
        <Label for="counter-length">Length (mm)</Label>
        <Input
          id="counter-length"
          type="number"
          min="300"
          step="50"
          value={Math.round(chosenCounter.length * 1000)}
          onchange={(event) => patchChosenCounter({ length: Number(event.currentTarget.value) / 1000 })}
        />
      </div>
      <div class="grid gap-1.5">
        <Label for="counter-depth">Depth (mm)</Label>
        <Input
          id="counter-depth"
          type="number"
          min="300"
          max="1500"
          step="50"
          value={Math.round(chosenCounter.depth * 1000)}
          onchange={(event) => patchChosenCounter({ depth: Number(event.currentTarget.value) / 1000 })}
        />
      </div>
    </div>
    {#if chosenCounter.kind === 'base'}
      <label class="flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          class="size-4 accent-primary"
          checked={chosenCounter.wallUnits ?? false}
          onchange={(event) => patchChosenCounter({ wallUnits: event.currentTarget.checked })}
        />
        Cupboards on the wall above
      </label>
    {/if}
    {#each counterIssues(document).filter((issue) => issue.id.startsWith(`counter:${chosenCounter?.id}:`)) as issue (issue.id)}
      <p class="text-xs text-amber-700">{issue.text}</p>
    {/each}
  </ContextPanel>
{/if}

{#if chosenCarport && !roofFloor}
  {@const size = carportSize(chosenCarport)}
  <ContextPanel
    label="Carport"
    tag="Carport"
    icon={CarFront}
    title={carportName(chosenCarport.bays)}
    subtitle="{size.wide.toFixed(2)} × {size.deep.toFixed(1)} m · {carportRoofSpec(chosenCarport.roof).text}"
    onclose={() => chooseSelection({})}
  >
    {#snippet actions()}
      <Button class="w-full" variant="outline" onclick={turnChosenCarport}>
        <RotateCw class="mr-1.5 size-4" />Turn a quarter turn
      </Button>
      <Button class="w-full" variant="destructive" onclick={removeChosenCarport}>Remove carport</Button>
    {/snippet}

    <div class="grid gap-1.5">
      <Label>Cars</Label>
      <ToggleGroup.Root
        type="single"
        variant="outline"
        size="sm"
        value={String(chosenCarport.bays)}
        onValueChange={(next) => next && chosenCarport && applyResult(documentStore.updateCarport(chosenCarport.id, { bays: Number(next) as Carport['bays'] }))}
        aria-label="How many cars"
      >
        {#each CARPORT_BAYS as bays (bays)}
          <ToggleGroup.Item value={String(bays)} class="flex-1">{bays === 1 ? 'Single' : bays === 2 ? 'Double' : 'Triple'}</ToggleGroup.Item>
        {/each}
      </ToggleGroup.Root>
    </div>
    <div class="grid gap-1.5">
      <Label for="carport-roof">Roof</Label>
      <Select.Root
        type="single"
        value={chosenCarport.roof}
        onValueChange={(next) => next && chosenCarport && applyResult(documentStore.updateCarport(chosenCarport.id, { roof: next as CarportRoof }))}
      >
        <Select.Trigger id="carport-roof" size="sm" class="w-full">{carportRoofSpec(chosenCarport.roof).name}</Select.Trigger>
        <Select.Content>
          {#each CARPORT_ROOFS as spec (spec.id)}
            <Select.Item value={spec.id} label={spec.name} />
          {/each}
        </Select.Content>
      </Select.Root>
    </div>
    {#each carportWarnings.filter((issue) => issue.carportId === chosenCarport?.id) as issue (issue.id)}
      <p class="text-xs text-amber-700">{issue.text}</p>
    {/each}
  </ContextPanel>
{/if}

{#if chosenPaving && !roofFloor}
  {@const surface: PavingSurface = chosenPaving.apron ? projectDefaults(document).apronSurface : chosenPaving.item.surface}
  <ContextPanel
    label="Paving"
    tag={chosenPaving.apron ? 'Apron' : 'Paving'}
    icon={Grid2x2}
    title={chosenPaving.apron ? 'Apron round the house' : `${PAVING[surface].name} paving`}
    subtitle="{checkFormat.format(chosenPaving.area)} m² · {PAVING[surface].text}"
    onclose={() => chooseSelection({})}
  >
    {#snippet actions()}
      <Button class="w-full" variant="destructive" onclick={removeChosenPaving}>{chosenPaving.apron ? 'No apron' : 'Remove paving'}</Button>
    {/snippet}

    <div class="grid gap-1.5">
      <Label>Surface</Label>
      <SwatchPicker
        label="Paving surface"
        options={pavingOptions}
        value={surface}
        onchange={(next: string) =>
          chosenPaving &&
          applyResult(
            chosenPaving.apron
              ? documentStore.setProjectDefaults({ apronSurface: next as PavingSurface })
              : documentStore.updatePaving(chosenPaving.item.id, { surface: next as PavingSurface }),
          )}
      />
    </div>
    {#if chosenPaving.apron}
      <div class="grid gap-1.5">
        <Label for="apron-width">Width (mm)</Label>
        <Input
          id="apron-width"
          type="number"
          min="0"
          max="3000"
          step="100"
          value={Math.round(projectDefaults(document).apronWidth * 1000)}
          onchange={(event) => applyResult(documentStore.setProjectDefaults({ apronWidth: Number(event.currentTarget.value) / 1000 }))}
        />
      </div>
      <p class="text-xs text-muted-foreground">Laid along every outside wall to carry rain clear of the foundations. It is set for the whole project.</p>
    {/if}
  </ContextPanel>
{/if}

{#if chosenBed && !roofFloor}
  {@const area = bedArea(chosenBed.ring)}
  {@const perim = bedPerimeter(chosenBed.ring)}
  {@const volume = bedSoilVolume(chosenBed)}
  {@const isRaised = chosenBed.height > 0.05}
  {@const mat = bedMaterialSpec(chosenBed.material)}
  <ContextPanel
    label="Garden bed"
    tag="Garden"
    icon={Sprout}
    title={isRaised ? `${mat.name} raised bed` : (chosenBed.material ? `Flower bed with ${mat.name.toLowerCase()} edging` : 'Flower bed')}
    subtitle="{checkFormat.format(area)} m² · {isRaised || chosenBed.material ? `${checkFormat.format(perim)} m ${isRaised ? 'perimeter' : 'edging'} · ` : ''}{checkFormat.format(volume)} m³ topsoil"
    onclose={() => chooseSelection({})}
  >
    {#snippet actions()}
      <Button class="w-full" variant="destructive" onclick={removeChosenBed}>Delete bed</Button>
    {/snippet}

    <div class="grid gap-1.5">
      <Label for="bed-height">Height (mm)</Label>
      <div class="flex items-center gap-2">
        <Input
          id="bed-height"
          type="number"
          min="0"
          max="1200"
          step="50"
          value={Math.round(chosenBed.height * 1000)}
          onchange={(event) => {
            const h = Math.max(0, Math.min(1.2, Number(event.currentTarget.value) / 1000))
            if (!chosenBed) return
            applyResult(
              documentStore.updateBed(chosenBed.id, {
                height: h,
                ...(h > 0.05 && !chosenBed.material ? { material: DEFAULT_BED_MATERIAL } : {}),
                ...(h <= 0.05 && chosenBed.height > 0.05 ? { material: undefined } : {}),
              }),
            )
          }}
        />
        <ToggleGroup.Root
          type="single"
          variant="outline"
          size="sm"
          value={chosenBed.height <= 0.05 ? 'ground' : 'raised'}
          onValueChange={(val) => {
            if (!chosenBed) return
            if (val === 'ground') applyResult(documentStore.updateBed(chosenBed.id, { height: 0, material: undefined }))
            else if (val === 'raised') applyResult(documentStore.updateBed(chosenBed.id, { height: DEFAULT_RAISED_HEIGHT, material: chosenBed.material ?? DEFAULT_BED_MATERIAL }))
          }}
        >
          <ToggleGroup.Item value="ground" title="In-ground flower bed">Flat</ToggleGroup.Item>
          <ToggleGroup.Item value="raised" title="Raised planter bed">Raised</ToggleGroup.Item>
        </ToggleGroup.Root>
      </div>
    </div>
    {#if chosenBed.height > 0.05}
      <div class="grid gap-1.5">
        <Label>Retaining wall material</Label>
        <Select.Root
          type="single"
          value={chosenBed.material ?? DEFAULT_BED_MATERIAL}
          onValueChange={(next) => next && chosenBed && applyResult(documentStore.updateBed(chosenBed.id, { material: next as BedMaterial }))}
        >
          <Select.Trigger size="sm" class="w-full" aria-label="Retaining wall material">
            <span class="flex items-center gap-2">
              <span class="inline-block size-4 shrink-0 rounded-sm border border-black/15" style:background={mat.colour}></span>
              {mat.name}
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
        <p class="text-xs text-muted-foreground">{mat.text}</p>
      </div>
    {:else}
      <div class="grid gap-1.5">
        <Label>Flush edging</Label>
        <Select.Root
          type="single"
          value={chosenBed.material ?? 'none'}
          onValueChange={(next) => chosenBed && applyResult(documentStore.updateBed(chosenBed.id, { material: next === 'none' ? undefined : (next as BedMaterial) }))}
        >
          <Select.Trigger size="sm" class="w-full" aria-label="Flush edging">
            <span class="flex items-center gap-2">
              {#if chosenBed.material}
                <span class="inline-block size-4 shrink-0 rounded-sm border border-black/15" style:background={mat.colour}></span>
                {mat.name}
              {:else}
                <span class="inline-block size-4 shrink-0 rounded-sm border border-black/15 bg-transparent"></span>
                No edging (lawn / earth edge)
              {/if}
            </span>
          </Select.Trigger>
          <Select.Content>
            <Select.Item value="none" label="No edging">No edging (lawn / earth edge)</Select.Item>
            {#each BED_MATERIALS as spec (spec.id)}
              <Select.Item value={spec.id} label={spec.name}>
                <span class="inline-block size-4 shrink-0 rounded-sm border border-black/15" style:background={spec.colour}></span>
                {spec.name}
              </Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
        {#if chosenBed.material}
          <p class="text-xs text-muted-foreground">{mat.text}</p>
        {/if}
      </div>
    {/if}
  </ContextPanel>
{/if}

{#if selectedRoom && !roofFloor}
  {@const resolved = selectedRoom.resolved}
  <ContextPanel
    label="Room"
    tag="Room"
    icon={DoorClosed}
    title={resolved ? resolved.space.name : 'Unnamed space'}
    subtitle={resolved ? `${areaFormat.format(resolved.area)} m² inside walls${resolved.cells.length > 1 ? ` · ${resolved.cells.length} parts` : ''}` : `${areaFormat.format(selectedRoom.cell.netArea)} m² inside walls`}
    onclose={() => chooseSelection({})}
  >
    {#snippet estimate()}
      {#if resolved}
        {#if selectedChecks}
          <div class="grid gap-1.5">
            <span class="text-xs font-semibold tracking-wide uppercase text-muted-foreground">SANS 10400 Checks</span>
            {#each selectedChecks.checks as item (item.id)}
              <div class="flex items-center justify-between gap-2 text-xs">
                <span class="text-muted-foreground">{item.label} (Part {item.part}):</span>
                <Badge
                  variant={item.ok ? 'secondary' : 'outline'}
                  class={item.ok ? 'text-[11px]' : 'border-amber-600/40 text-amber-700 text-[11px]'}
                >
                  {checkFormat.format(item.measured)}{item.unit === '%' ? '%' : ` ${item.unit}`} / min {checkFormat.format(item.required)}{item.unit === '%' ? '%' : ` ${item.unit}`}
                </Badge>
              </div>
            {/each}
          </div>
        {:else if !isHabitable(resolved.space.type)}
          <span class="text-xs text-muted-foreground">Not a habitable room; daylight and ventilation checks do not apply.</span>
        {/if}
      {/if}
    {/snippet}

    {#snippet actions()}
      {#if resolved}
        {#if focusedRoom !== resolved.space.id}
          <Button
            class="w-full"
            variant="outline"
            onclick={() => layOutRoom(resolved.space, resolved.cells.map((cell) => cell.ring))}
          >
            <Maximize2 class="mr-1.5 size-4" />Lay out this room (Focus)
          </Button>
        {:else}
          <Button
            class="w-full"
            variant="outline"
            onclick={leaveRoom}
          >
            <Maximize2 class="mr-1.5 size-4" />Whole plan (Esc)
          </Button>
        {/if}
        <Button class="w-full" variant="outline" onclick={suggestForSelectedRoom}>
          <Plug class="mr-1.5 size-4" />Suggest fittings
        </Button>
      {/if}
    {/snippet}

    {#if resolved}
      <div class="grid gap-1.5">
        <Label for="room-name">Name</Label>
        <Input
          id="room-name"
          value={resolved.space.name}
          onchange={(event) => patchSelectedSpace({ name: event.currentTarget.value })}
        />
      </div>
      <div class="grid gap-1.5">
        <Label>Use</Label>
        <Select.Root
          type="single"
          value={resolved.space.type}
          onValueChange={(next) => patchSelectedSpace({ type: next as RoomType })}
        >
          <Select.Trigger class="w-full">{roomTypeLabel(resolved.space.type)}</Select.Trigger>
          <Select.Content>
            {#each ROOM_TYPES as option (option.type)}
              <Select.Item value={option.type}>{option.label}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
      </div>
      <div class="grid gap-1.5">
        <div class="flex items-baseline justify-between gap-2">
          <Label>Floor finish</Label>
          <span class="text-muted-foreground">{floorFinishSpec(resolved.space.finish).name}</span>
        </div>
        <SwatchPicker
          label="Floor finish"
          options={floorOptions}
          value={resolved.space.finish}
          onchange={(next: string) => patchSelectedSpace({ finish: next as FloorFinish })}
          compact
        />
      </div>
      <label class="flex cursor-pointer items-start gap-2">
        <input
          type="checkbox"
          class="mt-0.5 size-4 accent-primary"
          checked={resolved.space.open ?? false}
          onchange={(event) => patchSelectedSpace({ open: event.currentTarget.checked })}
        />
        <span>
          Open to the sky
          <span class="block text-muted-foreground">A deck or a yard: no roof, ceiling or storey over it.</span>
        </span>
      </label>
      <p class="text-xs text-muted-foreground">
        {selectedRoomFixtures > 0
          ? `${selectedRoomFixtures} fittings in this room. Suggesting adds a fresh set.`
          : `Lights, switches, sockets and plumbing for a ${roomTypeLabel(resolved.space.type).toLowerCase()}.`}
      </p>
      <p class="text-xs text-muted-foreground">Shift-click a neighbouring part to join it, or one of its parts to split it off.</p>
    {:else}
      <p>
        <span class="text-lg font-semibold">{areaFormat.format(selectedRoom.cell.netArea)} m²</span>
        <span class="text-muted-foreground">inside the walls</span>
      </p>
      <div class="grid gap-1.5">
        <Label>Use</Label>
        <Select.Root
          type="single"
          value={newRoomType}
          onValueChange={(next) => next && onNewRoomTypeChange(next as RoomType)}
        >
          <Select.Trigger class="w-full">{roomTypeLabel(newRoomType)}</Select.Trigger>
          <Select.Content>
            {#each ROOM_TYPES as option (option.type)}
              <Select.Item value={option.type}>{option.label}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
      </div>
      <Button onclick={nameSelectedRoom}>Name this room</Button>
    {/if}
  </ContextPanel>
{/if}

{#if roofFloor}
  <ContextPanel
    label="Roof"
    tag="Roof"
    icon={Home}
    title="Roof structure"
    subtitle={roofFloor.roof ? `${ROOF_FORMS[roofFloor.roof.form ?? 'hip']} · ${roofFloor.roof.pitchDeg}° pitch` : 'Roof configuration'}
  >
    {#snippet actions()}
      {#if roofFloor.roof && (roofFloor.roof.form ?? 'hip') !== 'hip'}
        <Button class="w-full" variant="outline" onclick={turnRoof}>
          <RotateCw class="mr-1.5 size-4" />{roofFloor.roof.form === 'gable' ? 'Turn the ridge' : 'Turn the fall'}
        </Button>
      {/if}
    {/snippet}

    {#if roofFloor.roof}
      {@const roof = roofFloor.roof}
      <div class="grid gap-1.5">
        <Label>Form</Label>
        <Select.Root type="single" value={roof.form ?? 'hip'} onValueChange={(next) => setRoofForm(next as RoofForm)}>
          <Select.Trigger class="w-full">{ROOF_FORMS[roof.form ?? 'hip']}</Select.Trigger>
          <Select.Content>
            {#each Object.entries(ROOF_FORMS) as [form, label] (form)}
              <Select.Item value={form}>{label}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
      </div>
      <div class="grid gap-1.5">
        <Label>Covering</Label>
        <Select.Root
          type="single"
          value={roof.covering ?? DEFAULT_COVERING}
          onValueChange={(next) => setRoofCovering(next as RoofCovering)}
        >
          <Select.Trigger class="w-full">{coveringOf(roof).name}</Select.Trigger>
          <Select.Content>
            {#each COVERINGS as option (option.id)}
              <Select.Item value={option.id}>{option.name}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
      </div>
      <div class="grid gap-1.5">
        <Label>Gutters</Label>
        <Select.Root
          type="single"
          value={gutterOf(roof)}
          onValueChange={(next) => roofFloor && floorRoof(roofFloor.id, { ...roof, gutter: next as GutterType })}
        >
          <Select.Trigger class="w-full">{GUTTERS[gutterOf(roof)].name}</Select.Trigger>
          <Select.Content>
            {#each Object.entries(GUTTERS) as [id, spec] (id)}
              <Select.Item value={id} label={spec.name} />
            {/each}
          </Select.Content>
        </Select.Root>
        <p class="text-xs text-muted-foreground">
          Every eave gets one{roof.noGutter?.length ? `, except above ${roof.noGutter.length} ${roof.noGutter.length === 1 ? 'wall' : 'walls'}` : ''}. Take it off a wall in Focus.
        </p>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div class="grid gap-1.5">
          <Label for="roof-pitch">Pitch (°)</Label>
          <Input
            id="roof-pitch"
            type="number"
            min="1"
            max="89"
            step="1"
            value={roof.pitchDeg}
            onchange={(event) => setRoofPitch(Number(event.currentTarget.value))}
          />
        </div>
        <div class="grid gap-1.5">
          <Label for="roof-eaves">Eaves (mm)</Label>
          <Input
            id="roof-eaves"
            type="number"
            min="0"
            step="10"
            value={Math.round(roof.eaves * 1000)}
            onchange={(event) => setRoofEavesMm(Number(event.currentTarget.value))}
          />
        </div>
      </div>
      {#if roof.pitchDeg < coveringOf(roof).minPitchDeg}
        <p class="text-amber-700">
          {coveringOf(roof).name} usually need at least {coveringOf(roof).minPitchDeg}°. Check the manufacturer's
          minimum.
        </p>
      {/if}
      {#if roofRooms.length > 0}
        <!-- Which of the rooms below this roof are left out from under it. -->
        <div class="grid gap-1.5 border-t pt-3">
          <span class="font-medium">Open to the sky</span>
          <span class="text-muted-foreground">Tick a deck or a yard to leave it out from under the roof.</span>
          {#each roofRooms as room (room.space.id)}
            <label class="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                class="size-4 accent-primary"
                checked={room.space.open ?? false}
                onchange={(event) => applyResult(documentStore.updateSpace(room.floorId, room.space.id, { open: event.currentTarget.checked }))}
              />
              {room.space.name}
            </label>
          {/each}
        </div>
      {/if}
      <Button variant="destructive" onclick={removeRoof}>Remove roof</Button>
    {:else}
      <p class="text-muted-foreground">This storey is an empty plate on the walls below.</p>
      <Button onclick={addRoof}>Add roof</Button>
    {/if}
  </ContextPanel>
{/if}

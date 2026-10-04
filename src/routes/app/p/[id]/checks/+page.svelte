<script lang="ts">
  import { page } from '$app/state'
  import ChevronDown from '@lucide/svelte/icons/chevron-down'
  import ChevronRight from '@lucide/svelte/icons/chevron-right'
  import CircleCheck from '@lucide/svelte/icons/circle-check'
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert'
  import { Button } from '$lib/components/ui/button'
  import InfoTip from '$lib/components/project/InfoTip.svelte'
  import { buildingChecks, FENESTRATION_MAX_RATIO, type RoomCheck } from '$lib/geometry/sans'
  import { layoutSpaces, roomTypeLabel } from '$lib/geometry/spaces'
  import { electricalIssues, electricalLayout } from '$lib/geometry/electrical'
  import { plumbingLayout } from '$lib/geometry/plumbing'
  import { gasLayout } from '$lib/geometry/gas'
  import { finishIssues } from '$lib/geometry/finishes'
  import { counterIssues, counterTotals } from '$lib/geometry/counters'
  import { groundOf, measureRetaining, retainingIssues } from '$lib/geometry/retaining'
  import { RETAINING_ENGINEER_M } from '$lib/model/retaining'
  import { bottleSetup } from '$lib/model/fixtures'
  import { BATTERY_MODULE_KWH, powerLayout, suggestedPanels } from '$lib/geometry/power'
  import { planHref } from '$lib/routes/links'
  import { documentStore } from '$lib/state/document.svelte'
  import { statusLine } from '$lib/state/status.svelte'

  const id = $derived(page.params.id ?? '')
  const doc = $derived(documentStore.document)
  const checks = $derived(buildingChecks(doc))
  const electrical = $derived(electricalLayout(doc))
  const electricalProblems = $derived(electricalIssues(doc))
  const pipes = $derived(plumbingLayout(doc))
  const power = $derived(powerLayout(doc))
  const gas = $derived(gasLayout(doc))
  // Bare single-leaf outside walls, counted by storey.
  const dampWalls = $derived.by(() => {
    const issues = finishIssues(doc)
    return doc.building.floors
      .map((floor) => ({ floor, count: issues.filter((issue) => issue.floorId === floor.id).length }))
      .filter((item) => item.count > 0)
  })
  const longestHot = $derived(pipes.hot.reduce((most, run) => Math.max(most, run.length), 0))
  const cableTotal = $derived(electrical.circuits.reduce((sum, circuit) => sum + circuit.length, 0))

  const rows = $derived.by(() => {
    const out = []
    for (const floor of doc.building.floors) {
      const layout = layoutSpaces(floor)
      for (const resolved of layout.spaces) {
        const result = checks.rooms.find((room) => room.spaceId === resolved.space.id)
        out.push({ floor, resolved, result })
      }
    }
    return out.sort((a, b) => a.floor.index - b.floor.index || a.resolved.space.name.localeCompare(b.resolved.space.name))
  })

  const unnamed = $derived(doc.building.floors.reduce((sum, floor) => sum + layoutSpaces(floor).loose.length, 0))
  const short = $derived(checks.rooms.filter((room) => !room.ok).length)

  const number = new Intl.NumberFormat('en-ZA', { maximumFractionDigits: 1 })

  function value(check: RoomCheck): string {
    return check.unit === '%' ? `${number.format(check.measured)}%` : `${number.format(check.measured)} ${check.unit}`
  }

  function need(check: RoomCheck): string {
    return check.unit === '%' ? `${number.format(check.required)}%` : `${number.format(check.required)} ${check.unit}`
  }

  function storeyName(index: number): string {
    return index === 0 ? 'Ground' : `Storey ${index + 1}`
  }

  function floorIndex(floorId: string | undefined): number {
    return doc.building.floors.find((item) => item.id === floorId)?.index ?? 0
  }

  // One thing to attend to, with the storey it is on.
  type Issue = { id: string; text: string; storey: number | null }
  // One row of a sheet of facts: what it is, its figure, and a note on it.
  type Fact = { label: string; value: string; note?: string; warn?: boolean }

  const fenestrationOver = $derived(!!checks.fenestration && !checks.fenestration.ok)

  const roomIssues = $derived.by((): Issue[] => {
    const out: Issue[] = []
    for (const row of rows) {
      const failing = row.result?.checks.filter((check) => !check.ok) ?? []
      if (failing.length === 0) continue
      out.push({
        id: row.resolved.space.id,
        text: `${row.resolved.space.name} falls short on ${failing.map((check) => check.label.toLowerCase()).join(', ')}.`,
        storey: row.floor.index,
      })
    }
    if (fenestrationOver) {
      out.push({
        id: 'fenestration',
        text: `Glazing is more than ${Math.round(FENESTRATION_MAX_RATIO * 100)}% of the floor area, so Part XA needs a fenestration calculation.`,
        storey: null,
      })
    }
    return out
  })
  const electricalList = $derived(
    electricalProblems.map((issue): Issue => ({ id: issue.id, text: issue.text, storey: issue.floorId ? floorIndex(issue.floorId) : null })),
  )
  const powerList = $derived(power.warnings.map((warning): Issue => ({ id: warning.id, text: warning.text, storey: null })))
  const plumbingList = $derived(pipes.issues.map((issue): Issue => ({ id: issue.id, text: issue.text, storey: 0 })))
  const gasList = $derived(
    gas.issues.map((issue): Issue => ({ id: issue.id, text: issue.text, storey: issue.floorId ? floorIndex(issue.floorId) : null })),
  )
  const wallList = $derived(
    dampWalls.map(
      (item): Issue => ({
        id: item.floor.id,
        text: `${item.count === 1 ? 'One single-leaf outside wall is' : `${item.count} single-leaf outside walls are`} left exposed${
          doc.building.floors.length > 1 ? ` on ${item.floor.index === 0 ? 'the ground floor' : `storey ${item.floor.index + 1}`}` : ''
        }. Change the finish on the Project page, or wall by wall in Focus.`,
        storey: item.floor.index,
      }),
    ),
  )

  const kitchenList = $derived(counterIssues(doc).map((issue): Issue => ({ id: issue.id, text: issue.text, storey: floorIndex(issue.floorId) })))
  const joinery = $derived(counterTotals(doc))
  const counterLength = $derived(joinery.units.base + joinery.units.island + joinery.units.bar)
  const retainingList = $derived(retainingIssues(doc).map((issue): Issue => ({ id: issue.id, text: issue.text, storey: null })))
  // Every retaining wall together: how much of it there is and the most any of it holds back.
  const retained = $derived.by(() => {
    const walls = doc.retaining ?? []
    if (walls.length === 0) return null
    const ground = groundOf(doc)
    const measures = walls.map((wall) => measureRetaining(wall, ground))
    return {
      count: walls.length,
      length: measures.reduce((sum, measure) => sum + measure.length, 0),
      highest: Math.max(...measures.map((measure) => measure.highest)),
    }
  })
  const hasGas = $derived(gas.appliances.length > 0 || gas.cylinders.length > 0)
  const hasWalls = $derived(doc.building.floors.some((floor) => floor.walls.some((wall) => wall.skin !== 'logical')))

  // The sections down the page, each with what it has to attend to, or why it has nothing to show yet.
  const sections = $derived([
    { id: 'rooms', title: 'Rooms', issues: roomIssues, empty: rows.length === 0 ? 'No rooms named' : null },
    { id: 'electrical', title: 'Electrical', issues: electricalList, empty: electrical.circuits.length === 0 ? 'No circuits yet' : null },
    { id: 'backup', title: 'Load shedding and solar', issues: powerList, empty: electrical.circuits.length === 0 ? 'No circuits yet' : null },
    { id: 'plumbing', title: 'Plumbing', issues: plumbingList, empty: !pipes.exit && !pipes.rain ? 'No fittings yet' : null },
    { id: 'gas', title: 'Gas', issues: gasList, empty: hasGas ? null : 'No gas fittings' },
    { id: 'kitchens', title: 'Kitchens', issues: kitchenList, empty: counterLength > 0 ? null : 'No counters yet' },
    { id: 'retaining', title: 'Retaining walls', issues: retainingList, empty: retained ? null : 'None drawn' },
    { id: 'walls', title: 'Wall finishes', issues: wallList, empty: hasWalls ? null : 'No walls yet' },
  ])
  const total = $derived(sections.reduce((sum, section) => sum + section.issues.length, 0))
  const sectionOf = (key: string) => sections.find((section) => section.id === key) ?? sections[0]

  // Sections folded away, by id.
  let folded = $state<string[]>([])
  function fold(key: string) {
    folded = folded.includes(key) ? folded.filter((item) => item !== key) : [...folded, key]
  }
  function open(key: string) {
    folded = folded.filter((item) => item !== key)
  }

  const electricalFacts = $derived<Fact[]>([
    { label: 'Circuits', value: String(electrical.circuits.length) },
    {
      label: 'Board',
      value: electrical.boardSize ? `${electrical.boardSize}-way` : 'Over 36 ways',
      note: `${electrical.ways} ways used, with main switch and earth leakage`,
    },
    { label: 'Cable', value: `${number.format(cableTotal)} m`, note: 'Before waste' },
  ])

  const backupFacts = $derived<Fact[]>([
    {
      label: 'Inverter',
      value: power.inverterKva ? `${power.inverterKva} kVA` : '–',
      note: `Peak essential load about ${number.format(power.peak / 1000)} kW`,
    },
    {
      label: 'Battery',
      value: `${number.format(power.batteryModules * BATTERY_MODULE_KWH)} kWh`,
      note: `${power.batteryModules} × ${BATTERY_MODULE_KWH} kWh for ${power.hours} hours at about ${Math.round(power.running)} W`,
    },
    {
      label: 'Solar',
      value: `${number.format(power.kwp)} kWp`,
      note:
        power.panels > 0
          ? `${power.panels} panels, about ${Math.round(power.yearly).toLocaleString('en-ZA')} kWh a year`
          : power.capacity > 0
            ? `Room for ${power.capacity} panels on the sunnier roof faces`
            : 'Add a roof to lay out panels',
    },
  ])

  const plumbingFacts = $derived.by((): Fact[] => {
    const out: Fact[] = []
    if (pipes.exit) {
      const profile = pipes.profile
      const short = !!profile && profile.shortBy > 0.005
      out.push({
        label: pipes.septic ? 'Drain to the septic tank' : 'Drain to the sewer',
        value: profile ? `${number.format(profile.length)} m` : '–',
        note: profile
          ? short
            ? `Arrives ${Math.round(profile.shortBy * 1000)} mm below the sewer`
            : `Falls into the ${pipes.septic ? 'tank' : 'sewer'}; ${number.format(profile.deepest)} m at its deepest`
          : 'No drains yet',
        warn: short,
      })
      out.push({ label: 'Water main', value: `${number.format(pipes.waterMain)} m`, note: 'From the meter to the house' })
      out.push({
        label: 'Longest hot run',
        value: longestHot ? `${number.format(longestHot)} m` : '–',
        note: 'From the geyser to the furthest hot tap',
      })
    }
    if (pipes.septic) {
      out.push({
        label: 'Septic tank',
        value: `${pipes.septic.litres.toLocaleString('en-ZA')} L`,
        note: `For ${pipes.septic.bedrooms} ${pipes.septic.bedrooms === 1 ? 'bedroom' : 'bedrooms'}, overflowing to a soakaway. The local authority approves the size and position.`,
      })
    }
    if (pipes.rain) {
      const rain = pipes.rain
      out.push({
        label: 'Rainwater off the roof',
        value: `${Math.round(rain.yearly / 1000).toLocaleString('en-ZA')} kL a year`,
        note: `${number.format(rain.catchment)} m² of roof at ${rain.rainfall} mm of rain.`,
      })
      out.push({
        label: 'Rainwater tanks',
        value: rain.tanks > 0 ? `${rain.litres.toLocaleString('en-ZA')} L` : 'None',
        note:
          rain.tanks > 0
            ? `${rain.tanks} ${rain.tanks === 1 ? 'tank fills' : 'tanks fill'} from ${number.format(rain.fillMm)} mm of rain.`
            : `About ${(Math.ceil(rain.stormLitres / 500) * 500).toLocaleString('en-ZA')} L of tanks would hold a 25 mm storm. Add one under a downpipe with the Fittings tool.`,
      })
    }
    return out
  })

  const gasFacts = $derived<Fact[]>([
    {
      label: 'Appliances',
      value: String(gas.appliances.length),
      note: gas.appliances.map((item) => (item.fixture.kind === 'gas-stove' ? 'stove' : 'geyser')).join(', ') || 'None yet',
    },
    {
      label: 'Copper pipe',
      value: gas.runs.length > 0 ? `${number.format(gas.length)} m` : '–',
      note: '15 mm, along the outside walls and in to each appliance',
    },
    {
      label: 'Gas bottles',
      value:
        gas.cylinders.length > 0
          ? gas.cylinders.map((item) => `${bottleSetup(item.fixture).count} × ${bottleSetup(item.fixture).kg} kg`).join(', ')
          : '–',
      note: 'Two or more on a changeover regulator, so one can be swapped while the other runs',
    },
  ])

  $effect(() => {
    statusLine.clear()
  })
</script>

{#snippet heading(key: string, note: string)}
  {@const section = sectionOf(key)}
  {@const shut = folded.includes(key)}
  <h2 id="checks-{key}" class="sticky top-0 z-10 flex items-center gap-1.5 border-b bg-muted px-3 text-[13px]">
    <button type="button" class="flex items-center gap-2 py-1.5 text-left" aria-expanded={!shut} onclick={() => fold(key)}>
      {#if shut}<ChevronRight class="size-3.5 shrink-0" />{:else}<ChevronDown class="size-3.5 shrink-0" />{/if}
      <span class="font-semibold">{section.title}</span>
    </button>
    <InfoTip label="About {section.title.toLowerCase()}">{note}</InfoTip>
    <button type="button" class="flex flex-1 justify-end py-1.5" tabindex="-1" aria-hidden="true" onclick={() => fold(key)}>
      {@render state(section)}
    </button>
  </h2>
{/snippet}

{#snippet state(section: { issues: Issue[]; empty: string | null })}
  {#if section.issues.length > 0}
    <span class="ml-auto flex items-center gap-1 font-medium text-amber-700">
      <TriangleAlert class="size-3.5" />{section.issues.length} to attend to
    </span>
  {:else if section.empty}
    <span class="ml-auto font-normal text-muted-foreground">{section.empty}</span>
  {:else}
    <span class="ml-auto flex items-center gap-1 font-normal text-muted-foreground"><CircleCheck class="size-3.5" />In order</span>
  {/if}
{/snippet}

{#snippet attend(issues: Issue[])}
  {#if issues.length > 0}
    <ul class="border-b text-[13px]">
      {#each issues as issue (issue.id)}
        <li class="flex items-start gap-2 border-b border-amber-600/15 bg-amber-500/10 px-3 py-1.5 last:border-b-0">
          <TriangleAlert class="mt-0.5 size-3.5 shrink-0 text-amber-700" />
          <span class="min-w-0 flex-1">{issue.text}</span>
          {#if issue.storey !== null}
            <a class="shrink-0 font-medium underline-offset-2 hover:underline" href={planHref(id, issue.storey, issue.id.startsWith('space-') ? issue.id : undefined)}>
              Show on plan
            </a>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
{/snippet}

{#snippet facts(items: Fact[])}
  <table class="sheet still">
    <tbody>
      {#each items as item (item.label)}
        <tr>
          <td class="label w-44 sm:w-56">{item.label}</td>
          <td class="w-32 font-medium tabular-nums sm:w-44" class:warn={item.warn}>{item.value}</td>
          <td class="text-muted-foreground">{item.note ?? ''}</td>
        </tr>
      {/each}
    </tbody>
  </table>
{/snippet}

<div class="flex h-full flex-col">
  <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b bg-background px-3 py-1.5 text-sm">
    <p class="flex items-center gap-1.5">
      {#if total > 0}
        <TriangleAlert class="size-4 text-amber-700" />
        <span class="text-base font-semibold tabular-nums">{total}</span>
        <span class="text-muted-foreground">{total === 1 ? 'thing' : 'things'} to attend to</span>
      {:else}
        <CircleCheck class="size-4 text-muted-foreground" />
        <span class="font-medium">Nothing to attend to</span>
      {/if}
    </p>
    <InfoTip label="About these checks">
      <p>Measured from the drawing against the deemed-to-satisfy rules, as a guide. Confirm against the standards.</p>
      <p>Tinted cells are worked out; white cells take your figures. An amber cell or line is something to attend to.</p>
      <p>Registered electricians, plumbers and gas installers design and certify their own work.</p>
    </InfoTip>
  </div>
  <div class="flex min-h-0 flex-1 flex-col max-lg:overflow-auto lg:flex-row">
    <div class="min-h-0 flex-1 bg-background max-lg:flex-none lg:overflow-auto">
      <section aria-labelledby="checks-rooms">
        {@render heading('rooms', 'Deemed-to-satisfy rules from SANS 10400 for each habitable room: daylight and ventilation (Part O), floor area and width (Part C), and glazing against floor area for the whole house (Part XA).')}
        {#if !folded.includes('rooms')}
          {@render attend(roomIssues)}
          {#if rows.length === 0}
            <p class="border-b px-3 py-3 text-[13px] text-muted-foreground">Name the rooms on the plan and their checks appear here.</p>
          {:else}
            <table class="sheet still">
              <thead>
                <tr>
                  <th class="min-w-36 text-left">Room</th>
                  <th class="text-left max-md:hidden">Use</th>
                  <th class="text-left max-md:hidden">Storey</th>
                  <th class="text-right">Area</th>
                  <th class="text-right">Daylight (O)</th>
                  <th class="text-right">Ventilation (O)</th>
                  <th class="text-right">Floor area (C)</th>
                  <th class="text-right">Width (C)</th>
                  <th class="w-28"></th>
                </tr>
              </thead>
              <tbody>
                {#each rows as row (row.resolved.space.id)}
                  <tr>
                    <td class="font-medium">
                      {row.resolved.space.name}
                      <div class="text-xs font-normal text-muted-foreground md:hidden">
                        {roomTypeLabel(row.resolved.space.type)} · {storeyName(row.floor.index)}
                      </div>
                    </td>
                    <td class="text-muted-foreground max-md:hidden">{roomTypeLabel(row.resolved.space.type)}</td>
                    <td class="text-muted-foreground max-md:hidden">{storeyName(row.floor.index)}</td>
                    <td class="text-right whitespace-nowrap tabular-nums">{number.format(row.resolved.area)} m²</td>
                    {#if row.result}
                      {#each row.result.checks as check (check.id)}
                        <td class="text-right whitespace-nowrap tabular-nums" class:warn={!check.ok} title="{check.label}: needs {need(check)}">
                          {#if !check.ok}<TriangleAlert class="mr-1 inline size-3.5 align-[-2px]" /><span class="sr-only">Falls short:</span>{/if}
                          {value(check)}
                          <span class="ml-1 text-xs {check.ok ? 'text-muted-foreground' : ''}">min {need(check)}</span>
                        </td>
                      {/each}
                    {:else}
                      <td colspan="4" class="text-muted-foreground">Not a habitable room, so not checked.</td>
                    {/if}
                    <td class="text-right">
                      <a class="font-medium underline-offset-2 hover:underline" href={planHref(id, row.floor.index, row.resolved.space.id)}>Show on plan</a>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
            {@render facts([
              { label: 'Habitable rooms', value: String(checks.rooms.length), note: short > 0 ? `${short} falling short` : 'All meet the rules above' },
              {
                label: 'Glazing to floor area (XA)',
                value: checks.fenestration ? `${number.format(checks.fenestration.ratio * 100)}%` : '–',
                note: `Above ${Math.round(FENESTRATION_MAX_RATIO * 100)}% needs a fenestration calculation.`,
                warn: fenestrationOver,
              },
              ...(unnamed > 0
                ? [{ label: 'Not in a named room', value: `${unnamed} ${unnamed === 1 ? 'part' : 'parts'}`, note: 'Not checked. Name them on the plan.' }]
                : []),
            ])}
          {/if}
        {/if}
      </section>

      <section aria-labelledby="checks-electrical">
        {@render heading('electrical', 'Circuits laid out from the fittings on the plan, as a guide to cost. A registered electrician designs the installation to SANS 10142-1 and issues the certificate of compliance.')}
        {#if !folded.includes('electrical')}
          {@render attend(electricalList)}
          {#if electrical.circuits.length === 0}
            <p class="border-b px-3 py-3 text-[13px] text-muted-foreground">
              {electrical.board
                ? 'Add lights, sockets or a stove isolator and their circuits appear here.'
                : 'Place a distribution board with the Fittings tool, or suggest fittings for a room with an outside door, and the circuits appear here.'}
            </p>
          {:else}
            <table class="sheet still">
              <thead>
                <tr>
                  <th class="w-12 text-left">No.</th>
                  <th class="min-w-36 text-left">Circuit</th>
                  <th class="text-right">Breaker</th>
                  <th class="text-right">Cable</th>
                  <th class="text-right">Points</th>
                  <th class="text-right">Run</th>
                  <th class="w-28 text-center">On backup</th>
                </tr>
              </thead>
              <tbody>
                {#each electrical.circuits as circuit (circuit.id)}
                  <tr>
                    <td class="rownum">{circuit.id}</td>
                    <td class="font-medium">{circuit.name}</td>
                    <td class="text-right tabular-nums">{circuit.breaker} A</td>
                    <td class="text-right tabular-nums">{circuit.cable} mm²</td>
                    <td class="text-right tabular-nums">{circuit.points.length}</td>
                    <td class="text-right tabular-nums">{number.format(circuit.length)} m</td>
                    <td class="cell">
                      <label class="grid min-h-7 cursor-pointer place-items-center">
                        <input
                          type="checkbox"
                          class="size-4 accent-primary"
                          aria-label="Keep {circuit.name} on when the power goes off"
                          checked={(doc.services?.essential ?? []).includes(circuit.id)}
                          onchange={(event) => documentStore.setEssential(circuit.id, event.currentTarget.checked)}
                        />
                      </label>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
            {@render facts(electricalFacts)}
          {/if}
        {/if}
      </section>

      <section aria-labelledby="checks-backup">
        {@render heading('backup', 'Tick the circuits to keep on when the power goes off, under On backup in the circuits above. The inverter and battery are sized from rough loads for each kind of circuit; a solar installer sizes the real system.')}
        {#if !folded.includes('backup')}
          {@render attend(powerList)}
          {#if electrical.circuits.length === 0}
            <p class="border-b px-3 py-3 text-[13px] text-muted-foreground">Circuits come first: place a distribution board and some fittings.</p>
          {:else}
            <table class="sheet still">
              <tbody>
                <tr>
                  <td class="label w-44 sm:w-56">Circuits on backup</td>
                  <td class="w-32 font-medium tabular-nums sm:w-44">{power.essential.length} of {electrical.circuits.length}</td>
                  <td class="text-muted-foreground">
                    {power.essential.length > 0 ? power.essential.map((circuit) => circuit.id).join(', ') : 'None ticked yet'}
                  </td>
                </tr>
                <tr>
                  <td class="label"><label for="backup-hours">Hours of backup</label></td>
                  <td class="cell">
                    <input
                      id="backup-hours"
                      type="number"
                      min="1"
                      max="24"
                      value={power.hours}
                      onchange={(event) => documentStore.setBackupHours(Number(event.currentTarget.value))}
                    />
                  </td>
                  <td class="text-muted-foreground">How long the battery carries the ticked circuits</td>
                </tr>
                <tr>
                  <td class="label"><label for="solar-panels">Solar panels</label></td>
                  <td class="cell">
                    <input
                      id="solar-panels"
                      type="number"
                      min="0"
                      max={power.capacity}
                      value={doc.services?.solarPanels ?? 0}
                      onchange={(event) => documentStore.setSolarPanels(Math.max(0, Math.round(Number(event.currentTarget.value))))}
                    />
                  </td>
                  <td class="text-muted-foreground">
                    Up to {power.capacity} fit on the sunnier roof faces.
                    {#if power.essential.length > 0 && power.capacity > 0 && suggestedPanels(power) !== (doc.services?.solarPanels ?? 0)}
                      <Button variant="outline" size="sm" class="ml-1 h-6 px-2 text-xs" onclick={() => documentStore.setSolarPanels(suggestedPanels(power))}>
                        Use {suggestedPanels(power)}
                      </Button>
                    {/if}
                  </td>
                </tr>
              </tbody>
            </table>
            {#if power.essential.length > 0 || power.panels > 0}
              {@render facts(backupFacts)}
            {/if}
          {/if}
        {/if}
      </section>

      <section aria-labelledby="checks-plumbing">
        {@render heading('plumbing', 'Drainage and supply worked out from the fittings and the ground levels. A plumber confirms the design against SANS 10400-P and SANS 10252.')}
        {#if !folded.includes('plumbing')}
          {@render attend(plumbingList)}
          {#if !pipes.exit}
            <p class="border-b px-3 py-3 text-[13px] text-muted-foreground">
              Place a toilet, basin, shower, bath or sink and the drainage and water supply appear here.
            </p>
          {/if}
          {#if plumbingFacts.length > 0}
            {@render facts(plumbingFacts)}
          {/if}
        {/if}
      </section>

      <section aria-labelledby="checks-gas">
        {@render heading('gas', 'LP gas from bottles outside, piped in copper round the house. A registered gas installer lays it to SANS 10087-1 and issues a certificate of conformity.')}
        {#if !folded.includes('gas')}
          {@render attend(gasList)}
          {#if hasGas}
            {@render facts(gasFacts)}
          {:else}
            <p class="border-b px-3 py-3 text-[13px] text-muted-foreground">Place a gas stove, a gas geyser or bottles with the Fittings tool and the gas run appears here.</p>
          {/if}
        {/if}
      </section>

      <section aria-labelledby="checks-kitchens">
        {@render heading('kitchens', 'Counters against the fittings that stand between them. A stove or a washing machine stands in a gap in the counter; a sink comes in its own unit, which a counter runs on from.')}
        {#if !folded.includes('kitchens')}
          {@render attend(kitchenList)}
          {#if counterLength > 0}
            {@render facts([
              { label: 'Counters', value: `${number.format(counterLength)} m`, note: [joinery.units.island > 0 ? 'with an island' : '', joinery.units.bar > 0 ? 'with a bar' : ''].filter(Boolean).join(', ') },
              { label: 'Wall cupboards', value: joinery.wallUnits > 0 ? `${number.format(joinery.wallUnits)} m` : 'None' },
            ])}
          {:else}
            <p class="border-b px-3 py-3 text-[13px] text-muted-foreground">Draw counters with the Counters tool on the plan and they are checked here.</p>
          {/if}
        {/if}
      </section>

      <section aria-labelledby="checks-retaining">
        {@render heading('retaining', `What each wall holds back is read from the ground as it lies, a metre to either side. Up to ${RETAINING_ENGINEER_M} m a builder can take on; over that the wall needs an engineer's design, and every one needs a drain behind it.`)}
        {#if !folded.includes('retaining')}
          {@render attend(retainingList)}
          {#if retained}
            {@render facts([
              { label: 'Retaining walls', value: `${number.format(retained.length)} m`, note: retained.count === 1 ? 'one wall' : `${retained.count} walls` },
              { label: 'Most held back', value: `${number.format(retained.highest)} m` },
            ])}
          {:else}
            <p class="border-b px-3 py-3 text-[13px] text-muted-foreground">Draw a retaining wall with the Retaining tool on the plan and it is checked here.</p>
          {/if}
        {/if}
      </section>

      <section aria-labelledby="checks-walls">
        {@render heading('walls', 'SANS 10400-K expects an outside wall to keep the rain out. One leaf of bare block or brick does not, so it is plastered, or bagged and painted.')}
        {#if !folded.includes('walls')}
          {@render attend(wallList)}
          {#if wallList.length === 0}
            <p class="border-b px-3 py-3 text-[13px] text-muted-foreground">
              {hasWalls ? 'No single-leaf outside wall is left exposed.' : 'Draw some walls and their finishes are checked here.'}
            </p>
          {/if}
        {/if}
      </section>
    </div>
    <aside class="grid shrink-0 content-start gap-3 border-t bg-muted/40 p-3 text-sm max-lg:hidden lg:w-72 lg:overflow-auto lg:border-t-0 lg:border-l">
      <nav aria-label="Checks">
        <h2 class="mb-1 font-semibold">On this page</h2>
        <ul class="overflow-hidden rounded-md border bg-background text-[13px]">
          {#each sections as section (section.id)}
            <li class="border-b last:border-b-0">
              <a class="flex items-center gap-2 px-2 py-1 hover:bg-muted" href="#checks-{section.id}" onclick={() => open(section.id)}>
                <span>{section.title}</span>
                {@render state(section)}
              </a>
            </li>
          {/each}
        </ul>
      </nav>
    </aside>
  </div>
</div>

<script lang="ts">
  import { page } from '$app/state'
  import { Badge } from '$lib/components/ui/badge'
  import { Button } from '$lib/components/ui/button'
  import * as Card from '$lib/components/ui/card'
  import * as Table from '$lib/components/ui/table'
  import { buildingChecks, FENESTRATION_MAX_RATIO, type RoomCheck } from '$lib/geometry/sans'
  import { layoutSpaces, roomTypeLabel } from '$lib/geometry/spaces'
  import { electricalIssues, electricalLayout } from '$lib/geometry/electrical'
  import { plumbingLayout } from '$lib/geometry/plumbing'
  import { planHref } from '$lib/routes/links'
  import { documentStore } from '$lib/state/document.svelte'
  import { statusLine } from '$lib/state/status.svelte'

  const id = $derived(page.params.id ?? '')
  const doc = $derived(documentStore.document)
  const checks = $derived(buildingChecks(doc))
  const electrical = $derived(electricalLayout(doc))
  const electricalProblems = $derived(electricalIssues(doc))
  const pipes = $derived(plumbingLayout(doc))
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

  $effect(() => {
    statusLine.clear()
  })
</script>

<div class="h-full overflow-auto">
  <div class="mx-auto flex max-w-5xl flex-col gap-4 p-4 sm:p-6">
    <div>
      <h1 class="text-lg font-semibold">Checks</h1>
      <p class="text-sm text-muted-foreground">
        Deemed-to-satisfy rules from SANS 10400, measured from the drawing. Treat them as a guide and confirm against the
        standard.
      </p>
    </div>

    <div class="grid gap-4 sm:grid-cols-3">
      <Card.Root>
        <Card.Header>
          <Card.Description>Habitable rooms</Card.Description>
          <Card.Title class="text-2xl">{checks.rooms.length}</Card.Title>
        </Card.Header>
      </Card.Root>
      <Card.Root>
        <Card.Header>
          <Card.Description>Falling short</Card.Description>
          <Card.Title class="text-2xl {short > 0 ? 'text-amber-700' : ''}">{short}</Card.Title>
        </Card.Header>
      </Card.Root>
      <Card.Root>
        <Card.Header>
          <Card.Description>Glazing to floor area (Part XA)</Card.Description>
          <Card.Title class="text-2xl {checks.fenestration && !checks.fenestration.ok ? 'text-amber-700' : ''}">
            {checks.fenestration ? `${number.format(checks.fenestration.ratio * 100)}%` : '–'}
          </Card.Title>
          <Card.Description>
            Above {Math.round(FENESTRATION_MAX_RATIO * 100)}% needs a fenestration calculation.
          </Card.Description>
        </Card.Header>
      </Card.Root>
    </div>

    <Card.Root>
      <Card.Content class="p-0">
        {#if rows.length === 0}
          <p class="px-4 py-8 text-center text-sm text-muted-foreground">
            Name the rooms on the plan and their checks appear here.
          </p>
        {:else}
        <Table.Root>
          <Table.Header>
            <Table.Row>
              <Table.Head class="pl-4">Room</Table.Head>
              <Table.Head>Daylight (O)</Table.Head>
              <Table.Head>Ventilation (O)</Table.Head>
              <Table.Head>Floor area (C)</Table.Head>
              <Table.Head>Width (C)</Table.Head>
              <Table.Head class="pr-4"></Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {#each rows as row (row.resolved.space.id)}
              <Table.Row>
                <Table.Cell class="pl-4">
                  <div class="font-medium">{row.resolved.space.name}</div>
                  <div class="text-xs text-muted-foreground">
                    {roomTypeLabel(row.resolved.space.type)} · {storeyName(row.floor.index)} · {number.format(
                      row.resolved.area,
                    )} m²
                  </div>
                </Table.Cell>
                {#if row.result}
                  {#each row.result.checks as check (check.id)}
                    <Table.Cell>
                      <Badge variant={check.ok ? 'secondary' : 'outline'} class={check.ok ? '' : 'border-amber-600/40 text-amber-700'}>
                        {value(check)}
                      </Badge>
                      <span class="ml-1 text-xs text-muted-foreground">of {need(check)}</span>
                    </Table.Cell>
                  {/each}
                {:else}
                  <Table.Cell colspan={4} class="text-sm text-muted-foreground">Not a habitable room, so not checked.</Table.Cell>
                {/if}
                <Table.Cell class="pr-4 text-right">
                  <Button variant="ghost" size="sm" href={planHref(id, row.floor.index, row.resolved.space.id)}>
                    Show on plan
                  </Button>
                </Table.Cell>
              </Table.Row>
            {/each}
          </Table.Body>
        </Table.Root>
        {/if}
      </Card.Content>
    </Card.Root>

    {#if unnamed > 0}
      <p class="text-sm text-muted-foreground">
        {unnamed} {unnamed === 1 ? 'part of the plan is' : 'parts of the plan are'} not in a named room, so not checked.
      </p>
    {/if}

    <div class="mt-4">
      <h2 class="text-base font-semibold">Electrical</h2>
      <p class="text-sm text-muted-foreground">
        Circuits laid out from the fittings on the plan, as a guide to cost. A registered electrician designs the
        installation to SANS 10142-1 and issues the certificate of compliance.
      </p>
    </div>

    {#if electrical.circuits.length === 0}
      <Card.Root>
        <Card.Content class="py-6 text-sm text-muted-foreground">
          {electrical.board
            ? 'Add lights, sockets or a stove isolator and their circuits appear here.'
            : 'Place a distribution board with the Fittings tool, or suggest fittings for a room with an outside door, and the circuits appear here.'}
        </Card.Content>
      </Card.Root>
    {:else}
      <div class="grid gap-4 sm:grid-cols-3">
        <Card.Root>
          <Card.Header>
            <Card.Description>Circuits</Card.Description>
            <Card.Title class="text-2xl">{electrical.circuits.length}</Card.Title>
          </Card.Header>
        </Card.Root>
        <Card.Root>
          <Card.Header>
            <Card.Description>Board</Card.Description>
            <Card.Title class="text-2xl">{electrical.boardSize ? `${electrical.boardSize}-way` : 'Over 36 ways'}</Card.Title>
            <Card.Description>{electrical.ways} ways used, with main switch and earth leakage</Card.Description>
          </Card.Header>
        </Card.Root>
        <Card.Root>
          <Card.Header>
            <Card.Description>Cable</Card.Description>
            <Card.Title class="text-2xl">{number.format(cableTotal)} m</Card.Title>
            <Card.Description>Before waste</Card.Description>
          </Card.Header>
        </Card.Root>
      </div>

      <Card.Root>
        <Card.Content class="p-0">
          <Table.Root>
            <Table.Header>
              <Table.Row>
                <Table.Head class="pl-4">Circuit</Table.Head>
                <Table.Head>Breaker</Table.Head>
                <Table.Head>Cable</Table.Head>
                <Table.Head>Points</Table.Head>
                <Table.Head class="pr-4 text-right">Run</Table.Head>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {#each electrical.circuits as circuit (circuit.id)}
                <Table.Row>
                  <Table.Cell class="pl-4">
                    <span class="font-medium">{circuit.id}</span>
                    <span class="text-muted-foreground">· {circuit.name}</span>
                  </Table.Cell>
                  <Table.Cell class="tabular-nums">{circuit.breaker} A</Table.Cell>
                  <Table.Cell class="tabular-nums">{circuit.cable} mm²</Table.Cell>
                  <Table.Cell class="tabular-nums">{circuit.points.length}</Table.Cell>
                  <Table.Cell class="pr-4 text-right tabular-nums">{number.format(circuit.length)} m</Table.Cell>
                </Table.Row>
              {/each}
            </Table.Body>
          </Table.Root>
        </Card.Content>
      </Card.Root>
    {/if}

    {#if electricalProblems.length > 0}
      <Card.Root>
        <Card.Content class="grid gap-2 py-4 text-sm">
          {#each electricalProblems as issue (issue.id)}
            <div class="flex items-start justify-between gap-3">
              <span class="text-amber-700">{issue.text}</span>
              {#if issue.floorId}
                {@const floor = doc.building.floors.find((item) => item.id === issue.floorId)}
                {#if floor}
                  <Button variant="ghost" size="sm" href={planHref(id, floor.index)}>Show on plan</Button>
                {/if}
              {/if}
            </div>
          {/each}
        </Card.Content>
      </Card.Root>
    {/if}

    <div class="mt-4">
      <h2 class="text-base font-semibold">Plumbing</h2>
      <p class="text-sm text-muted-foreground">
        Drainage and supply worked out from the fittings and the ground levels. A plumber confirms the design against
        SANS 10400-P and SANS 10252.
      </p>
    </div>

    {#if !pipes.exit}
      <Card.Root>
        <Card.Content class="py-6 text-sm text-muted-foreground">
          Place a toilet, basin, shower, bath or sink and the drainage and water supply appear here.
        </Card.Content>
      </Card.Root>
    {:else}
      <div class="grid gap-4 sm:grid-cols-3">
        <Card.Root>
          <Card.Header>
            <Card.Description>{pipes.septic ? 'Drain to the septic tank' : 'Drain to the sewer'}</Card.Description>
            <Card.Title class="text-2xl {pipes.profile && pipes.profile.shortBy > 0.005 ? 'text-amber-700' : ''}">
              {pipes.profile ? `${number.format(pipes.profile.length)} m` : '–'}
            </Card.Title>
            <Card.Description>
              {pipes.profile
                ? pipes.profile.shortBy > 0.005
                  ? `Arrives ${Math.round(pipes.profile.shortBy * 1000)} mm below the sewer`
                  : `Falls into the ${pipes.septic ? 'tank' : 'sewer'}; ${number.format(pipes.profile.deepest)} m at its deepest`
                : 'No drains yet'}
            </Card.Description>
          </Card.Header>
        </Card.Root>
        <Card.Root>
          <Card.Header>
            <Card.Description>Water main</Card.Description>
            <Card.Title class="text-2xl">{number.format(pipes.waterMain)} m</Card.Title>
            <Card.Description>From the meter to the house</Card.Description>
          </Card.Header>
        </Card.Root>
        <Card.Root>
          <Card.Header>
            <Card.Description>Longest hot run</Card.Description>
            <Card.Title class="text-2xl">{longestHot ? `${number.format(longestHot)} m` : '–'}</Card.Title>
            <Card.Description>From the geyser to the furthest hot tap</Card.Description>
          </Card.Header>
        </Card.Root>
      </div>
    {/if}

    {#if pipes.septic || pipes.rain}
      <div class="grid gap-4 sm:grid-cols-2">
        {#if pipes.septic}
          <Card.Root>
            <Card.Header>
              <Card.Description>Septic tank</Card.Description>
              <Card.Title class="text-2xl">{pipes.septic.litres.toLocaleString('en-ZA')} litres</Card.Title>
              <Card.Description>
                For {pipes.septic.bedrooms} {pipes.septic.bedrooms === 1 ? 'bedroom' : 'bedrooms'}, overflowing to a soakaway.
                The local authority approves the size and position.
              </Card.Description>
            </Card.Header>
          </Card.Root>
        {/if}
        {#if pipes.rain}
          <Card.Root>
            <Card.Header>
              <Card.Description>Rainwater off the roof</Card.Description>
              <Card.Title class="text-2xl">{Math.round(pipes.rain.yearly / 1000).toLocaleString('en-ZA')} kL a year</Card.Title>
              <Card.Description>
                {number.format(pipes.rain.catchment)} m² of roof at {pipes.rain.rainfall} mm of rain.
                {pipes.rain.tanks > 0
                  ? `${pipes.rain.tanks} × 5,000 L ${pipes.rain.tanks === 1 ? 'tank fills' : 'tanks; one fills'} from ${number.format(pipes.rain.fillMm)} mm of rain.`
                  : `${pipes.rain.suggested} × 5,000 L ${pipes.rain.suggested === 1 ? 'tank' : 'tanks'} would hold a ${25} mm storm. Add one with the Fittings tool.`}
              </Card.Description>
            </Card.Header>
          </Card.Root>
        {/if}
      </div>
    {/if}

    {#if pipes.issues.length > 0}
      <Card.Root>
        <Card.Content class="grid gap-2 py-4 text-sm">
          {#each pipes.issues as issue (issue.id)}
            <div class="flex items-start justify-between gap-3">
              <span class="text-amber-700">{issue.text}</span>
              <Button variant="ghost" size="sm" href={planHref(id, 0)}>Show on plan</Button>
            </div>
          {/each}
        </Card.Content>
      </Card.Root>
    {/if}

  </div>
</div>

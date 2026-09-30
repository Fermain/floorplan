<script lang="ts">
  import { page } from '$app/state'
  import { Badge } from '$lib/components/ui/badge'
  import { Button } from '$lib/components/ui/button'
  import * as Card from '$lib/components/ui/card'
  import * as Table from '$lib/components/ui/table'
  import { buildingChecks, FENESTRATION_MAX_RATIO, type RoomCheck } from '$lib/geometry/sans'
  import { layoutSpaces, roomTypeLabel } from '$lib/geometry/spaces'
  import { planHref } from '$lib/routes/links'
  import { documentStore } from '$lib/state/document.svelte'
  import { statusLine } from '$lib/state/status.svelte'

  const id = $derived(page.params.id ?? '')
  const doc = $derived(documentStore.document)
  const checks = $derived(buildingChecks(doc))

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
  </div>
</div>

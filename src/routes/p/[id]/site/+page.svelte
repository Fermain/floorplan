<script lang="ts">
  import { Button } from '$lib/components/ui/button'
  import * as Card from '$lib/components/ui/card'
  import { Input } from '$lib/components/ui/input'
  import { Label } from '$lib/components/ui/label'
  import { signedPolygonArea } from '$lib/model/geom'
  import type { Plot } from '$lib/model/types'
  import { loadHeightfield, loadPlot } from '$lib/plot/load'
  import { documentStore } from '$lib/state/document.svelte'
  import { statusLine } from '$lib/state/status.svelte'

  const plot = $derived(documentStore.document.plot)
  const field = $derived(documentStore.document.heightfield)
  let message = $state<{ text: string; error: boolean } | null>(null)

  const area = $derived(Math.abs(signedPolygonArea(plot.ring.map(([x, z]) => ({ x, z })))))
  const perimeter = $derived(
    plot.ring.reduce((sum, [x, z], i) => {
      const [nx, nz] = plot.ring[(i + 1) % plot.ring.length]
      return sum + Math.hypot(nx - x, nz - z)
    }, 0),
  )
  const fall = $derived(Math.max(...field.heights) - Math.min(...field.heights))
  const number = new Intl.NumberFormat('en-ZA', { maximumFractionDigits: 1 })

  function explain(reason: string): string {
    if (reason === 'existing walls leave the new plot') {
      return 'Those walls sit outside the new plot. Remove them, or import a ring that contains them.'
    }
    return reason
  }

  function commit(next: Plot, input: HTMLInputElement, previous: number, invalid: string) {
    if (invalid) {
      message = { text: invalid, error: true }
      input.value = String(previous)
      return
    }
    const result = documentStore.replacePlot(next)
    if (!result.ok) {
      message = { text: explain(result.reason), error: true }
      input.value = String(previous)
      return
    }
    message = null
  }

  async function readFile(event: Event): Promise<string | undefined> {
    const input = event.currentTarget
    if (!(input instanceof HTMLInputElement) || !input.files?.[0]) return
    const text = await input.files[0].text()
    input.value = ''
    return text
  }

  async function importPlot(event: Event) {
    const text = await readFile(event)
    if (!text) return
    try {
      const result = documentStore.replacePlot(loadPlot(text))
      message = result.ok ? { text: 'Plot replaced.', error: false } : { text: explain(result.reason), error: true }
    } catch (err) {
      message = { text: err instanceof Error ? err.message : 'Could not read the plot.', error: true }
    }
  }

  async function importHeights(event: Event) {
    const text = await readFile(event)
    if (!text) return
    try {
      const result = documentStore.replaceHeightfield(loadHeightfield(text))
      message = result.ok ? { text: 'Ground levels replaced.', error: false } : { text: explain(result.reason), error: true }
    } catch (err) {
      message = { text: err instanceof Error ? err.message : 'Could not read the heightfield.', error: true }
    }
  }

  $effect(() => {
    statusLine.clear()
  })
</script>

<div class="h-full overflow-auto">
  <div class="mx-auto flex max-w-3xl flex-col gap-4 p-6">
    <div>
      <h1 class="text-lg font-semibold">Site</h1>
      <p class="text-sm text-muted-foreground">Where the plot is, which way it faces, and the shape of the ground.</p>
    </div>

    <div class="grid gap-4 sm:grid-cols-3">
      <Card.Root>
        <Card.Header>
          <Card.Description>Plot area</Card.Description>
          <Card.Title class="text-2xl">{number.format(area)} m²</Card.Title>
        </Card.Header>
      </Card.Root>
      <Card.Root>
        <Card.Header>
          <Card.Description>Boundary</Card.Description>
          <Card.Title class="text-2xl">{number.format(perimeter)} m</Card.Title>
        </Card.Header>
      </Card.Root>
      <Card.Root>
        <Card.Header>
          <Card.Description>Fall across the ground</Card.Description>
          <Card.Title class="text-2xl">{number.format(fall)} m</Card.Title>
        </Card.Header>
      </Card.Root>
    </div>

    <Card.Root>
      <Card.Header>
        <Card.Title>Location</Card.Title>
        <Card.Description>Used for the sun path in Review.</Card.Description>
      </Card.Header>
      <Card.Content class="grid gap-4 sm:grid-cols-3">
        <div class="grid gap-1.5">
          <Label for="latitude">Latitude</Label>
          <Input
            id="latitude"
            type="number"
            step="0.0001"
            value={plot.latitude}
            onchange={(event) => {
              const input = event.currentTarget
              const value = Number(input.value)
              commit(
                { ...plot, latitude: value },
                input,
                plot.latitude,
                !Number.isFinite(value) || value < -90 || value > 90 ? 'Latitude must be between −90 and 90.' : '',
              )
            }}
          />
        </div>
        <div class="grid gap-1.5">
          <Label for="longitude">Longitude</Label>
          <Input
            id="longitude"
            type="number"
            step="0.0001"
            value={plot.longitude}
            onchange={(event) => {
              const input = event.currentTarget
              const value = Number(input.value)
              commit(
                { ...plot, longitude: value },
                input,
                plot.longitude,
                !Number.isFinite(value) || value < -180 || value > 180 ? 'Longitude must be between −180 and 180.' : '',
              )
            }}
          />
        </div>
        <div class="grid gap-1.5">
          <Label for="bearing">North bearing (°)</Label>
          <Input
            id="bearing"
            type="number"
            step="1"
            value={plot.northBearingDeg}
            onchange={(event) => {
              const input = event.currentTarget
              const value = Number(input.value)
              commit(
                { ...plot, northBearingDeg: value },
                input,
                plot.northBearingDeg,
                !Number.isFinite(value) ? 'North bearing must be a number.' : '',
              )
            }}
          />
        </div>
      </Card.Content>
    </Card.Root>

    <Card.Root>
      <Card.Header>
        <Card.Title>Import</Card.Title>
        <Card.Description>
          A plot boundary as GeoJSON or KML in metres, and ground levels as a heightfield JSON file.
        </Card.Description>
      </Card.Header>
      <Card.Content class="flex flex-wrap gap-2">
        <Button variant="outline" onclick={() => document.getElementById('plot-file')?.click()}>Import plot…</Button>
        <Button variant="outline" onclick={() => document.getElementById('height-file')?.click()}>
          Import ground levels…
        </Button>
        <input id="plot-file" class="hidden" type="file" accept=".geojson,.json,.kml" onchange={importPlot} />
        <input id="height-file" class="hidden" type="file" accept=".json,application/json" onchange={importHeights} />
      </Card.Content>
    </Card.Root>

    {#if message}
      <p class="text-sm {message.error ? 'text-destructive' : 'text-muted-foreground'}">{message.text}</p>
    {/if}
  </div>
</div>

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
  import OpeningFields from '$lib/components/project/OpeningFields.svelte'
  import RoofPicker from '$lib/components/project/RoofPicker.svelte'
  import WallPicker from '$lib/components/project/WallPicker.svelte'
  import TrimPicker from '$lib/components/project/TrimPicker.svelte'
  import ApronPicker from '$lib/components/project/ApronPicker.svelte'
  import FinishPicker from '$lib/components/project/FinishPicker.svelte'
  import { projectDefaults } from '$lib/model/defaults'
  import { DEFAULT_WALL_SYSTEM_ID } from '$lib/model/systems'
  import { DEFAULT_RAINFALL_MM } from '$lib/geometry/plumbing'
  import type { ProjectDefaults, WallSystemId } from '$lib/model/types'

  const plot = $derived(documentStore.document.plot)
  const field = $derived(documentStore.document.heightfield)
  let message = $state<{ text: string; error: boolean } | null>(null)
  let defaultsMessage = $state<string | null>(null)
  const defaults = $derived(projectDefaults(documentStore.document))
  const systemId = $derived<WallSystemId>(documentStore.document.building.wallSystemId ?? DEFAULT_WALL_SYSTEM_ID)

  function setDefault<K extends keyof ProjectDefaults>(key: K, value: ProjectDefaults[K]) {
    const result = documentStore.setProjectDefaults({ [key]: value } as Partial<ProjectDefaults>)
    defaultsMessage = result.ok ? null : `That would not fit: ${result.reason}.`
  }

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
  <div class="mx-auto flex max-w-3xl flex-col gap-4 p-4 sm:p-6 lg:max-w-5xl xl:max-w-6xl">
    <div>
      <h1 class="text-lg font-semibold">Project</h1>
      <p class="text-sm text-muted-foreground">The site, and the defaults new work starts from.</p>
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

    <div class="grid gap-4 lg:grid-cols-[2fr_1fr]">
      <Card.Root>
        <Card.Header>
          <Card.Title>Location</Card.Title>
          <Card.Description>Used for the sun path in Review, and the rainfall for sizing rainwater tanks.</Card.Description>
        </Card.Header>
        <Card.Content class="grid gap-4 sm:grid-cols-4">
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
            <Label for="rainfall">Annual rainfall (mm)</Label>
            <Input
              id="rainfall"
              type="number"
              min="50"
              step="10"
              value={documentStore.document.services?.rainfallMm ?? DEFAULT_RAINFALL_MM}
              onchange={(event) => {
                const result = documentStore.setRainfall(Number(event.currentTarget.value))
                if (!result.ok) event.currentTarget.value = String(documentStore.document.services?.rainfallMm ?? DEFAULT_RAINFALL_MM)
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
    </div>

    {#if message}
      <p class="text-sm {message.error ? 'text-destructive' : 'text-muted-foreground'}">{message.text}</p>
    {/if}

    <div class="mt-4">
      <h2 class="text-lg font-semibold">Defaults</h2>
      <p class="text-sm text-muted-foreground">
        Used for new walls, openings and roofs. Anything already drawn keeps its own settings.
      </p>
    </div>
    <Card.Root>
      <Card.Header>
        <Card.Title>Walls</Card.Title>
      </Card.Header>
      <Card.Content>
        <WallPicker bind:value={() => systemId, (next) => documentStore.setDefaultWallSystem(next)} />
      </Card.Content>
    </Card.Root>
    <Card.Root>
      <Card.Header>
        <Card.Title>Roof</Card.Title>
      </Card.Header>
      <Card.Content>
        <RoofPicker
          bind:form={() => defaults.roofForm, (next) => setDefault('roofForm', next)}
          bind:covering={() => defaults.roofCovering, (next) => setDefault('roofCovering', next)}
          bind:pitchDeg={() => defaults.roofPitchDeg, (next) => setDefault('roofPitchDeg', next)}
          bind:eaves={() => defaults.roofEaves, (next) => setDefault('roofEaves', next)}
        />
      </Card.Content>
    </Card.Root>
    <Card.Root>
      <Card.Header>
        <Card.Title>Openings</Card.Title>
      </Card.Header>
      <Card.Content>
        <OpeningFields
          {systemId}
          bind:windowWidth={() => defaults.windowWidth, (next) => setDefault('windowWidth', next)}
          bind:windowHeight={() => defaults.windowHeight, (next) => setDefault('windowHeight', next)}
          bind:sill={() => defaults.sill, (next) => setDefault('sill', next)}
          bind:doorHeight={() => defaults.doorHeight, (next) => setDefault('doorHeight', next)}
        />
      </Card.Content>
    </Card.Root>
    <Card.Root>
      <Card.Header>
        <Card.Title>Skirting and cornice</Card.Title>
        <Card.Description>Round every room unless a wall has its own choice in Focus.</Card.Description>
      </Card.Header>
      <Card.Content>
        <TrimPicker
          bind:skirting={() => defaults.skirting, (next) => setDefault('skirting', next)}
          bind:cornice={() => defaults.cornice, (next) => setDefault('cornice', next)}
        />
      </Card.Content>
    </Card.Root>
    <div class="grid gap-4 lg:grid-cols-[3fr_2fr]">
      <Card.Root>
        <Card.Header>
          <Card.Title>Plaster and paint</Card.Title>
          <Card.Description>How the walls are finished, unless a face has its own choice in Focus.</Card.Description>
        </Card.Header>
        <Card.Content>
          <FinishPicker
            {systemId}
            bind:outsideFinish={() => defaults.outsideFinish, (next) => setDefault('outsideFinish', next)}
            bind:insideFinish={() => defaults.insideFinish, (next) => setDefault('insideFinish', next)}
            bind:outsidePaint={() => defaults.outsidePaint, (next) => setDefault('outsidePaint', next)}
            bind:insidePaint={() => defaults.insidePaint, (next) => setDefault('insidePaint', next)}
          />
        </Card.Content>
      </Card.Root>
      <Card.Root>
        <Card.Header>
          <Card.Title>Apron</Card.Title>
          <Card.Description>Paving laid round the outside of the house.</Card.Description>
        </Card.Header>
        <Card.Content>
          <ApronPicker
            bind:width={() => defaults.apronWidth, (next) => setDefault('apronWidth', next)}
            bind:surface={() => defaults.apronSurface, (next) => setDefault('apronSurface', next)}
          />
        </Card.Content>
      </Card.Root>
    </div>
    {#if defaultsMessage}
      <p class="text-sm text-destructive">{defaultsMessage}</p>
    {/if}
  </div>
</div>

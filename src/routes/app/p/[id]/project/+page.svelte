<script lang="ts">
  import Upload from '@lucide/svelte/icons/upload'
  import { Button } from '$lib/components/ui/button'
  import { signedPolygonArea } from '$lib/model/geom'
  import type { Plot } from '$lib/model/types'
  import { loadHeightfield, loadPlot } from '$lib/plot/load'
  import { documentStore } from '$lib/state/document.svelte'
  import { statusLine } from '$lib/state/status.svelte'
  import OpeningFields from '$lib/components/project/OpeningFields.svelte'
  import RoofPicker from '$lib/components/project/RoofPicker.svelte'
  import WallPicker from '$lib/components/project/WallPicker.svelte'
  import TrimPicker from '$lib/components/project/TrimPicker.svelte'
  import InfoTip from '$lib/components/project/InfoTip.svelte'
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

  const rainfall = $derived(documentStore.document.services?.rainfallMm ?? DEFAULT_RAINFALL_MM)

  // Enter in a cell of the site sheet takes the figure and moves to the cell below.
  function cellKey(event: KeyboardEvent) {
    const input = event.currentTarget
    if (event.key !== 'Enter' || !(input instanceof HTMLInputElement)) return
    event.preventDefault()
    const cells = [...(input.closest('table')?.querySelectorAll<HTMLInputElement>('input') ?? [])]
    const next = cells[cells.indexOf(input) + 1]
    if (next) {
      next.focus()
      next.select()
    } else input.blur()
  }

  $effect(() => {
    statusLine.clear()
  })
</script>

{#snippet band(title: string, note?: string)}
  <div class="flex items-center gap-1.5 border-b bg-muted px-3 py-1.5 text-[13px]">
    <h2 class="font-semibold">{title}</h2>
    {#if note}<InfoTip label="About {title.toLowerCase()}">{note}</InfoTip>{/if}
  </div>
{/snippet}

<div class="flex h-full flex-col">
  <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b bg-background px-3 py-1.5 text-sm">
    <p>
      <span class="text-muted-foreground">Plot</span>
      <span class="ml-1 text-base font-semibold tabular-nums">{number.format(area)} m²</span>
    </p>
    <div class="flex flex-wrap gap-2">
      <Button variant="outline" size="sm" onclick={() => document.getElementById('plot-file')?.click()}><Upload />Import plot…</Button>
      <Button variant="outline" size="sm" onclick={() => document.getElementById('height-file')?.click()}>
        <Upload />Import ground levels…
      </Button>
      <input id="plot-file" class="hidden" type="file" accept=".geojson,.json,.kml" onchange={importPlot} />
      <input id="height-file" class="hidden" type="file" accept=".json,application/json" onchange={importHeights} />
    </div>
  </div>
  <div class="flex min-h-0 flex-1 flex-col max-lg:overflow-auto lg:flex-row">
    <aside class="grid shrink-0 content-start gap-3 border-b bg-muted/40 p-3 text-sm lg:order-2 lg:w-80 lg:overflow-auto lg:border-b-0 lg:border-l">
      <div class="flex items-center gap-1.5">
        <h2 class="font-semibold">Site</h2>
        <InfoTip label="About the site">
          <p>White cells take your figures. The position sets the sun path in Review; the rainfall sizes rainwater tanks.</p>
          <p>Import a plot boundary as GeoJSON or KML in metres, and ground levels as a heightfield JSON file.</p>
        </InfoTip>
      </div>
      <table class="sheet still rounded-md border">
        <tbody>
          <tr>
            <td class="label">Plot area</td>
            <td class="w-24 text-right font-medium tabular-nums">{number.format(area)}</td>
            <td class="w-12 text-muted-foreground">m²</td>
          </tr>
          <tr>
            <td class="label">Boundary</td>
            <td class="text-right font-medium tabular-nums">{number.format(perimeter)}</td>
            <td class="text-muted-foreground">m</td>
          </tr>
          <tr>
            <td class="label">Fall across the ground</td>
            <td class="text-right font-medium tabular-nums">{number.format(fall)}</td>
            <td class="text-muted-foreground">m</td>
          </tr>
          <tr>
            <td class="label"><label for="latitude">Latitude</label></td>
            <td class="cell">
              <input
                id="latitude"
                type="number"
                step="0.0001"
                value={plot.latitude}
                onkeydown={cellKey}
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
            </td>
            <td class="text-muted-foreground">°</td>
          </tr>
          <tr>
            <td class="label"><label for="longitude">Longitude</label></td>
            <td class="cell">
              <input
                id="longitude"
                type="number"
                step="0.0001"
                value={plot.longitude}
                onkeydown={cellKey}
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
            </td>
            <td class="text-muted-foreground">°</td>
          </tr>
          <tr>
            <td class="label"><label for="bearing">North bearing</label></td>
            <td class="cell">
              <input
                id="bearing"
                type="number"
                step="1"
                value={plot.northBearingDeg}
                onkeydown={cellKey}
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
            </td>
            <td class="text-muted-foreground">°</td>
          </tr>
          <tr>
            <td class="label"><label for="rainfall">Annual rainfall</label></td>
            <td class="cell">
              <input
                id="rainfall"
                type="number"
                min="50"
                step="10"
                value={rainfall}
                onkeydown={cellKey}
                onchange={(event) => {
                  const result = documentStore.setRainfall(Number(event.currentTarget.value))
                  if (!result.ok) event.currentTarget.value = String(rainfall)
                }}
              />
            </td>
            <td class="text-muted-foreground">mm</td>
          </tr>
        </tbody>
      </table>
      {#if message}
        <p class={message.error ? 'text-destructive' : 'text-muted-foreground'} aria-live="polite">{message.text}</p>
      {/if}
    </aside>
    <div class="min-h-0 flex-1 bg-background lg:overflow-auto">
      <div class="flex items-center gap-1.5 border-b px-3 py-1.5 text-sm">
        <h2 class="font-semibold">Defaults</h2>
        <InfoTip label="About the defaults">
          Used for new walls, openings and roofs. Anything already drawn keeps its own settings.
        </InfoTip>
      </div>
      {#if defaultsMessage}
        <p class="border-b border-destructive/30 bg-destructive/10 px-3 py-1.5 text-[13px] text-destructive" aria-live="polite">{defaultsMessage}</p>
      {/if}
      <section>
        {@render band('Walls')}
        <div class="border-b p-3 sm:p-4 [&>*]:max-w-6xl">
          <WallPicker bind:value={() => systemId, (next) => documentStore.setDefaultWallSystem(next)} />
        </div>
      </section>
      <section>
        {@render band('Roof')}
        <div class="border-b p-3 sm:p-4 [&>*]:max-w-6xl">
          <RoofPicker
            bind:form={() => defaults.roofForm, (next) => setDefault('roofForm', next)}
            bind:covering={() => defaults.roofCovering, (next) => setDefault('roofCovering', next)}
            bind:pitchDeg={() => defaults.roofPitchDeg, (next) => setDefault('roofPitchDeg', next)}
            bind:eaves={() => defaults.roofEaves, (next) => setDefault('roofEaves', next)}
          />
        </div>
      </section>
      <section>
        {@render band('Openings')}
        <div class="border-b p-3 sm:p-4 [&>*]:max-w-6xl">
          <OpeningFields
            {systemId}
            bind:windowWidth={() => defaults.windowWidth, (next) => setDefault('windowWidth', next)}
            bind:windowHeight={() => defaults.windowHeight, (next) => setDefault('windowHeight', next)}
            bind:sill={() => defaults.sill, (next) => setDefault('sill', next)}
            bind:doorHeight={() => defaults.doorHeight, (next) => setDefault('doorHeight', next)}
          />
        </div>
      </section>
      <section>
        {@render band('Skirting and cornice', 'Round every room unless a wall has its own choice in Focus.')}
        <div class="border-b p-3 sm:p-4 [&>*]:max-w-6xl">
          <TrimPicker
            bind:skirting={() => defaults.skirting, (next) => setDefault('skirting', next)}
            bind:cornice={() => defaults.cornice, (next) => setDefault('cornice', next)}
          />
        </div>
      </section>
      <section>
        {@render band('Plaster and paint', 'How the walls are finished, unless a face has its own choice in Focus.')}
        <div class="border-b p-3 sm:p-4 [&>*]:max-w-3xl">
          <FinishPicker
            {systemId}
            bind:outsideFinish={() => defaults.outsideFinish, (next) => setDefault('outsideFinish', next)}
            bind:insideFinish={() => defaults.insideFinish, (next) => setDefault('insideFinish', next)}
            bind:outsidePaint={() => defaults.outsidePaint, (next) => setDefault('outsidePaint', next)}
            bind:insidePaint={() => defaults.insidePaint, (next) => setDefault('insidePaint', next)}
          />
        </div>
      </section>
      <section>
        {@render band('Apron', 'Paving laid round the outside of the house.')}
        <div class="p-3 sm:p-4 [&>*]:max-w-3xl">
          <ApronPicker
            bind:width={() => defaults.apronWidth, (next) => setDefault('apronWidth', next)}
            bind:surface={() => defaults.apronSurface, (next) => setDefault('apronSurface', next)}
          />
        </div>
      </section>
    </div>
  </div>
</div>

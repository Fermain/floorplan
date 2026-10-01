<script lang="ts" module>
  // A fitting as seen on this face: u is its middle measured from the left of the view, bottom and top its height.
  export type Fitting = { id: string; u: number; width: number; bottom: number; top: number; selected: boolean; label: string }
</script>

<script lang="ts">
  import type { Opening } from '../../lib/model/types'
  import { elevationWindow } from './elevation'

  interface Props {
    length: number
    height: number
    head: number
    openings: Opening[]
    selectedId: string | null
    floorLevel: number | null
    fittings?: Fitting[]
    conduits?: { u: number; bottom: number; top: number; clash?: boolean }[]
    ports?: { u: number; v: number; r: number; kind: 'waste' | 'cold' | 'hot' }[]
    pipes?: { kind: 'waste' | 'cold' | 'hot'; points: [number, number][] }[]
  }

  let { length, height, head, openings, selectedId, floorLevel, fittings = [], conduits = [], ports = [], pipes = [] }: Props = $props()

  let width = $state(0)
  let tall = $state(0)

  const view = $derived(width > 0 && tall > 0 ? elevationWindow(width / tall, { length, height }) : null)
  const unit = $derived(view ? (2 * view.halfH) / tall : 0.01)
  const font = $derived(11 * unit)
  const tick = $derived(4 * unit)

  const stops = $derived.by(() => {
    const points = [0, length]
    for (const opening of openings) points.push(opening.u, opening.u + opening.width)
    return [...new Set(points.map((u) => Math.round(u * 1000) / 1000))].sort((a, b) => a - b)
  })

  const chainV = $derived(head + 0.28)
  const fittingChainV = $derived(-0.32)
  const fittingStops = $derived.by(() => {
    if (fittings.length === 0) return []
    const points = [0, length, ...fittings.map((fitting) => fitting.u)]
    return [...new Set(points.map((u) => Math.round(u * 1000) / 1000))].sort((a, b) => a - b)
  })
  const chosenFitting = $derived(fittings.find((fitting) => fitting.selected) ?? null)
  const selected = $derived(openings.find((opening) => opening.id === selectedId) ?? null)

  function mm(m: number): string {
    return String(Math.round(m * 1000))
  }

  function y(v: number): number {
    return -v
  }
</script>

<svg
  class="dimensions"
  bind:clientWidth={width}
  bind:clientHeight={tall}
  viewBox={view
    ? `${view.centerU - view.halfW} ${-(view.centerV + view.halfH)} ${2 * view.halfW} ${2 * view.halfH}`
    : '0 0 1 1'}
  preserveAspectRatio="none"
  aria-hidden="true"
  style:--halo={3 * unit}
>
  {#if view}
    <g class="chain">
      <line x1={0} y1={y(chainV)} x2={length} y2={y(chainV)} />
      {#each stops as u (u)}
        <line x1={u} y1={y(chainV - tick * 1.5)} x2={u} y2={y(chainV + tick * 1.5)} />
        <line x1={u} y1={y(head + 0.04)} x2={u} y2={y(chainV - tick * 1.5)} class="witness" />
      {/each}
      {#each stops.slice(0, -1) as u, i (u)}
        {@const next = stops[i + 1]}
        {#if next - u > font * 2.2}
          <text x={(u + next) / 2} y={y(chainV) - font * 0.45} font-size={font} text-anchor="middle">
            {mm(next - u)}
          </text>
        {/if}
      {/each}
      <text x={length / 2} y={y(chainV) - font * 1.7} font-size={font} text-anchor="middle" class="overall">
        {mm(length)} overall
      </text>
    </g>
    {#if selected}
      {@const side = selected.u + selected.width + font * 0.8}
      <g class="heights">
        <line x1={side} y1={y(0)} x2={side} y2={y(selected.v + selected.height)} />
        {#each [0, selected.v, selected.v + selected.height] as v (v)}
          <line x1={side - tick} y1={y(v)} x2={side + tick} y2={y(v)} />
        {/each}
        {#if selected.v > font * 1.5}
          <text x={side + font * 0.4} y={y(selected.v / 2) + font * 0.35} font-size={font}>
            sill {mm(selected.v)}
          </text>
        {/if}
        <text x={side + font * 0.4} y={y(selected.v + selected.height) + font * 1.2} font-size={font}>
          head {mm(selected.v + selected.height)}
        </text>
      </g>
    {/if}
    {#each pipes as pipe, i (i)}
      <polyline class="pipe {pipe.kind}" points={pipe.points.map(([u, v]) => `${u},${y(v)}`).join(' ')} />
    {/each}
    {#each ports as port, i (i)}
      <circle class="port {port.kind}" cx={port.u} cy={y(port.v)} r={port.r} />
    {/each}
    {#each conduits as conduit (conduit.u)}
      <line class="conduit" class:clash={conduit.clash} x1={conduit.u} y1={y(conduit.bottom)} x2={conduit.u} y2={y(conduit.top)} />
    {/each}
    {#if fittingStops.length > 0}
      <g class="fittings">
        <line x1={0} y1={y(fittingChainV)} x2={length} y2={y(fittingChainV)} />
        {#each fittingStops as u (u)}
          <line x1={u} y1={y(fittingChainV - tick * 1.5)} x2={u} y2={y(fittingChainV + tick * 1.5)} />
        {/each}
        {#each fittingStops.slice(0, -1) as u, i (u)}
          {@const next = fittingStops[i + 1]}
          {#if next - u > font * 2.2}
            <text x={(u + next) / 2} y={y(fittingChainV) + font * 1.2} font-size={font} text-anchor="middle">
              {mm(next - u)}
            </text>
          {/if}
        {/each}
      </g>
    {/if}
    {#if chosenFitting}
      {@const pad = tick}
      <g class="chosen-fitting">
        <rect
          x={chosenFitting.u - chosenFitting.width / 2 - pad}
          y={y(chosenFitting.top + pad)}
          width={chosenFitting.width + pad * 2}
          height={chosenFitting.top - chosenFitting.bottom + pad * 2}
        />
        <text x={chosenFitting.u + chosenFitting.width / 2 + font * 0.6} y={y(chosenFitting.top) + font * 0.9} font-size={font}>
          {chosenFitting.label} · {mm(chosenFitting.bottom - (floorLevel ?? 0))} up
        </text>
      </g>
    {/if}
    {#if floorLevel !== null}
      <g class="ffl">
        <line x1={-0.3} y1={y(floorLevel)} x2={length + 0.3} y2={y(floorLevel)} />
        <text x={-0.28} y={y(floorLevel) - font * 0.35} font-size={font}>FFL +{mm(floorLevel)}</text>
      </g>
    {/if}
  {/if}
</svg>

<style>
  .dimensions {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    overflow: visible;
  }

  line {
    stroke: #1d4ed8;
    stroke-width: 1px;
    vector-effect: non-scaling-stroke;
  }

  .witness {
    stroke: #93c5fd;
  }

  text {
    fill: #1e3a8a;
    font-family: system-ui, sans-serif;
    paint-order: stroke;
    stroke: #f4f4f5;
    stroke-width: var(--halo);
    stroke-linejoin: round;
  }

  .overall {
    fill: #52525b;
  }

  .heights line {
    stroke: #b45309;
  }

  .heights text {
    fill: #92400e;
  }

  .conduit {
    stroke: #d97706;
    stroke-width: 1.5px;
    stroke-dasharray: 5 4;
  }

  .pipe {
    fill: none;
    stroke-width: 1.5px;
    stroke-dasharray: 5 4;
    vector-effect: non-scaling-stroke;
  }
  .pipe.cold,
  .port.cold {
    stroke: #0284c7;
  }
  .pipe.hot,
  .port.hot {
    stroke: #dc2626;
  }
  .pipe.waste,
  .port.waste {
    stroke: #78716c;
  }
  .port {
    fill: #1c1917;
    stroke-width: 1.5px;
    vector-effect: non-scaling-stroke;
  }

  .conduit.clash {
    stroke: #dc2626;
    stroke-width: 2px;
  }

  .fittings line {
    stroke: #b45309;
  }

  .fittings text {
    fill: #92400e;
  }

  .chosen-fitting rect {
    fill: none;
    stroke: #2563eb;
    stroke-width: 1.5px;
    vector-effect: non-scaling-stroke;
  }

  .chosen-fitting text {
    fill: #1d4ed8;
  }

  .ffl line {
    stroke: #15803d;
    stroke-dasharray: 6 4;
  }

  .ffl text {
    fill: #166534;
  }
</style>

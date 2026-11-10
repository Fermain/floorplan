<script lang="ts">
  import { asset } from '$app/paths'

  type Slide = { image: string; alt: string; notes: string[] }
  let { slides }: { slides: Slide[] } = $props()

  // The drawings sit side by side in a strip that scrolls and snaps, so a finger can swipe between them. The
  // dimension line over the strip is the control: one measured stretch for each drawing, the one in view inked in.
  // With a stretch in focus, the left and right arrow keys move between drawings.
  let strip = $state<HTMLElement>()
  let stretches = $state<HTMLButtonElement[]>([])
  let active = $state(0)

  function onScroll() {
    if (!strip || strip.clientWidth === 0) return
    active = Math.max(0, Math.min(slides.length - 1, Math.round(strip.scrollLeft / strip.clientWidth)))
  }

  function show(index: number) {
    if (!strip) return
    const next = (index + slides.length) % slides.length
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    strip.scrollTo({ left: next * strip.clientWidth, behavior: calm ? 'auto' : 'smooth' })
  }

  function onKey(event: KeyboardEvent) {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (step === 0) return
    event.preventDefault()
    const next = (active + step + slides.length) % slides.length
    show(next)
    // The focus goes with the drawing, so the ring stays on the stretch in view.
    stretches[next]?.focus({ preventScroll: true })
  }

  const number = (index: number) => String(index + 1).padStart(2, '0')
  const notes = $derived(slides[active]?.notes ?? [])
</script>

<figure class="m-0 flex min-w-0 flex-col" aria-roledescription="carousel" aria-label="Screens from Floorplan">
  <div class="mx-[4%] flex h-[34px] items-end font-mono text-xs" role="group" aria-label="Choose a screen">
    {#each slides as slide, i (slide.image)}
      <button
        bind:this={stretches[i]}
        type="button"
        class="segment relative h-full min-w-0 flex-1 text-line"
        class:current={i === active}
        aria-label="Screen {i + 1} of {slides.length}: {slide.notes[0] ?? slide.alt}"
        aria-current={i === active ? 'true' : undefined}
        onclick={() => show(i)}
        onkeydown={onKey}
      >
        <span class="absolute inset-x-0 top-0 text-center">{number(i)}</span>
      </button>
    {/each}
  </div>

  <div bind:this={strip} class="strip flex snap-x snap-mandatory overflow-x-auto border-[1.5px] border-rule bg-card" onscroll={onScroll}>
    {#each slides as slide, i (slide.image)}
      <img
        src={asset(slide.image)}
        alt={slide.alt}
        width="1400"
        height="836"
        loading={i === 0 ? 'eager' : 'lazy'}
        class="block h-auto w-full flex-none snap-center"
      />
    {/each}
  </div>

  <figcaption class="grid min-h-[3.375rem] grid-cols-3 border-[1.5px] border-t-0 border-rule bg-card font-mono text-[11px] uppercase sm:text-xs" aria-live="polite">
    {#each notes as note, i (i)}
      <span class="px-2.5 py-2 {i > 0 ? 'border-l border-rule' : ''}">{note}</span>
    {/each}
  </figcaption>
</figure>

<style>
  .strip {
    scrollbar-width: none;
  }
  .strip::-webkit-scrollbar {
    display: none;
  }
  /* One stretch of the dimension line: the line itself, with a tick at its start. */
  .segment::before {
    content: '';
    position: absolute;
    inset-inline: 0;
    top: 18px;
    border-top: 1.5px solid currentColor;
    opacity: 0.45;
  }
  .segment::after {
    content: '';
    position: absolute;
    left: 0;
    top: 13px;
    height: 11px;
    border-left: 1.5px solid currentColor;
  }
  /* The last stretch closes the line with a second tick. */
  .segment:last-child {
    border-right: 1.5px solid transparent;
    background: linear-gradient(currentColor, currentColor) right 13px / 1.5px 11px no-repeat;
  }
  .segment span {
    opacity: 0.6;
  }
  .segment.current::before {
    opacity: 1;
    border-top-width: 3px;
    top: 17px;
  }
  .segment.current span {
    opacity: 1;
    font-weight: 600;
  }
  .segment:hover span {
    opacity: 1;
  }
  .segment:focus-visible {
    outline: 2px solid var(--line);
    outline-offset: 2px;
  }
</style>

<script lang="ts">
  import { asset, resolve } from '$app/paths'
  import ArrowRight from '@lucide/svelte/icons/arrow-right'
  import { EXAMPLES } from '$lib/examples'
  import { exampleHref } from '$lib/routes/links'
  import HeroSlides from '$lib/components/marketing/HeroSlides.svelte'
  import SheetHeading from '$lib/components/marketing/SheetHeading.svelte'

  const REPO = 'https://github.com/Fermain/floorplan'
  const app = resolve('/app')
  const start = `${resolve('/app/new')}?step=site`

  // The tour down the page: one view of the app at a time, each with a picture of the same farmhouse.
  const tour = [
    {
      id: 'plan',
      title: 'Plan',
      lead: 'Draw on a real plot, to real sizes.',
      points: [
        'A plot with its true shape, slope, north point and street.',
        'Walls drawn corner to corner, snapping to each other and to whole bricks and blocks.',
        'Rooms form where walls close, with their net areas and floor finishes.',
        'Several buildings on one plot, up to four storeys each, with stairs laid out to the regulations.',
        'Kitchen counters, islands and bars, with sinks and hobs set into them.',
        'Carports, retaining walls, driveways, paths and patios outside.',
      ],
      image: 'plan.jpg',
      alt: 'Plan of three houses, two carports and a garage round a gravel yard, with named rooms and paving',
    },
    {
      id: 'focus',
      title: 'Focus',
      lead: 'Open any wall face-on and build it course by course.',
      points: [
        'Windows and doors sit on the courses, with lintels over them.',
        'Whole and cut units are counted as you work.',
        'Each face is left exposed, bagged or plastered, and painted.',
        'Sockets, switches, pipes and fittings are placed on the wall they belong to.',
        'The ground line, the floor level and the damp-proof course are drawn under the wall.',
      ],
      image: 'focus.jpg',
      alt: 'A face-brick wall seen from outside, with a sliding door, a window, their lintels, a dimension chain and the ground line under it',
    },
    {
      id: 'review',
      title: 'Review',
      lead: 'See it stand on its ground, in the sun.',
      points: [
        'The model sits on the terrain, levelled under each building.',
        'Midsummer and midwinter sun at any hour, for the latitude of the plot.',
        'A cutaway opens the house as you move in; walls can be cut to half height or hidden.',
        'Roofs, gutters, solar panels, tanks, fences, carports and retaining walls are all there.',
      ],
      image: 'review-farm.jpg',
      alt: 'Three houses, a garage and carports on a sloping stand, seen from above with the road behind',
    },
    {
      id: 'services',
      title: 'Services',
      lead: 'Look through the walls at the pipes and cables.',
      points: [
        'One switch fades the building and draws what runs through it.',
        'Drains, cold and hot water, lighting, plugs, the stove and geyser circuits, and gas, each in its own colour.',
        'A legend gives the length of each.',
        'The routes are indicative: where a run would go, not a drawing to build from.',
      ],
      image: 'services.jpg',
      alt: 'The farmhouse faded to a ghost, with drains, water pipes and electrical circuits drawn through it in colour',
    },
    {
      id: 'quantities',
      title: 'Quantities',
      lead: 'A bill of quantities that keeps up with the drawing.',
      points: [
        'Bricks and blocks, mortar, lintels, concrete, roofing, plaster and paint.',
        'Electrical, plumbing, gas, joinery, paving and fencing.',
        'Every rate is yours to change, and so are the assumptions behind the figures.',
        'Download the sheet as CSV.',
      ],
      image: 'quantities.jpg',
      alt: 'A ruled sheet of masonry, mortar and lintel quantities with rates and an estimated total',
    },
    {
      id: 'alterations',
      title: 'Alterations',
      lead: 'Change a house that is already built, and price only the change.',
      points: [
        'Draw the house as it stands and mark it as built.',
        'What you change after that is picked out on the plan: new walls in green, walls taken down in red.',
        'Quantities prices the difference and the breaking out, not the whole house.',
        'Put the drawing back to the house as built at any time.',
      ],
      image: 'alterations.jpg',
      alt: 'The farmhouse plan with a new wall across the living room in green and the wall between the bathroom and a bedroom taken down, in red',
    },
    {
      id: 'checks',
      title: 'Checks',
      lead: 'The regulations, measured as you go.',
      points: [
        'Daylight, ventilation, floor area and width for each habitable room (SANS 10400 Parts O and C).',
        'Glazing against floor area for the whole house (Part XA).',
        'Circuits, board size and cable; drainage falls, hot water runs and rainwater.',
        'Load shedding: tick the circuits to keep on and get an inverter, battery and panel count.',
      ],
      image: 'checks.jpg',
      alt: 'Room checks listed in a sheet, each with its daylight, ventilation, area and width against the minimum',
    },
  ]

  // The example the hero offers to preview: the one in the pictures.
  const showcase = EXAMPLES.find((example) => example.id === 'multi-generation') ?? EXAMPLES[0]

  const more = [
    { name: 'Menus you already know', text: 'File, Edit, View, Draw and Help over every project, beside one-click toolbars for the tools in constant use.' },
    { name: 'Kitchens', text: 'Lay out one room on its own. Counters close up to stoves and sinks, and a hob can be built into the worktop.' },
    { name: 'Retaining walls', text: 'Drawn along a bank and built in retaining blocks, course by course. Over a metre is flagged for an engineer.' },
    { name: 'Off-grid', text: 'Septic tanks, rainwater tanks under downpipes, gas bottles, solar panels, an inverter and a battery, all counted.' },
    { name: 'Light and dark', text: 'The app follows your device: the plan is on paper by day and a blueprint at night.' },
    { name: 'Backups', text: 'Download every project in one file, and restore it on another machine.' },
  ]

  const technology = [
    { name: 'SvelteKit and Svelte 5', text: 'A single-page app built to static files. There is no server to run.' },
    { name: 'three.js with Threlte', text: 'The 3D Review, its sun and shadows, and the cutaway.' },
    { name: 'Geometry in TypeScript', text: 'Walls, roofs, stairs, services and takeoff are plain functions with tests beside them.' },
    { name: 'Tailwind and shadcn-svelte', text: 'A plain, dense interface that works on a phone.' },
    { name: 'IndexedDB', text: 'Projects save in your browser as you work. Nothing is uploaded.' },
    { name: 'Open source', text: 'The code, the example houses and the rates are on GitHub.' },
  ]

  const PRO = 'https://pro.floorplan.ferma.in'
  const heroTitle = 'Design a house\nbrick by brick.'

  // The screens in the slider at the top: the tour's pictures, each with three notes under it, the first its name.
  const slideNotes: Record<string, string[]> = {
    review: ['Review in 3D', 'Summer · 12:00', 'Sun and shadow'],
    plan: ['Plan', 'Ground floor', 'Rooms named and measured'],
    focus: ['Wall focus', '1 791 whole · 270 cut', '2 lintels · 1.97 m, 2.78 m'],
    quantities: ['Quantities', 'Your rates', 'R 1 558 864,00'],
    services: ['Services', 'Drains, water, power', 'Routes through the house'],
    alterations: ['Alterations', 'New wall in green', 'Taken down in red'],
    checks: ['Checks', 'SANS 10400', '10 rooms in order'],
  }
  const slideOrder = ['review', 'plan', 'focus', 'quantities', 'services', 'alterations', 'checks']
  const slides = slideOrder.flatMap((id) => {
    const item = tour.find((entry) => entry.id === id)
    return item ? [{ image: `/shots/${item.image}`, alt: item.alt, notes: slideNotes[id] }] : []
  })

  // What it means that the app is free, said three ways.
  const commons = [
    { name: 'Free to use', text: 'Everything on this page, with no trial, no account and no card.' },
    { name: 'Yours to keep', text: 'Projects stay on your machine. Back them up as a file whenever you like.' },
    { name: 'Open to all', text: 'The code, the example houses and the rates are on GitHub. Tell us what is wrong for where you build.' },
  ]

  // Sheets are numbered down the page, as in a set of drawings.
  const sheet = (n: number, name: string) => `Sheet ${String(n).padStart(2, '0')} · ${name}`
  const afterTour = 3 + tour.length
</script>

<svelte:head>
  <title>Floorplan: house design, priced and checked as you draw</title>
</svelte:head>

<!-- One measure for the whole page: every section sits in the same column, with the same gutters. Each section is a
     sheet, with its heading over a dimension line. -->
{#snippet shot(image: string, alt: string, eager = false)}
  <img class="block h-auto w-full border-[1.5px] border-rule bg-card" src={asset(`/shots/${image}`)} loading={eager ? 'eager' : 'lazy'} {alt} />
{/snippet}

<div class="sheet-ground min-h-dvh bg-background text-foreground">
  <header class="sticky top-0 z-20 border-b-[1.5px] border-rule bg-background">
    <div class="wrap flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5">
      <a href={resolve('/')} class="block py-1" aria-label="Fermain Floorplan, home">
        <img src={asset('/brand/floorplan.svg')} alt="" width="136" height="28" class="block dark:hidden" />
        <img src={asset('/brand/floorplan-dark.svg')} alt="" width="136" height="28" class="hidden dark:block" />
      </a>
      <nav class="flex flex-wrap items-center gap-1 text-[15px]" aria-label="Site">
        <a class="px-3 py-2 hover:underline max-md:hidden" href="#tour">Features</a>
        <a class="px-3 py-2 hover:underline max-md:hidden" href="#examples">Examples</a>
        <a class="px-3 py-2 hover:underline max-sm:hidden" href="#pro">Pro</a>
        <a class="px-3 py-2 hover:underline max-sm:hidden" href={REPO} rel="noreferrer">GitHub</a>
        <a class="bg-brick px-4 py-2 font-semibold text-brick-foreground hover:bg-brick/90" href={app}>Open the app</a>
      </nav>
    </div>
  </header>

  <main>
    <section class="wrap row py-12 lg:items-center lg:py-[72px]">
      <div class="flex flex-col gap-5">
        <SheetHeading level={1} size="lg" title={heroTitle} label={sheet(1, 'Free and open source')} />
        <p class="m-0 max-w-[34em] text-lg leading-relaxed text-muted-foreground">
          Know what it costs before you build. Floorplan is a design tool for small, low-cost houses in South Africa.
          Draw on a sloping plot in real bricks and blocks, and get a bill of quantities and the SANS 10400 checks as you
          go.
        </p>
        <div class="flex flex-wrap gap-3">
          <a href={app} class="inline-flex items-center gap-2 bg-brick px-5 py-3.5 font-semibold text-brick-foreground hover:bg-brick/90">Open the app<ArrowRight class="size-4" /></a>
          <a href={exampleHref(showcase.id)} class="border-[1.5px] border-rule px-5 py-3.5 font-semibold hover:bg-accent">Preview an example</a>
        </div>
        <p class="m-0 font-mono text-xs tracking-wider text-muted-foreground uppercase">In your browser · No account · Projects stay on your machine</p>
      </div>
      <HeroSlides {slides} />
    </section>

    <section id="community" class="scroll-mt-16 border-t-[1.5px] border-rule bg-card" aria-label="For the community">
      <div class="wrap flex flex-col gap-8 py-12 lg:py-16">
        <SheetHeading title="Made for the people who build most of our houses" label={sheet(2, 'For the community')} />
        <div class="grid gap-x-12 gap-y-5 text-[17px] leading-relaxed text-muted-foreground lg:grid-cols-2">
          <p class="m-0">
            Most small houses in South Africa, and across the continent, go up without an architect or a quantity
            surveyor. The owner and a builder work it out between them, and the first real price often arrives when the
            materials run out. The software that could help was made for other markets and bigger budgets.
          </p>
          <p class="m-0">
            Floorplan is our answer to that, made in the spirit of ubuntu. A house that is planned well and priced
            honestly is good for the family in it, the builder who put it up and the street it stands on. So the whole
            app is free, and the code is open for anyone to read, fix or take further.
          </p>
        </div>
        <dl class="m-0 grid grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))] overflow-hidden border-[1.5px] border-rule">
          {#each commons as item, i (item.name)}
            <div class="-mr-px -mb-px flex flex-col gap-2 border-r border-b border-rule p-6">
              <span class="font-mono text-xs text-line">{String.fromCharCode(65 + i)}</span>
              <dt class="text-[19px] font-semibold">{item.name}</dt>
              <dd class="m-0 leading-relaxed text-muted-foreground">{item.text}</dd>
            </div>
          {/each}
        </dl>
      </div>
    </section>

    <section id="tour" class="scroll-mt-16" aria-label="Features">
      {#each tour as item, index (item.id)}
        <div class="border-t-[1.5px] border-rule {index % 2 === 1 ? 'bg-card' : ''}">
          <div class="wrap row py-12 lg:py-16">
            <div class="flex flex-col gap-5">
              <SheetHeading title={item.lead} label={sheet(3 + index, item.title)} />
              <ul class="m-0 flex list-none flex-col border-t border-rule p-0">
                {#each item.points as point, i (point)}
                  <li class="flex gap-3.5 border-b border-border py-2.5">
                    <span class="pt-0.5 font-mono text-sm text-line">{String.fromCharCode(65 + i)}</span>
                    <span>{point}</span>
                  </li>
                {/each}
              </ul>
            </div>
            {@render shot(item.image, item.alt)}
          </div>
        </div>
      {/each}
    </section>

    <section id="examples" class="scroll-mt-16 border-t-[1.5px] border-rule" aria-labelledby="examples-heading">
      <div class="wrap flex flex-col gap-7 py-12 lg:py-16">
        <SheetHeading id="examples-heading" title="Preview a finished house before you draw your own" label={sheet(afterTour, 'Examples')} />
        <p class="m-0 max-w-[44em] text-[17px] leading-relaxed text-muted-foreground">
          Six example projects come with the app. Each opens here as a preview: the plan, the 3D model, the bill of
          quantities and the checks, with nothing to install and nothing saved. When one is close to what you want,
          open a copy and change it.
        </p>
        <ul class="m-0 grid list-none border-[1.5px] border-rule bg-card p-0">
          {#each EXAMPLES as example, i (example.id)}
            <li class="grid gap-x-6 gap-y-1 px-4 py-3 md:grid-cols-[2rem_14rem_1fr_auto] md:items-baseline {i > 0 ? 'border-t border-border' : ''}">
              <span class="font-mono text-xs text-line max-md:hidden">{String(i + 1).padStart(2, '0')}</span>
              <a class="font-semibold underline-offset-4 hover:underline" href={exampleHref(example.id)}>{example.name}</a>
              <span class="text-muted-foreground">{example.place} · {example.highlights.join(' · ')}</span>
              <a class="inline-flex items-center gap-1 font-semibold underline-offset-4 hover:underline" href={exampleHref(example.id)}>
                Preview<ArrowRight class="size-3.5" />
              </a>
            </li>
          {/each}
        </ul>
      </div>
    </section>

    <!-- Ink in both themes: this band is about the paid version, which lives elsewhere. -->
    <section id="pro" class="scroll-mt-16 border-t-[1.5px] border-rule bg-[#1b2430] text-[#f6f4ee] [--line:#9fb7e6]" aria-label="Floorplan Pro">
      <div class="wrap row py-12 lg:items-center lg:py-16">
        <div class="flex flex-col gap-5">
          <SheetHeading title="Quoting for a living? There is Floorplan Pro" label={sheet(afterTour + 1, 'For builders and contractors')} />
          <p class="m-0 text-[17px] leading-relaxed text-[#c9ced6]">
            Pro is for builders and contractors who price jobs for clients. It adds your own rates, labour and margin,
            the bricks, blocks and building rules of countries beyond South Africa, and a proposal the client opens on
            WhatsApp. We are building it with a small group of builders, and it is in early access.
          </p>
          <p class="m-0 text-[17px] leading-relaxed text-[#c9ced6]">Everything in the free app stays free.</p>
          <div class="flex flex-wrap gap-3">
            <a href={PRO} class="inline-flex items-center gap-2 bg-[#e4936f] px-5 py-3.5 font-semibold text-[#1b2430] hover:bg-[#eaa585]">See Floorplan Pro<ArrowRight class="size-4" /></a>
          </div>
        </div>
        <a href={PRO} class="block justify-self-center lg:justify-self-end" aria-label="Floorplan Pro">
          <img src={asset('/brand/floorplan-pro-dark.svg')} alt="" width="339" height="70" class="block h-auto max-w-full" loading="lazy" />
        </a>
      </div>
    </section>

    <section class="border-t-[1.5px] border-rule bg-card" aria-labelledby="more-heading">
      <div class="wrap flex flex-col gap-7 py-12 lg:py-16">
        <SheetHeading id="more-heading" title="Small things that add up" label={sheet(afterTour + 2, 'And the rest')} />
        <dl class="m-0 grid gap-x-10 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
          {#each more as item (item.name)}
            <div class="flex flex-col gap-1 border-t border-rule pt-4">
              <dt class="font-semibold">{item.name}</dt>
              <dd class="m-0 text-muted-foreground">{item.text}</dd>
            </div>
          {/each}
        </dl>
      </div>
    </section>

    <section id="technology" class="scroll-mt-16 border-t-[1.5px] border-rule" aria-labelledby="technology-heading">
      <div class="wrap flex flex-col gap-7 py-12 lg:py-16">
        <SheetHeading id="technology-heading" title="How it is built" label={sheet(afterTour + 3, 'Technology')} />
        <dl class="m-0 grid gap-x-10 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
          {#each technology as item (item.name)}
            <div class="flex flex-col gap-1 border-t border-rule pt-4">
              <dt class="font-semibold">{item.name}</dt>
              <dd class="m-0 text-muted-foreground">{item.text}</dd>
            </div>
          {/each}
        </dl>
      </div>
    </section>

    <section class="border-t-[1.5px] border-rule bg-card">
      <div class="wrap grid gap-6 py-12 lg:grid-cols-[1fr_auto] lg:items-center">
        <p class="m-0 max-w-3xl text-muted-foreground">
          <span class="mr-2 font-mono text-xs tracking-wider text-line uppercase">Note</span>
          Floorplan helps you think a design through and get a rough idea of its cost. It does not replace an architect,
          an engineer or plan approval. Rates are examples, not quotes, and the checks are a guide to SANS 10400 that
          must be confirmed against the standard.
        </p>
        <div class="flex flex-wrap gap-3">
          <a href={app} class="inline-flex items-center gap-2 bg-brick px-5 py-3 font-semibold text-brick-foreground hover:bg-brick/90">Open the app<ArrowRight class="size-4" /></a>
          <a href={start} class="border-[1.5px] border-rule px-5 py-3 font-semibold hover:bg-accent">Start a new project</a>
        </div>
      </div>
    </section>
  </main>

  <footer class="bg-[#1b2430] text-[#c9ced6] dark:border-t dark:border-rule">
    <div class="wrap flex flex-col gap-8 pt-12 pb-8">
      <div class="flex flex-wrap items-start justify-between gap-8">
        <a href={resolve('/')} aria-label="Fermain Floorplan, home" class="block">
          <img src={asset('/brand/floorplan-dark.svg')} alt="" width="232" height="48" class="block" loading="lazy" />
        </a>
        <div class="grid grid-cols-[repeat(2,minmax(0,max-content))] gap-x-10 gap-y-2.5 text-[15px] text-[#f6f4ee]">
          <a href="#tour" class="hover:underline">Features</a>
          <a href={app} class="hover:underline">Open the app</a>
          <a href="#examples" class="hover:underline">Examples</a>
          <a href={REPO} rel="noreferrer" class="hover:underline">Source on GitHub</a>
          <a href="#community" class="hover:underline">For the community</a>
          <a href={PRO} class="hover:underline">Floorplan Pro</a>
        </div>
      </div>
      <div class="flex flex-wrap items-center justify-between gap-4 border-t border-[#3a4452] pt-5 font-mono text-xs tracking-[0.06em] uppercase">
        <span>Free and open source</span>
        <a href="https://ferma.in" class="hover:underline">Fermain Floorplan · by Fermain</a>
      </div>
    </div>
  </footer>
</div>

<style>
  /* The page's one column, and the two-part row most sections use: words in a narrow column on the left, a
     picture in a wide one on the right, both starting at the same height. */
  .wrap {
    width: 100%;
    max-width: 80rem;
    margin-inline: auto;
    padding-inline: 1.25rem;
  }

  .row {
    display: grid;
    gap: 2rem;
    align-items: start;
  }

  @media (min-width: 640px) {
    .wrap {
      padding-inline: 2rem;
    }
  }

  @media (min-width: 1024px) {
    .wrap {
      padding-inline: 3rem;
    }

    .row {
      grid-template-columns: minmax(0, 5fr) minmax(0, 8fr);
      gap: 3.5rem;
    }
  }

  /* The faint blue grid of drawing paper. */
  .sheet-ground {
    background-image:
      linear-gradient(color-mix(in srgb, var(--line) 6%, transparent) 1px, transparent 1px),
      linear-gradient(90deg, color-mix(in srgb, var(--line) 6%, transparent) 1px, transparent 1px);
    background-size: 24px 24px;
  }
</style>

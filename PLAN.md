# Floorplan multi-agent plan

Status: accepted. Wave 0 scaffold is committed. Wave 1 spikes are next.

Orchestrator: the parent agent in this chat. Workers: Cursor Composer agents (`composer-2.5-fast`), local, `generalPurpose`. They share this working tree. They do not commit. Cloud agents are not part of this plan.

## What this prototype is

A browser tool for one irregular plot. The user edits each floor in 2D, pulls a single wall into a flat elevation to place openings, and uses the 3D view to look at the result and the sun. Walls are runs of blocks. A hardcoded plot and heightfield stand in for GIS imports.

## Decisions already made

These are fixed for the swarm. They come from the brief plus the research below.

- Client only. Vite, Svelte 5, TypeScript, Threlte 8 (`@threlte/core` and `@threlte/extras`), Three.js. No SvelteKit. There is no server render, and Threlte's `Canvas` is a browser object.
- Package manager: pnpm.
- Internal unit: metres. Display may show millimetres later; the model does not store millimetres.
- The architectural document is plain JSON-serialisable data. Svelte 5 runes hold it. Three.js objects are derived and discarded. They never sit in `$state`.
- 2D plan editing is an SVG view, one floor at a time. Elevation editing is the Threlte orthographic camera locked to one wall. The perspective view is for looking, shadows, and later a walkthrough. It is not the editor.
- Go is not in this plan. Turf and a heightfield sample are small for one plot. A worker is the first offload, and only if the CSG spike measures a stall. A Go API waits on a later measurement that a worker cannot absorb.
- Experiments stay in the repo behind a dev switch. They are evidence, not disposable scratch.
- Agents do not add code comments. The diff is the explanation.

### Provisional construction constants

Used everywhere so agents do not invent their own. Change them in one module later if the sizes are wrong. They are ordinary UK concrete-block figures, chosen so the prototype has a module.

| Constant | Value |
| --- | --- |
| Block length | 0.44 m |
| Block height | 0.215 m |
| Block thickness | 0.10 m |
| Cavity (double skin) | 0.05 m |
| Default storey height | 2.40 m |
| Floor-to-floor datum | 2.80 m |
| Default sill | 0.90 m |
| Default window height | 1.20 m |
| Default door width / height | 0.90 m / 2.10 m |

Single skin thickness is one block. Double skin thickness is two blocks plus the cavity. An invisible wall has no thickness and no mesh. Drawing snaps length to the block module when it can. A cut block is allowed at a corner so a wall can still meet a neighbour that the plot geometry demands. Walls may not leave the plot ring.

### Hardcoded site fixture

Every spike and the app load this, from `src/lib/plot/fixture.ts` once that file exists. Spikes may inline the same numbers before that module exists.

Plot ring, metres, CCW, unclosed:

`[0, 0], [18, 1], [22, 14], [8, 20], [-2, 11]`

True-north bearing: 18° clockwise from plan +Y. Geodetic origin for the sun: latitude 51.5, longitude -0.12. The origin is only for solar altitude and azimuth. Coordinates in the ring are already metres. A degree-valued GeoJSON or KML is rejected. Reprojection is out of scope.

Heightfield: origin `(-4, -4)`, 28 by 28 cells, cell size 1 m. Height at cell `(c, r)` is `0.04 * c + 1.6 * smoothstep` across the diagonal, peaking near 2 m, so a wall across the plot has a visible grade change. Exact function lives next to the fixture and is shared.

## Research that changed the plan

### Stack as of this writing

- `@threlte/core` 8.5.x, Svelte 5, peer `three >= 0.160`. `@threlte/extras` 9.x peers that core. The Threlte repo itself develops against Vite 7 and Three r175. `npm create threlte` is deprecated. Scaffold with Vite's Svelte template, then add Threlte.
- Threlte cameras resize the frustum unless `manual` is set. The elevation camera sets `manual` and `makeDefault`. Without `makeDefault`, Threlte keeps rendering through its own camera and the ortho lock appears to do nothing.
- Do not pass `lookAt={[x, y, z]}` on `<T.PerspectiveCamera>`. Threlte assigns that prop onto the camera and replaces the `lookAt` method, and `OrbitControls` then throws. Aim the camera with `oncreate={(ref) => ref.lookAt(x, y, z)}`.
- Turf 7.4 changed boolean-operation edge cases. Import the small packages (`@turf/boolean-intersects`, `@turf/boolean-point-in-polygon`, `@turf/line-intersect`), pin one Turf major, and test the plot-boundary checks.
- `three-csg-ts` 3.2.0 (May 2024) is the library the brief names. It is a BSP port. Both meshes need `updateMatrix()` before `CSG.subtract`, or the hole lands at the identity. Peer range is `three >= 0.154`, so it can sit next to Threlte's Three, but it is not the fast path. `three-bvh-csg` is the faster, maintained alternative; the original CSG author points people at it. The spike still times `three-csg-ts`, because that is the brief, and it times two controls so a bad number has a meaning.

### What to take from each reference

[ch-bas/threejs-sims-house-builder](https://github.com/ch-bas/threejs-sims-house-builder) (MIT). A client-side Sims build mode. `RoomLayout` owns `floors[]`. `FloorLayout` owns the active floor's contents. Undo is a snapshot of the layout, capped, debounced, so one gesture is one entry. Pure helpers live apart from rendering (`geometry.ts`, `wall-snap.ts`, `opening-snap.ts`). Interior door and window cuts are `ExtrudeGeometry` holes, in `three/wall-openings.ts` and `three/interior-walls.ts`. Their sun is a cosmetic arc, not a geographic position. Their own design notes record the limit we must not copy: rooms are not recovered from walls.

Leave the React context, the furniture catalog, roofs, NPCs, achievements, and the grid-room assumption. Issue #3 on that repo is the re-render problem runes are here to avoid. Also leave their "render the Three scene from React effects" loop. Threlte already owns the frame.

[charmlinn/blueprint3d-modern](https://github.com/charmlinn/blueprint3d-modern) (MIT). The data model to adapt. A floor is a corner-and-wall graph. New walls that cross old ones insert a corner and split both edges. Rooms are the smallest cycles of that graph. A wall has a front and a back half-edge, which is how thickness and corners meet. The 2D editor and the Three view are separate surfaces fed by one model. The model emits a change; it does not know about cameras.

Leave the freeform thickness, the OBJ furniture, the Next.js app, and the single-floor limit (it is still on their roadmap). Our thickness comes from the block module. Our floors are a list, in the Sims shape, each holding one of these graphs.

[Yytsi/floorplan-to-3d](https://github.com/Yytsi/floorplan-to-3d). Not an editor. The useful piece is `viewer/index.html`: a polygon becomes a `THREE.Shape` (holes included), `ExtrudeGeometry` with `bevelEnabled: false`, then `rotation.x = -π/2` so the extrusion axis becomes up. Windows are a separate slab from sill to head, not a boolean hole. That is the control mesh for the CSG spike, and the likely production mesh if the spike is slow.

Leave the UNet, the Python server, and image-space coordinates. Our polygons are already in metres.

### Mesh strategy, pending the spike

The document stores block runs and openings. An opening is a gap in the courses it crosses, clipped to the block module in height and to the opening rectangle in length. That matches "geometry constrained by the blocks."

`three-csg-ts` is on trial for the visual solid. If ten openings on one double-skin wall take longer than a frame, production keeps the block-gap mesh. Shape holes are the middle control: one solid wall, rectangular holes, no BSP. The spike reports all three.

Budgets, median of 5 runs after one warmup, timed around the operation only:

| Median | Consequence |
| --- | --- |
| under 16 ms | Main thread is acceptable for a committed edit |
| 16–100 ms | Worker, or defer until pointer-up |
| over 100 ms | Drop CSG from the edit path |

Live dragging never waits on CSG. Placement shows a marker. The solid updates on pointer-up.

### Elevation click mapping

Wall frame: origin at corner A on the floor datum, X along the wall in the horizontal plane, Y world up, Z the horizontal normal `cross(X, Y)`.

The ortho camera sits on the Z axis, looks at the wall, and uses `manual` frustum bounds from the wall's length and height, corrected for the canvas aspect.

A pointer unprojects through that camera onto the wall plane. Local coordinates are `u = dot(hit - origin, X)`, `v = dot(hit - origin, Y)`. This function is pure and unit-tested. The scene only proves the camera transition and that a click feeds it.

### Terrain drape

Sample the wall centerline at `min(cellSize, 0.25 m)`, bilinear in the heightfield. Bottom vertices use those samples. The top stays on the storey datum plus storey height, and never closer than one block course to the local grade. A straight bottom edge between the two corners is the failure case on a curve: the sample spacing exists to close that gap. The test asserts every bottom vertex is within 1 mm of the bilinear sample. Double skin means two offset centerlines, each draped.

Ground floor only. Upper floors sit on the datum.

### Sun

`suncalc` `getPosition(date, lat, lng)` gives altitude and azimuth. The plot bearing rotates the building relative to true north. A directional light sits on that vector far enough to cover the plot, with a shadow map. Summer and winter presets are the solstices at the fixture origin. A scrubber moves the hour. This replaces the Sims colour arc.

### 2D export

SVG of the active floor: plot ring, wall skins as filled polygons, openings as gaps, logical walls dashed, north arrow, scale bar. Download via a blob. PNG of the 3D view and PDF are out of scope.

### Import surface

`loadPlot` accepts a GeoJSON `Polygon` in local metres plus properties `northBearingDeg`, `latitude`, `longitude`. KML is converted to that shape only when its coordinates are already in metres. Degree coordinates throw. The app boots from the fixture. A file input can replace it, which is enough to honour the import requirement without a CRS library.

Heightfield JSON: `{ originX, originZ, cellSize, cols, rows, heights: number[] }`. GeoTIFF waits.

## Repository layout

```
src/
  main.ts
  App.svelte                 # shell only; wave 5
  lib/
    plot/fixture.ts          # ring, bearing, origin, heightfield
    model/                   # pure document, no three, no svelte
    state/document.svelte.ts # runes + mutations
    geometry/                # mesh builders, no svelte
    solar/                   # pure sun vector
    export/svg.ts
  view/
    plan/                    # SVG floor editor
    elevation/               # ortho wall editor
    review/                  # perspective + sun
  experiments/
    ortho/
    terrain/
    csg/
```

`App.svelte` gains a dev query `?exp=ortho|terrain|csg` during wave 0, defaulting to an empty scene until wave 5.

## Agent rules

Every worker prompt will include these, plus the charter for that wave. Workers cannot see this chat.

- Read this plan and follow the charter. Edit only the owned paths.
- Install nothing unless the charter says so. Wave 0 is the only agent that edits `package.json`, lockfile, or Vite config.
- Do not reformat unrelated files. Do not add comments. Do not commit.
- Do not port reference repositories. Study the idea named in the charter, then write a small version.
- Pure functions get Vitest coverage for the cases named in the charter.
- When finished, report: files touched, how to run the check, numbers the charter asked for, and anything that contradicted this plan.

The orchestrator reads the diff before the next wave. Edits outside the charter are reverted before continuing. A spike that misses its budget changes the mesh decision in this file before wave 2, and that is the pause point if the consequence is ambiguous.

## Waves

### Wave 0 — scaffold

One agent. Owns the repo root and `src/main.ts`, `src/App.svelte`, `src/experiments/` empty routes.

- Vite + Svelte 5 + TypeScript, strict.
- `three`, `@types/three`, `@threlte/core@8`, `@threlte/extras`.
- Vitest, `svelte-check`, Prettier, `eslint-plugin-svelte`.
- Dependencies the later waves need, so they do not touch the lockfile: `three-csg-ts`, `three-bvh-csg`, the Turf packages listed above, `suncalc` and its types if published.
- A Threlte canvas, one mesh, orbit controls from extras. `?exp=` switches experiment roots that render a labelled empty state.
- Scripts: `dev`, `build`, `check`, `test`.

Done when `pnpm check`, `pnpm test` (a trivial test is fine), and `pnpm build` succeed, and `pnpm dev` shows the mesh.

### Wave 1 — three spikes, parallel

No shared files. Each spike inlines the fixture numbers. None of them edit `src/lib`.

**Ortho.** Owns `src/experiments/ortho/**`.

Render one straight wall in perspective. A control moves the camera to the orthographic frame described above. A click reports `u, v` and drops a rectangle marker of the default window. Vitest covers the unproject helper: a known point on the wall maps back within 5 mm, including a click near a corner. Camera motion can be instant; a tween is unnecessary.

Done when the scene demonstrates the lock and the unit test passes.

**Terrain.** Owns `src/experiments/terrain/**`.

Displace a ground mesh from the fixture heightfield. Draw one double-skin centerline across the slope. Build the draped wall. Vitest feeds the same samples and asserts the 1 mm bound, including a centerline that is not aligned to the grid. The scene shows the seam.

Done when the assertion holds on a steep diagonal and on a line that crests the high part of the field.

**CSG.** Owns `src/experiments/csg/**`.

Build one 4 m double-skin wall from the block constants (both leaves, full courses). Punch 10 default windows through it with `three-csg-ts`. Time that call. Repeat with `three-bvh-csg`, with one `ExtrudeGeometry` shape that has 10 rectangular holes, and with block runs that omit the opening intervals. Log median milliseconds. Write the numbers into `src/experiments/csg/results.json` so the orchestrator can read them without parsing prose.

Done when `results.json` has the four medians and the scene shows the `three-csg-ts` result.

### Wave 2 — document

One agent, after the spike gate. Owns `src/lib/model/**`, `src/lib/state/**`, `src/lib/plot/**`.

Document, roughly:

- `Plot`, `Heightfield`
- `Building` → `floors[]` → corner/wall graph
- `Wall`: id, corner ids, `skin: 'single' | 'double' | 'logical'`, openings[]
- `Opening`: id, `u`, `v`, width, height, `kind: 'window' | 'door'`, `aligned` (default true; false means the user overrode the shared sill and head)
- Rooms derived from half-edge cycles, each with a floor finish id
- Mutations: add corner, add wall, split on intersection, move corner, add or edit opening, toggle alignment, add or remove floor, assign finish
- Reject a wall that leaves the plot (`@turf/boolean-point-in-polygon` on both corners and `@turf/line-intersect` against the ring)
- History: clone the document, cap 50, one entry per completed gesture
- Fixture module loaded into a rune store

Borrow the cycle walk and the intersection split from blueprint3d's model, and the floor list plus snapshot history from the Sims builder. Vitest: a crossing splits both walls; a closed rectangle yields one room; a logical wall splits that room into two; a segment outside the fixture ring is rejected; undo restores the previous document; aligned openings share sill and head until one is overridden.

Done when those tests pass and the store can load the fixture. No meshes, no views.

### Wave 3 — kernels, parallel

The model files are frozen. These agents import them and do not edit them.

**Wall mesh.** Owns `src/lib/geometry/walls.ts` and its test. Courses of boxes, double skin offset by the cavity, openings as gaps, corners ended by intersecting the offset edges so two walls meet. Uses the mesh strategy recorded after wave 1.

**Terrain mesh.** Owns `src/lib/geometry/terrain.ts` and its test. Heightfield mesh, and a function that returns the bottom samples for a wall. Ground-floor walls consume it. Move the spike's drape into this module and keep the 1 mm test.

**Sun.** Owns `src/lib/solar/**`. Pure function from date, origin, and bearing to a light direction and intensity. Vitest: noon on the summer solstice is higher than noon on the winter solstice at the fixture; azimuth respects the 18° bearing.

**SVG.** Owns `src/lib/export/svg.ts` and its test. Given a document and a floor id, return an SVG string with the layers listed above. Vitest checks that a logical wall is present as a dashed element and an opening removes wall fill under its span.

### Wave 4 — views, parallel

The kernels are frozen. Views call mutations and kernel functions. They do not edit `App.svelte`.

**Plan.** Owns `src/view/plan/**`. SVG of the active floor over the plot. Draw a wall by two clicks, snap to module, snap a corner onto an existing corner within 0.15 m, split crossings via the mutation. Select a wall. Invisible-wall tool. Finish assignment on a room polygon. Floor switcher. Rejected segments show a transient message from the mutation result.

**Elevation.** Owns `src/view/elevation/**`. Enter from a selected wall. Ortho lock from the spike, moved here. Click places a window at the shared sill; a modifier or a toggle places an unaligned one at the click. Drag adjusts `u` and `v` only while unaligned; aligned drags change `u` and keep the sill. Doors sit on the floor. Readouts in metres.

**Review.** Owns `src/view/review/**`. Perspective camera, orbit controls, terrain, walls, a sun scrubber, solstice presets. Shadows on. Openings visible as gaps.

Each view can render on its own with the fixture store, so it can be checked before the shell exists.

### Wave 5 — shell, then a manual pass

One agent. Owns `src/App.svelte` and `src/main.ts` only, plus a thin `src/view/shell` if the root component would otherwise grow past a mode switch.

Modes: Plan, Elevation (disabled until a wall is selected), Review. The dev `?exp=` switch remains. Wire the fixture. Keyboard: undo, redo, delete selected wall or opening, escape leaves elevation.

The orchestrator then runs the app and checks:

- Draw a wall inside the plot, and a segment that crosses the boundary.
- Cross two walls and see one room become two, one of them via a logical wall.
- Lock elevation, place an aligned window, override a second window off the sill line, return to plan and review and see both.
- Solstice presets move the shadow.
- SVG download contains the wall and the opening.
- `?exp=ortho`, `terrain`, and `csg` still render.

## Out of scope

Roofs, stairs, furniture, textures, walkthrough, PDF, GLB, GeoTIFF, CRS reprojection, accounts, and a Go service. A walkthrough fits the brief's "3D is for looking" note and can follow this plan. It is not a wave.

## After acceptance

The orchestrator dispatches wave 0, reviews it, then wave 1 as three agents in one turn. Spike numbers are written back into a short "Spike results" section at the bottom of this file before wave 2. Implementation agents treat that section as the mesh decision.

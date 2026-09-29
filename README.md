# Floorplan: R&D Prototype Specification

Floorplan is an experimental game and web tool for designing property floor plans in the browser. While it shares DNA with traditional house-builders, this prototype focuses on unconstrained topological foundations (real-world GIS data) combined with discrete, composition-driven structural mechanics.

## Core Features & Requirements

* **Plot Boundary Import:** Plots must be importable via GIS exports (GeoJSON/KML), establishing true orientation, size, and shape.
* *R&D Constraint:* Use a single, hardcoded irregular plot shape during development.


* **Plot Height Map Import:** Integrate elevation data from GIS tools to generate a non-flat, gradient terrain mesh as the starting canvas.
* **Composition-Driven Walls:** Wall thickness is not arbitrary. Walls are composed of discrete block types (single or double-skinned). The geometry is constrained by these physical properties rather than freeform drawing.
* **Invisible Walls:** Logical separators to define room boundaries, zones, or flooring changes within open-plan spaces.
* **2D Floorplan Export:** Ability to generate and export a clean, standardized 2D architectural view of the design.
* **Environmental Simulation:** Real-time calculation of summer/winter solar paths (sunlight and shadows) based on the imported GIS plot orientation.
* **Precision Focus UX:** A camera-locking mechanism allowing the user to snap their perspective to a specific element (e.g., a single wall) for micro-adjustments, like budging window alignments.
* **Procedural Fenestration:** Windows and doors are procedurally generated with editable default parameters (size, sill height). They snap to consistent heights by default but allow manual, unaligned placement if overridden.

## UX Paradigm: Orthographic Plane Editing

While presented with game-like accessibility, the tool must offer deep control for serious users. The primary layout editing occurs per-floor in a 2D context to manage the complexity of building on a non-flat, non-grid terrain.

Crucially, **3D editing is minimized in favor of 2D Orthographic Plane Focus.**
Instead of wrestling with a 3D camera to edit a facade, the user can select a specific plane (e.g., the North Wall) and pull it into a flat, 2D elevation view. This allows for precise height adjustments, window placement, and decorative detailing on a 2D canvas, which automatically updates the 3D model. True 3D view is reserved primarily for rendering, walkthroughs, and environmental testing.

---

## Technical Directives & Stack

To build this prototype efficiently, agents should adhere to the following stack and architecture guidelines:

* **UI & State Management:** **Svelte 5 with TypeScript.** Leverage runes to handle the deeply nested reactivity required for architectural state (floor arrays containing wall arrays containing window nodes) without heavy virtual DOM diffing.
* **3D Rendering Canvas:** **Three.js** (via **Threlte** for declarative Svelte integration). Map the reactive architectural state directly to 3D meshes.
* **Data Processing:** If GIS parsing, topological triangulation, or heavy mesh calculations bottleneck the browser, offload processing to a fast **Go** backend API that returns optimized JSON or binary arrays to the client.
* **Spatial Math:** **Turf.js** for handling the 2D GIS plot boundaries, checking intersections, and ensuring walls stay within legal property lines.

Openings are clipped out of the block courses. The early ortho, terrain, and CSG spikes, including `three-csg-ts`, have been removed.

## Reference Repositories (Baselines)

Agents should review these existing implementations for architectural data structures and extrusion math:

* **`ch-bas/threejs-sims-house-builder`**: Benchmark for the "game-like" feel in the browser. Study its snapshot-based state management and how it handles multi-floor logic.
* **`charmlinn/blueprint3d-modern`**: Benchmark for clean separation between a 2D drawing canvas and a 3D renderer. Study its wall-to-wall intersection graph (how corners automatically snap and heal).
* **`Yytsi/floorplan-to-3d`**: Benchmark for the raw mathematics of extruding 2D lines into 3D volumes. Useful reference for taking the 2D Floorplan state and generating the Three.js geometry.
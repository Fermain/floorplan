# Feature avenues

The plan in `PLAN.md` is built and committed. This note is the work that plan left alone, plus the gaps the storey model opened. It is not a backlog and it does not change the plan.

A storey is a floor you draw. Up to four, one building at a time. An empty storey is a plate on the walls below. Walls may leave that plate. The slab follows the walls that exist, out to the outer face of the brick. Plate with no wall over it stays bare.

## Roofs

The bare plate is the area a roof would cover, and nothing draws it. The plan named roofs as out of scope, and as the alternative to adding another storey.

The open questions are the shape and the edge. A flat roof can sit on the same wall head the floor slab uses. A pitch needs a ridge, a fall, and a rule for what happens where an upper storey already occupies part of the plate. The eaves either stop at the outer brick or overhang it. A parapet is a wall that continues past the roof line, which the fixed 2.40 m storey height cannot express.

## Stairs

Storeys do not connect. You can stack four floors and never say how a person moves between them. The plan listed stairs with furniture and roofs, before a storey was a thing you could add.

A stair is a hole in the slab plus a run that lands on the floor below. The slab already knows the walls it covers. It does not know a void. The landing wants a wall or a node to arrive at, which the snap to the nodes below already suggests.

## Walls that do not land

A wall on an upper storey may miss the walls under it. The snap helps you hit a node. Nothing tells you that you missed, and nothing inserts a beam, a lintel, or a thicker slab where the floor cantilevers.

The light version is a warning when an upper wall's centreline does not lie on a wall below. The heavy version is a member that carries it. The model has no member that is not a wall.

## Height that is not the storey

Every wall on a storey is 2.40 m to the head, and the next floor is 2.80 m above the datum. That is the whole height system.

Unexplored: a wall that stops short (a half-height partition), a wall that continues past the roof (a parapet), a clerestory, a step in the floor. Any of these breaks the assumption that one index means one datum and one head.

## The ground under the building

The ground floor sits on a pad at the average grade of its rooms. The pad is a thin slab. The walls drape to the slope outside that decision. There is no footing, no depth below grade, and no cut or fill. A basement was considered and left alone. So was a retaining edge where the pad meets the slope.

## The plot as a rule, not a fence

A wall may not leave the ring. That is the only planning rule. A setback, a maximum coverage, a maximum height in metres, and a rule about how close two buildings on the same plot may stand are all unexplored. The ring is a clip. It is not a building line.

## Sun as a result

The review light is a real sun for the plot's latitude, longitude, and bearing, with solstice presets and an hour scrubber. It casts a shadow. It does not answer a question. Hours of sun on a wall, a shadow that crosses a neighbour, a room that never sees the winter sun: the direction vector is there, the reading is not.

## What the blocks add up to

Walls are courses of blocks, with cut blocks at corners and openings clipped out of the courses they cross. Nothing counts them. A schedule of whole blocks, cut blocks, and openings is a direct reading of the mesh inputs. It was never surfaced. Cost and weight would sit on top of that count, not instead of it.

## Drawings that are not the plan

SVG export is the active floor: plot, skins, openings, logical walls, north arrow, scale. Elevation is an editor, not a sheet. There is no section, no elevation drawing, and no 3D snapshot. PDF and GLB were named out of scope. A section through a storey stack is the one that the new model makes newly useful, because the floor zone and the bare plate only show up in review.

## Openings on a facade

Openings share a sill on one wall until you override one. They keep a block of clear wall between them. They do not share a sill with the next wall along the same face. A door on an upper storey is a hole in a wall. It is not a hole in the slab, and it does not imply a balcony or a landing.

## Real sites

Import replaces the fixture with a metre GeoJSON or KML polygon, or a heightfield JSON. Degree coordinates are rejected. GeoTIFF and reprojection were left out. The avenue is a real plot with a real grid, which means a CRS. Until that exists, every site is either the fixture or a file someone already converted to metres.

## Walking through it

The plan says a walkthrough fits "3D is for looking" and is not a wave. Review orbits a camera above the model. It does not put the eye at standing height on a slab, and it does not move from one storey to the next. The slabs and the bare plates are the floors that walk would stand on.

## Turning the plan

The compass in the corner of the plan is a cross on north. Clicking it restores the north-south grid, which is the default when no wall or plot edge is selected. It does not turn the sheet.

Later it becomes the rotation tool. The building stays in world coordinates. The view and the grid the user draws on turn together, so a direction that is not north-south can sit square on the screen. North stays marked on the compass.

## Left on purpose, still open

These were declined or deferred while the storey work was happening. They are still unexplored.

- Basements and any storey below the ground datum.
- A 15° angle grid while drawing.
- Pulling a wall face into a focus mode. Elevation stays a mode in the nav.
- Pre-loading storeys. A storey exists only because someone added it.

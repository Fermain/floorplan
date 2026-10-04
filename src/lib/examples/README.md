# Example projects

The project list offers a copy of each house listed in `index.ts`. Opening one saves a copy to the browser, so the
example itself never changes.

## Adding one

1. Build the house in Floorplan. Clear what Checks flags: the tests expect no plumbing, electrical or gas warnings.
2. From the project's `⋯` menu, choose **Download project file** and put the `.json` file in this folder.
3. Add an entry to `EXAMPLES` in `index.ts` with:
   - a name
   - where it is
   - a sentence or two about what it shows
   - a few highlights
   - your name as the author
   - a `load` that imports the file
4. Run `pnpm test`. `examples.test.ts` loads every example and checks it.

The off-grid, granny flat and city houses are built in code instead (`ecoOffGrid.ts` and the rest), through the
same edits a person makes. Either way works.

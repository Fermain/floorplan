<script lang="ts">
  import { goto } from '$app/navigation'
  import { version } from '$app/environment'
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { setMode, userPrefersMode } from 'mode-watcher'
  import * as Menubar from '$lib/components/ui/menubar'
  import { quantitiesCsv, takeoff } from '$lib/cost/quantities'
  import { alterations } from '$lib/geometry/alterations'
  import { homeHref, planHref, sectionHref, type ProjectSection } from '$lib/routes/links'
  import { documentStore } from '$lib/state/document.svelte'
  import { settings } from '$lib/state/settings.svelte'
  import { CUTAWAY_CHOICES, PLAN_TOOLS, view, WALLS_CHOICES, workspace, type CutawayChoice, type WallsChoice } from '$lib/state/workspace.svelte'

  // The menubar over a project: everything the toolbars and the project menu do, gathered under the headings
  // people know. It sits beside the existing controls and drives the same things.
  type Actions = {
    rename: () => void
    duplicate: () => void
    exportSvg: () => void
    exportJson: () => void
    remove: () => void
    openCopy: () => void
    settings: () => void
  }
  let { id, active, viewing, actions }: { id: string; active: ProjectSection; viewing: boolean; actions: Actions } = $props()

  const doc = $derived(documentStore.document)
  const plan = $derived(workspace.plan)
  const onPlan = $derived(active === 'plan' && plan !== null)
  const deletable = $derived(plan?.deletable() ?? null)
  const changes = $derived(alterations(doc))
  const storeys = $derived([...new Set(doc.building.floors.map((floor) => floor.index))].sort((a, b) => a - b))
  const storey = $derived(String(Math.max(0, Number(page.params.storey ?? 0) || 0)))
  const sections: { id: ProjectSection; label: string }[] = [
    { id: 'plan', label: 'Plan' },
    { id: 'review', label: '3D review' },
    { id: 'quantities', label: 'Quantities' },
    { id: 'checks', label: 'Checks' },
    { id: 'project', label: 'Project settings' },
  ]
  const storeyName = (index: number) => (index === 0 ? 'Ground floor' : `Storey ${index + 1}`)

  function download(name: string, type: string, body: string) {
    const url = URL.createObjectURL(new Blob([body], { type }))
    const link = window.document.createElement('a')
    link.href = url
    link.download = name
    link.click()
    URL.revokeObjectURL(url)
  }

  // A tool is taken up at once on the plan, or as the plan opens from another view.
  function draw(tool: string) {
    if (!workspace.wantTool(tool)) void goto(planHref(id))
  }

  function confirmed(question: string, run: () => unknown) {
    if (window.confirm(question)) run()
  }
</script>

<Menubar.Root class="h-7 rounded-none border-0 p-0 text-[13px]">
  <Menubar.Menu>
    <Menubar.Trigger class="h-7 px-2 font-normal">File</Menubar.Trigger>
    <Menubar.Content class="min-w-56">
      <Menubar.Item onSelect={() => void goto(resolve('/app/new'))}>New project…</Menubar.Item>
      <Menubar.Item onSelect={() => void goto(homeHref())}>All projects and examples</Menubar.Item>
      <Menubar.Separator />
      {#if viewing}
        <Menubar.Item onSelect={actions.openCopy}>Open a copy to edit</Menubar.Item>
      {:else}
        <Menubar.Item onSelect={actions.rename}>Rename…</Menubar.Item>
        <Menubar.Item onSelect={actions.duplicate}>Duplicate</Menubar.Item>
      {/if}
      <Menubar.Separator />
      <Menubar.Sub>
        <Menubar.SubTrigger>Export</Menubar.SubTrigger>
        <Menubar.SubContent class="min-w-52">
          <Menubar.Item onSelect={actions.exportSvg}>Plan of this storey, as SVG</Menubar.Item>
          <Menubar.Item onSelect={() => download('quantities.csv', 'text/csv', quantitiesCsv(takeoff(doc)))}>Quantities, as CSV</Menubar.Item>
          <Menubar.Item onSelect={actions.exportJson}>Project file</Menubar.Item>
        </Menubar.SubContent>
      </Menubar.Sub>
      <Menubar.Separator />
      <Menubar.Item onSelect={actions.settings}>Settings…</Menubar.Item>
      {#if !viewing}
        <Menubar.Separator />
        <Menubar.Item variant="destructive" onSelect={actions.remove}>Delete project…</Menubar.Item>
      {/if}
    </Menubar.Content>
  </Menubar.Menu>

  {#if !viewing}
    <Menubar.Menu>
      <Menubar.Trigger class="h-7 px-2 font-normal">Edit</Menubar.Trigger>
      <Menubar.Content class="min-w-56">
        <Menubar.Item onSelect={() => documentStore.undo()}>Undo<Menubar.Shortcut>⌘Z</Menubar.Shortcut></Menubar.Item>
        <Menubar.Item onSelect={() => documentStore.redo()}>Redo<Menubar.Shortcut>⇧⌘Z</Menubar.Shortcut></Menubar.Item>
        <Menubar.Separator />
        <Menubar.Item disabled={!deletable} onSelect={() => deletable?.run()}>
          {deletable?.label ?? 'Delete what is picked'}<Menubar.Shortcut>⌫</Menubar.Shortcut>
        </Menubar.Item>
        <Menubar.Separator />
        <Menubar.Label class="text-xs font-normal text-muted-foreground">Alterations</Menubar.Label>
        {#if changes}
          <Menubar.Item disabled={!changes.any} onSelect={() => confirmed('Take the house as it is drawn now as the house as built?', () => documentStore.markAsBuilt(Date.now()))}>
            Mark as built again
          </Menubar.Item>
          <Menubar.Item disabled={!changes.any} onSelect={() => confirmed('Put the drawing back to the house as built? Undo brings the changes back.', () => documentStore.revertToBuilt())}>
            Put the drawing back
          </Menubar.Item>
          <Menubar.Item onSelect={() => confirmed('Stop comparing with the house as built?', () => documentStore.clearBaseline())}>Stop comparing</Menubar.Item>
        {:else}
          <Menubar.Item onSelect={() => documentStore.markAsBuilt(Date.now())}>Mark the house as built</Menubar.Item>
        {/if}
      </Menubar.Content>
    </Menubar.Menu>
  {/if}

  <Menubar.Menu>
    <Menubar.Trigger class="h-7 px-2 font-normal">View</Menubar.Trigger>
    <Menubar.Content class="min-w-56">
      <Menubar.RadioGroup value={active} onValueChange={(next) => void goto(sectionHref(id, next as ProjectSection))}>
        {#each viewing ? sections.filter((section) => section.id !== 'project') : sections as section (section.id)}
          <Menubar.RadioItem value={section.id} closeOnSelect>{section.label}</Menubar.RadioItem>
        {/each}
      </Menubar.RadioGroup>
      <Menubar.Separator />
      <Menubar.Label inset class="text-xs font-normal text-muted-foreground">Plan</Menubar.Label>
      <Menubar.Item inset disabled={!onPlan} onSelect={() => plan?.zoomBy(1.25)}>Zoom in<Menubar.Shortcut>+</Menubar.Shortcut></Menubar.Item>
      <Menubar.Item inset disabled={!onPlan} onSelect={() => plan?.zoomBy(0.8)}>Zoom out<Menubar.Shortcut>−</Menubar.Shortcut></Menubar.Item>
      <Menubar.Item inset disabled={!onPlan} onSelect={() => plan?.fit()}>Fit the plot</Menubar.Item>
      {#if storeys.length > 1}
        <Menubar.Sub>
          <Menubar.SubTrigger inset>Storey</Menubar.SubTrigger>
          <Menubar.SubContent>
            <Menubar.RadioGroup value={active === 'plan' ? storey : ''} onValueChange={(next) => void goto(planHref(id, Number(next)))}>
              {#each storeys as index (index)}
                <Menubar.RadioItem value={String(index)} closeOnSelect>{storeyName(index)}</Menubar.RadioItem>
              {/each}
            </Menubar.RadioGroup>
          </Menubar.SubContent>
        </Menubar.Sub>
      {/if}
      {#if changes}
        <Menubar.CheckboxItem bind:checked={view.showChanges}>Show what has changed</Menubar.CheckboxItem>
      {/if}
      <Menubar.Separator />
      <Menubar.Label inset class="text-xs font-normal text-muted-foreground">3D review</Menubar.Label>
      <Menubar.CheckboxItem bind:checked={view.xray}>Services through the walls</Menubar.CheckboxItem>
      <Menubar.Sub>
        <Menubar.SubTrigger inset>Cutaway</Menubar.SubTrigger>
        <Menubar.SubContent>
          <Menubar.RadioGroup value={view.cutaway} onValueChange={(next) => (view.cutaway = next as CutawayChoice)}>
            {#each CUTAWAY_CHOICES as choice (choice.value)}
              <Menubar.RadioItem value={choice.value}>{choice.label}</Menubar.RadioItem>
            {/each}
          </Menubar.RadioGroup>
        </Menubar.SubContent>
      </Menubar.Sub>
      <Menubar.Sub>
        <Menubar.SubTrigger inset>Walls</Menubar.SubTrigger>
        <Menubar.SubContent>
          <Menubar.RadioGroup value={view.walls} onValueChange={(next) => (view.walls = next as WallsChoice)}>
            {#each WALLS_CHOICES as choice (choice.value)}
              <Menubar.RadioItem value={choice.value}>{choice.label}</Menubar.RadioItem>
            {/each}
          </Menubar.RadioGroup>
        </Menubar.SubContent>
      </Menubar.Sub>
      <Menubar.Separator />
      <Menubar.Sub>
        <Menubar.SubTrigger inset>Theme</Menubar.SubTrigger>
        <Menubar.SubContent>
          <Menubar.RadioGroup value={userPrefersMode.current} onValueChange={(next) => setMode(next as 'system' | 'light' | 'dark')}>
            <Menubar.RadioItem value="system">As this device</Menubar.RadioItem>
            <Menubar.RadioItem value="light">Light</Menubar.RadioItem>
            <Menubar.RadioItem value="dark">Dark</Menubar.RadioItem>
          </Menubar.RadioGroup>
        </Menubar.SubContent>
      </Menubar.Sub>
      <Menubar.CheckboxItem bind:checked={() => settings.hints, (next) => settings.set({ hints: next })}>Tips in the status bar</Menubar.CheckboxItem>
    </Menubar.Content>
  </Menubar.Menu>

  {#if !viewing}
    <Menubar.Menu>
      <Menubar.Trigger class="h-7 px-2 font-normal">Draw</Menubar.Trigger>
      <Menubar.Content class="min-w-48">
        <Menubar.RadioGroup value={onPlan ? (plan?.tool() ?? '') : ''} onValueChange={(next) => draw(next)}>
          {#each PLAN_TOOLS as tool, i (tool.value)}
            {#if i === 1 || i === 4 || i === 8}<Menubar.Separator />{/if}
            <Menubar.RadioItem value={tool.value} closeOnSelect>
              {tool.label}{#if tool.hint}<Menubar.Shortcut>{tool.hint}</Menubar.Shortcut>{/if}
            </Menubar.RadioItem>
          {/each}
        </Menubar.RadioGroup>
      </Menubar.Content>
    </Menubar.Menu>
  {/if}

  <Menubar.Menu>
    <Menubar.Trigger class="h-7 px-2 font-normal">Help</Menubar.Trigger>
    <Menubar.Content class="min-w-52">
      <Menubar.Item onSelect={() => void goto(resolve('/'))}>About Floorplan</Menubar.Item>
      <Menubar.Item onSelect={() => window.open('https://github.com/Fermain/floorplan', '_blank', 'noopener')}>Source on GitHub</Menubar.Item>
      <Menubar.Item onSelect={() => window.open('https://github.com/Fermain/floorplan/issues', '_blank', 'noopener')}>Report a problem</Menubar.Item>
      <Menubar.Separator />
      <Menubar.Label class="font-normal text-muted-foreground">Version {version}</Menubar.Label>
    </Menubar.Content>
  </Menubar.Menu>
</Menubar.Root>

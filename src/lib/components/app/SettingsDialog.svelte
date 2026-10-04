<script lang="ts">
  import Download from '@lucide/svelte/icons/download'
  import Upload from '@lucide/svelte/icons/upload'
  import { Button } from '$lib/components/ui/button'
  import * as Dialog from '$lib/components/ui/dialog'
  import { makeBackup, readBackup } from '$lib/state/backup'
  import { listProjects, readProject, saveProject } from '$lib/state/projects'
  import { settings } from '$lib/state/settings.svelte'

  // Settings for the app as a whole: how it behaves here, and the safekeeping of what is stored in this browser.
  let { open = $bindable(false), onrestored }: { open?: boolean; onrestored?: () => void } = $props()

  let usage = $state<{ used: number; quota: number } | null>(null)
  let count = $state(0)
  let message = $state<{ text: string; error: boolean } | null>(null)
  let busy = $state(false)

  $effect(() => {
    if (!open) return
    message = null
    void listProjects().then((projects) => (count = projects.length))
    void navigator.storage?.estimate?.().then((estimate) => {
      if (estimate.usage !== undefined && estimate.quota) usage = { used: estimate.usage, quota: estimate.quota }
    })
  })

  const megabytes = new Intl.NumberFormat('en-ZA', { maximumFractionDigits: 1 })
  const size = (bytes: number) => (bytes >= 1e9 ? `${megabytes.format(bytes / 1e9)} GB` : `${megabytes.format(bytes / 1e6)} MB`)

  async function backUp() {
    busy = true
    try {
      const projects = []
      for (const project of await listProjects()) {
        const document = await readProject(project.id)
        if (document) projects.push({ name: project.name, updatedAt: project.updatedAt, document })
      }
      const url = URL.createObjectURL(new Blob([JSON.stringify(makeBackup(projects, Date.now()))], { type: 'application/json' }))
      const link = window.document.createElement('a')
      link.href = url
      link.download = `floorplan-backup-${new Date().toISOString().slice(0, 10)}.json`
      link.click()
      URL.revokeObjectURL(url)
      message = { text: `${projects.length} ${projects.length === 1 ? 'project' : 'projects'} written to the backup file.`, error: false }
    } finally {
      busy = false
    }
  }

  async function restore(event: Event) {
    const input = event.currentTarget
    if (!(input instanceof HTMLInputElement) || !input.files?.[0]) return
    const file = input.files[0]
    input.value = ''
    busy = true
    try {
      const read = readBackup(await file.text())
      if (!read.ok) {
        message = { text: read.reason, error: true }
        return
      }
      let added = 0
      for (const project of read.projects) {
        const saved = await saveProject(null, project.name, project.document)
        if (saved.ok) added += 1
      }
      count += added
      const skipped = read.projects.length - added + read.skipped
      message = {
        text: `${added} ${added === 1 ? 'project' : 'projects'} added beside the ones already here${skipped > 0 ? `; ${skipped} could not be read` : ''}.`,
        error: false,
      }
      onrestored?.()
    } finally {
      busy = false
    }
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="gap-0 p-0 sm:max-w-lg">
    <Dialog.Header class="border-b px-4 py-3">
      <Dialog.Title class="text-base">Settings</Dialog.Title>
      <Dialog.Description class="sr-only">How the app behaves in this browser, and backing up what it stores here.</Dialog.Description>
    </Dialog.Header>
    <div class="border-b bg-muted px-4 py-1.5 text-[13px] font-semibold">While drawing</div>
    <label class="flex cursor-pointer items-start gap-3 border-b px-4 py-3 text-sm">
      <input
        type="checkbox"
        class="mt-0.5 size-4 accent-primary"
        checked={settings.hints}
        onchange={(event) => settings.set({ hints: event.currentTarget.checked })}
      />
      <span>
        <span class="font-medium">Show tips in the status bar</span>
        <span class="block text-muted-foreground">What the tool in hand does next. Problems always show.</span>
      </span>
    </label>
    <div class="border-b bg-muted px-4 py-1.5 text-[13px] font-semibold">Projects in this browser</div>
    <table class="sheet still">
      <tbody>
        <tr>
          <td class="label w-40 pl-4!">Projects</td>
          <td class="font-medium tabular-nums">{count}</td>
        </tr>
        <tr>
          <td class="label pl-4!">Space used</td>
          <td class="tabular-nums">{usage ? `${size(usage.used)} of ${size(usage.quota)} allowed` : 'Not reported by this browser'}</td>
        </tr>
      </tbody>
    </table>
    <div class="grid gap-3 px-4 py-3 text-sm">
      <p class="text-muted-foreground">
        Projects are kept only in this browser. Clearing its data, or moving to another device, loses them unless you
        keep a backup.
      </p>
      <div class="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" disabled={busy || count === 0} onclick={() => void backUp()}><Download />Back up all projects</Button>
        <Button variant="outline" size="sm" disabled={busy} onclick={() => document.getElementById('backup-file')?.click()}>
          <Upload />Restore from a backup…
        </Button>
        <input id="backup-file" class="hidden" type="file" accept=".json,application/json" onchange={restore} />
      </div>
      {#if message}
        <p class={message.error ? 'text-destructive' : 'text-muted-foreground'} aria-live="polite">{message.text}</p>
      {/if}
    </div>
  </Dialog.Content>
</Dialog.Root>

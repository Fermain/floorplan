import { BASE_DEFAULTS } from '../model/defaults'
import { DEFAULT_WALL_SYSTEM_ID } from '../model/systems'
import type { Heightfield, Plot, ProjectDefaults, WallSystemId } from '../model/types'
import { DEFAULT_SAMPLE_ID, type SamplePlotId } from '../plot/samples'

export type NewProjectDraft = ProjectDefaults & {
  name: string
  site: SamplePlotId | 'custom'
  customPlot: Plot | null
  customHeightfield: Heightfield | null
  systemId: WallSystemId
}

const KEY = 'floorplan:new-project'

function fresh(): NewProjectDraft {
  return {
    ...BASE_DEFAULTS,
    name: '',
    site: DEFAULT_SAMPLE_ID,
    customPlot: null,
    customHeightfield: null,
    systemId: DEFAULT_WALL_SYSTEM_ID,
  }
}

function restore(): NewProjectDraft {
  try {
    const raw = typeof sessionStorage === 'undefined' ? null : sessionStorage.getItem(KEY)
    if (raw) return { ...fresh(), ...JSON.parse(raw) }
  } catch {
    return fresh()
  }
  return fresh()
}

export const draft = $state<NewProjectDraft>(restore())

$effect.root(() => {
  $effect(() => {
    const snapshot = JSON.stringify(draft)
    try {
      sessionStorage.setItem(KEY, snapshot)
    } catch {
      return
    }
  })
})

export function resetDraft(): void {
  Object.assign(draft, fresh())
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    return
  }
}

export function draftDefaults(): ProjectDefaults {
  return {
    roofForm: draft.roofForm,
    roofCovering: draft.roofCovering,
    roofPitchDeg: draft.roofPitchDeg,
    roofEaves: draft.roofEaves,
    windowWidth: draft.windowWidth,
    windowHeight: draft.windowHeight,
    sill: draft.sill,
    doorHeight: draft.doorHeight,
    skirting: draft.skirting,
    cornice: draft.cornice,
  }
}

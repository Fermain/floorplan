import { BASE_DEFAULTS } from '../model/defaults'
import { DEFAULT_WALL_SYSTEM_ID, wallSystem } from '../model/systems'
import { openingDefaultsFor } from '../model/openings'
import type { Heightfield, Plot, ProjectDefaults, WallSystemId } from '../model/types'
import { DEFAULT_SAMPLE_ID, type SamplePlotId } from '../plot/samples'

export type NewProjectDraft = ProjectDefaults & {
  name: string
  site: SamplePlotId | 'custom'
  customPlot: Plot | null
  customHeightfield: Heightfield | null
  systemId: WallSystemId
  // The wall system the window and door sizes were made for; when the system changes they are made again.
  openingsFor: WallSystemId
}

const KEY = 'floorplan:new-project'

// A new house starts with a 600 mm concrete apron round it; older projects keep none until asked.
export const NEW_APRON_M = 0.6

function fresh(): NewProjectDraft {
  return {
    ...BASE_DEFAULTS,
    apronWidth: NEW_APRON_M,
    name: '',
    site: DEFAULT_SAMPLE_ID,
    customPlot: null,
    customHeightfield: null,
    systemId: DEFAULT_WALL_SYSTEM_ID,
    openingsFor: DEFAULT_WALL_SYSTEM_ID,
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

// Window and door sizes snap to the chosen wall's courses: clay sizes left on a block wall land between courses.
export function fitOpeningsToSystem(): void {
  if (draft.openingsFor === draft.systemId) return
  Object.assign(draft, openingDefaultsFor(wallSystem(draft.systemId)), { openingsFor: draft.systemId })
}

$effect.root(() => {
  $effect(() => {
    fitOpeningsToSystem()
  })
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
    apronWidth: draft.apronWidth,
    apronSurface: draft.apronSurface,
  }
}

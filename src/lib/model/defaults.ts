import {
  DEFAULT_DOOR_HEIGHT,
  DEFAULT_ROOF_EAVES,
  DEFAULT_ROOF_PITCH_DEG,
  DEFAULT_SILL,
  DEFAULT_WINDOW_HEIGHT,
  DEFAULT_WINDOW_WIDTH,
  WALL_HEAD,
} from '../plot/fixture'
import type { Document, ProjectDefaults } from './types'

export const BASE_DEFAULTS: ProjectDefaults = {
  roofForm: 'hip',
  roofCovering: 'concrete-tile',
  roofPitchDeg: DEFAULT_ROOF_PITCH_DEG,
  roofEaves: DEFAULT_ROOF_EAVES,
  windowWidth: DEFAULT_WINDOW_WIDTH,
  windowHeight: DEFAULT_WINDOW_HEIGHT,
  sill: DEFAULT_SILL,
  doorHeight: DEFAULT_DOOR_HEIGHT,
  skirting: 'rounded',
  cornice: 'rounded',
}

export function projectDefaults(document: Pick<Document, 'building'>): ProjectDefaults {
  return { ...BASE_DEFAULTS, ...(document.building.defaults ?? {}) }
}

export function defaultsProblem(defaults: ProjectDefaults): string | null {
  const positive = [defaults.windowWidth, defaults.windowHeight, defaults.doorHeight]
  if (positive.some((value) => !Number.isFinite(value) || value <= 0)) return 'sizes must be more than zero'
  if (!Number.isFinite(defaults.sill) || defaults.sill < 0) return 'sill cannot be below the floor'
  if (defaults.sill + defaults.windowHeight > WALL_HEAD + 1e-9) return 'window head is above the wall head'
  if (defaults.doorHeight > WALL_HEAD + 1e-9) return 'door head is above the wall head'
  if (!(defaults.roofPitchDeg > 0 && defaults.roofPitchDeg < 90)) return 'pitch out of range'
  if (!(defaults.roofEaves >= 0)) return 'eaves out of range'
  if (!['rounded', 'square', 'angled', 'none'].includes(defaults.skirting)) return 'unknown skirting'
  if (!['rounded', 'coral', 'none'].includes(defaults.cornice)) return 'unknown cornice'
  return null
}

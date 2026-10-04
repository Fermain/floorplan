// Settings for the app as a whole, kept in this browser beside the projects. They are about how the app behaves
// for this person, not about any one house.
export type AppSettings = {
  // Whether the status bar shows tips for the tool in hand. Problems always show.
  hints: boolean
}

const KEY = 'floorplan:settings'
const DEFAULTS: AppSettings = { hints: true }

export function readSettings(raw: string | null): AppSettings {
  if (!raw) return { ...DEFAULTS }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return { ...DEFAULTS }
    const value = parsed as Record<string, unknown>
    return { hints: typeof value.hints === 'boolean' ? value.hints : DEFAULTS.hints }
  } catch {
    return { ...DEFAULTS }
  }
}

function stored(): AppSettings {
  if (typeof localStorage === 'undefined') return { ...DEFAULTS }
  try {
    return readSettings(localStorage.getItem(KEY))
  } catch {
    return { ...DEFAULTS }
  }
}

let current = $state<AppSettings>(stored())

export const settings = {
  get hints() {
    return current.hints
  },
  set(patch: Partial<AppSettings>) {
    current = { ...current, ...patch }
    try {
      localStorage.setItem(KEY, JSON.stringify(current))
    } catch {
      // Private browsing or a full disk: the setting holds for this visit only.
    }
  },
}

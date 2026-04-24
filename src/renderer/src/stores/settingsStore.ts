import { defineStore } from 'pinia'
import type { NormalizeMode, RenderSettings } from '../types/settings'

const STORAGE_KEY = 'colorexchange.settings.v2'

function defaultSettings(): RenderSettings {
  return {
    normalizeMode: 'absolute',
    blackLevelEnabled: true,
    blackLevelPercentile: 1,
    thresholdEnabled: true,
    threshold: 10,
    climMin: 0,
    climMax: 250,
    colormap: 'jet',
    columns: 2,
    backgroundMode: 'colormap',
    colorbarReserveRatio: 0.1,
    showColorbar: true,
    colorbarLabel: 'Pixel intensity',
    colorbarFontSize: 20,
    colorbarAutoFont: true,
    colorbarWidth: 0.025,
    labelFontSize: 36,
    labelAutoFont: true,
    labelColor: '#ffffff',
    labelFontFamily: 'Times New Roman',
    labelBold: false,
    showRowSeparators: true,
    showColumnSeparators: false,
    separatorColor: '#595959',
    separatorLineWidth: 0.6,
    dpi: 300,
    outputFormat: 'png',
    outputPath: 'colorexchange_output.png',
    transparentBackground: false,
    previewMaxPixels: 1800
  }
}

function loadInitial(): RenderSettings {
  const base = defaultSettings()
  if (typeof localStorage === 'undefined') return base
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return base
    const saved = JSON.parse(raw) as Partial<RenderSettings>
    const merged = { ...base, ...saved }
    // Migration: the old default for colorbarReserveRatio was 0.16, which
    // produced very wide blank right margins. The auto-reserve logic in
    // python/mosaic_renderer.py now computes a tight value, and the new
    // default is 0.10. Users who never touched the slider should be moved
    // onto the new default automatically. (Values the user explicitly set
    // to anything else are preserved.)
    if (saved && typeof saved.colorbarReserveRatio === 'number'
        && Math.abs(saved.colorbarReserveRatio - 0.16) < 1e-6) {
      merged.colorbarReserveRatio = 0.10
    }
    return merged
  } catch {
    return base
  }
}

export const useSettingsStore = defineStore('settings', {
  state: (): RenderSettings => loadInitial(),
  actions: {
    setNormalizeMode(mode: NormalizeMode) {
      if (this.normalizeMode === mode) return
      const previous = this.normalizeMode
      this.normalizeMode = mode
      if (mode !== 'absolute' && previous === 'absolute') {
        // Switching into 0-1 domain: adapt CLim if it's still in absolute range.
        if (this.climMax > 1.5) {
          this.climMin = 0
          this.climMax = 1
        }
      } else if (mode === 'absolute' && previous !== 'absolute') {
        if (this.climMax <= 1.5) {
          this.climMin = 0
          this.climMax = 250
        }
      }
    },
    applyAbsolutePreset() {
      this.setNormalizeMode('absolute')
      this.climMin = 0
      this.climMax = 250
      this.colorbarLabel = 'Pixel intensity'
    },
    applyNormalizedPreset() {
      this.setNormalizeMode('perImage')
      this.climMin = 0
      this.climMax = 1
      this.colorbarLabel = 'Normalized intensity'
    },
    resetAll() {
      this.$patch(defaultSettings())
    }
  }
})

/**
 * Persist all renderer settings to localStorage. Call once in main.ts after
 * Pinia is installed. Uses a debounced write to avoid thrashing.
 */
export function installSettingsPersistence(): void {
  if (typeof window === 'undefined') return
  const store = useSettingsStore()
  let timer: number | undefined
  store.$subscribe(
    (_mutation, state) => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
        } catch {
          // quota exceeded / private mode — best effort only
        }
      }, 150)
    },
    { detached: true }
  )
}

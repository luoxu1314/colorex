import { defineStore } from 'pinia'
import type { RenderSettings } from '../types/settings'

export const useSettingsStore = defineStore('settings', {
  state: (): RenderSettings => ({
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
    colorbarReserveRatio: 0.16,
    showColorbar: true,
    colorbarLabel: 'Pixel intensity',
    colorbarFontSize: 16,
    colorbarAutoFont: true,
    colorbarWidth: 0.025,
    labelFontSize: 22,
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
  }),
  actions: {
    applyAbsolutePreset() {
      this.normalizeMode = 'absolute'
      this.climMin = 0
      this.climMax = 250
      this.colorbarLabel = 'Pixel intensity'
      this.outputPath = 'colorexchange_absolute.png'
    },
    applyNormalizedPreset() {
      this.normalizeMode = 'perImage'
      this.climMin = 0
      this.climMax = 1
      this.colorbarLabel = ''
      this.outputPath = 'colorexchange_normalized.png'
    }
  }
})

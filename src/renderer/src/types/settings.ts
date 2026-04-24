export type NormalizeMode = 'absolute' | 'perImage' | 'percentile'
export type OutputFormat = 'png' | 'tif' | 'jpg' | 'pdf'
export type BackgroundMode = 'colormap' | 'black' | 'transparent'

export interface RenderSettings {
  normalizeMode: NormalizeMode
  blackLevelEnabled: boolean
  blackLevelPercentile: number
  thresholdEnabled: boolean
  threshold: number
  climMin: number
  climMax: number
  colormap: string
  columns: number
  backgroundMode: BackgroundMode
  colorbarReserveRatio: number
  showColorbar: boolean
  colorbarLabel: string
  colorbarFontSize: number
  colorbarAutoFont: boolean
  colorbarWidth: number
  labelFontSize: number
  labelAutoFont: boolean
  labelColor: string
  labelFontFamily: string
  labelBold: boolean
  showRowSeparators: boolean
  showColumnSeparators: boolean
  separatorColor: string
  separatorLineWidth: number
  dpi: number
  outputFormat: OutputFormat
  outputPath: string
  transparentBackground: boolean
  previewMaxPixels: number
  singleOutputPath?: string
}

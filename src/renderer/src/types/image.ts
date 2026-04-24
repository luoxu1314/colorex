export interface CropMargins {
  enabled: boolean
  left: number
  top: number
  right: number
  bottom: number
}

export interface ImageItem {
  id: string
  path: string
  name: string
  label: string
  crop: CropMargins
  /**
   * Optional absolute path to a browser-renderable preview (PNG) for formats
   * Chromium cannot decode natively, such as TIFF. When set, UI thumbnails and
   * the crop editor display this instead of the original file. The Python
   * pipeline still reads the original ``path`` for actual processing.
   */
  previewPath?: string
  previewPending?: boolean
  previewError?: string
}

export interface PythonImageInput {
  path: string
  label: string
  crop?: CropMargins
}

export interface RenderResult {
  success: boolean
  outputPath?: string
  previewPath?: string
  width?: number
  height?: number
  message?: string
  error?: string
}

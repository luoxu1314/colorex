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

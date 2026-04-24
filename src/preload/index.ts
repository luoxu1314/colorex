import { contextBridge, ipcRenderer } from 'electron'

export interface PreviewResult {
  success: boolean
  previewPath?: string
  width?: number
  height?: number
  error?: string
}

export interface RevealResult {
  success: boolean
  revealed?: string
  reason?: string
}

const api = {
  openImages: (): Promise<string[]> => ipcRenderer.invoke('dialog:openImages'),
  openSingleImage: (): Promise<string | null> => ipcRenderer.invoke('dialog:openSingleImage'),
  saveOutput: (defaultPath: string, format: string): Promise<string | null> =>
    ipcRenderer.invoke('dialog:saveOutput', defaultPath, format),
  renderMosaic: (payload: unknown): Promise<unknown> => ipcRenderer.invoke('python:renderMosaic', payload),
  convertSingle: (payload: unknown): Promise<unknown> => ipcRenderer.invoke('python:convertSingle', payload),
  buildTiffPreview: (inputPath: string): Promise<PreviewResult> =>
    ipcRenderer.invoke('preview:buildTiff', inputPath),
  revealInFolder: (targetPath: string): Promise<RevealResult> =>
    ipcRenderer.invoke('shell:revealInFolder', targetPath)
}

contextBridge.exposeInMainWorld('colorExchange', api)

export type ColorExchangeApi = typeof api

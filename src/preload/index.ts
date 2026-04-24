import { contextBridge, ipcRenderer } from 'electron'

const api = {
  openImages: (): Promise<string[]> => ipcRenderer.invoke('dialog:openImages'),
  openSingleImage: (): Promise<string | null> => ipcRenderer.invoke('dialog:openSingleImage'),
  saveOutput: (defaultPath: string, format: string): Promise<string | null> =>
    ipcRenderer.invoke('dialog:saveOutput', defaultPath, format),
  renderMosaic: (payload: unknown): Promise<unknown> => ipcRenderer.invoke('python:renderMosaic', payload),
  convertSingle: (payload: unknown): Promise<unknown> => ipcRenderer.invoke('python:convertSingle', payload)
}

contextBridge.exposeInMainWorld('colorExchange', api)

export type ColorExchangeApi = typeof api

import { ipcMain } from 'electron'
import { openImageFiles, openSingleImageFile, saveOutputFile } from './fileDialog'
import { runPython } from './pythonBridge'

export function registerIpc(): void {
  ipcMain.handle('dialog:openImages', () => openImageFiles())
  ipcMain.handle('dialog:openSingleImage', () => openSingleImageFile())
  ipcMain.handle('dialog:saveOutput', (_event, defaultPath: string, format: string) => saveOutputFile(defaultPath, format))
  ipcMain.handle('python:renderMosaic', (_event, payload) => runPython('render_mosaic', payload))
  ipcMain.handle('python:convertSingle', (_event, payload) => runPython('convert_single', payload))
}

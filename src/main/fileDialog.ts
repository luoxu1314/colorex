import { BrowserWindow, dialog, type OpenDialogOptions, type SaveDialogOptions } from 'electron'
import { extname } from 'node:path'

const imageFilters = [
  { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'tif', 'tiff', 'bmp', 'webp'] },
  { name: 'All Files', extensions: ['*'] }
]

export async function openImageFiles(): Promise<string[]> {
  const win = BrowserWindow.getFocusedWindow()
  const options: OpenDialogOptions = {
    title: '选择图像文件',
    properties: ['openFile', 'multiSelections'],
    filters: imageFilters
  }
  const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
  return result.canceled ? [] : result.filePaths
}

export async function openSingleImageFile(): Promise<string | null> {
  const win = BrowserWindow.getFocusedWindow()
  const options: OpenDialogOptions = {
    title: '选择要转换的图像',
    properties: ['openFile'],
    filters: imageFilters
  }
  const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
  return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
}

export async function saveOutputFile(defaultPath: string, format: string): Promise<string | null> {
  const win = BrowserWindow.getFocusedWindow()
  const safeFormat = format.toLowerCase()
  const options: SaveDialogOptions = {
    title: '选择输出路径',
    defaultPath,
    filters: [
      { name: 'PNG', extensions: ['png'] },
      { name: 'TIFF', extensions: ['tif', 'tiff'] },
      { name: 'JPEG', extensions: ['jpg', 'jpeg'] },
      { name: 'PDF', extensions: ['pdf'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  }
  const result = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options)
  if (result.canceled || !result.filePath) return null
  return extname(result.filePath) ? result.filePath : `${result.filePath}.${safeFormat}`
}

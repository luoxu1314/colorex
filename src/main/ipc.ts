import { app, ipcMain, shell } from 'electron'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { openImageFiles, openSingleImageFile, saveOutputFile } from './fileDialog'
import { runPython, type PythonResult } from './pythonBridge'

async function buildTiffPreview(inputPath: string): Promise<PythonResult> {
  if (!inputPath) {
    return { success: false, error: '缺少图像路径。' }
  }
  const previewDir = join(app.getPath('temp'), 'colorexchange', 'previews')
  await mkdir(previewDir, { recursive: true })

  let mtime = 0
  let size = 0
  try {
    const info = await stat(inputPath)
    mtime = info.mtimeMs
    size = info.size
  } catch (error) {
    return { success: false, error: `无法访问文件：${(error as Error).message}` }
  }

  const hash = createHash('sha1')
    .update(inputPath)
    .update('|')
    .update(String(mtime))
    .update('|')
    .update(String(size))
    .digest('hex')
  const outputPath = join(previewDir, `${hash}.png`)

  if (existsSync(outputPath)) {
    return { success: true, previewPath: outputPath }
  }
  return runPython('generate_preview', { inputPath, outputPath, maxSize: 2048 })
}

export function registerIpc(): void {
  ipcMain.handle('dialog:openImages', () => openImageFiles())
  ipcMain.handle('dialog:openSingleImage', () => openSingleImageFile())
  ipcMain.handle('dialog:saveOutput', (_event, defaultPath: string, format: string) => saveOutputFile(defaultPath, format))
  ipcMain.handle('python:renderMosaic', (_event, payload) => runPython('render_mosaic', payload))
  ipcMain.handle('python:convertSingle', (_event, payload) => runPython('convert_single', payload))
  ipcMain.handle('preview:buildTiff', (_event, inputPath: string) => buildTiffPreview(inputPath))
  ipcMain.handle('shell:revealInFolder', async (_event, targetPath: string) => {
    if (!targetPath) return { success: false, reason: 'empty path' }
    try {
      if (existsSync(targetPath)) {
        shell.showItemInFolder(targetPath)
        return { success: true, revealed: targetPath }
      }
      const parent = dirname(targetPath)
      if (parent && existsSync(parent)) {
        const err = await shell.openPath(parent)
        return err ? { success: false, reason: err } : { success: true, revealed: parent }
      }
      return { success: false, reason: 'path not found' }
    } catch (error) {
      return { success: false, reason: (error as Error).message }
    }
  })
}

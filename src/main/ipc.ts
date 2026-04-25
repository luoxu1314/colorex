import { app, ipcMain, shell } from 'electron'
import { createHash } from 'node:crypto'
import { existsSync, rmSync } from 'node:fs'
import { mkdir, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { openImageFiles, openSingleImageFile, saveOutputFile } from './fileDialog'
import { approvePath, approvePaths } from './pathAccess'
import { runPython, type PythonResult } from './pythonBridge'
import { checkForUpdates, openReleasePage } from './updateChecker'

/** Approve any outputPath / previewPath a Python response carries back, then
 * return it untouched. Centralized here so every IPC handler that forwards
 * a ``PythonResult`` stays in sync.
 */
function trackPythonResultPaths(result: PythonResult): PythonResult {
  if (result?.outputPath) approvePath(result.outputPath)
  if (result?.previewPath) approvePath(result.previewPath)
  return result
}

function tiffPreviewCacheDir(): string {
  return join(app.getPath('temp'), 'colorexchange', 'previews')
}

export function clearTiffPreviewCache(): void {
  rmSync(tiffPreviewCacheDir(), { recursive: true, force: true })
}

async function buildTiffPreview(inputPath: string): Promise<PythonResult> {
  if (!inputPath) {
    return { success: false, error: '缺少图像路径。' }
  }
  const previewDir = tiffPreviewCacheDir()
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
    approvePath(outputPath)
    return { success: true, previewPath: outputPath }
  }
  const result = await runPython('generate_preview', { inputPath, outputPath, maxSize: 2048 })
  return trackPythonResultPaths(result)
}

export function registerIpc(): void {
  ipcMain.handle('dialog:openImages', async () => {
    const paths = await openImageFiles()
    approvePaths(paths)
    return paths
  })
  ipcMain.handle('dialog:openSingleImage', async () => {
    const path = await openSingleImageFile()
    approvePath(path)
    return path
  })
  ipcMain.handle(
    'dialog:saveOutput',
    async (_event, defaultPath: string, format: string) => {
      const path = await saveOutputFile(defaultPath, format)
      approvePath(path)
      return path
    }
  )
  ipcMain.handle('python:renderMosaic', async (_event, payload) =>
    trackPythonResultPaths(await runPython('render_mosaic', payload))
  )
  ipcMain.handle('python:convertSingle', async (_event, payload) =>
    trackPythonResultPaths(await runPython('convert_single', payload))
  )
  ipcMain.handle('preview:buildTiff', (_event, inputPath: string) =>
    buildTiffPreview(inputPath)
  )
  ipcMain.handle('update:check', () => checkForUpdates())
  ipcMain.handle('update:openReleasePage', (_event, url?: string) => openReleasePage(url))
  // Invoked from preload after ``webUtils.getPathForFile`` resolves a dropped
  // file to a real local path. The renderer cannot fabricate real File paths
  // (synthesized File objects resolve to ''), so this channel is an implicit
  // user gesture. A fully-compromised renderer could call it with arbitrary
  // strings, but such a renderer already has access to the file dialog IPCs,
  // so the allowlist still successfully blocks the passive "construct a URL
  // directly" attack vector.
  ipcMain.handle('path:approve', (_event, candidate: string) => {
    if (typeof candidate === 'string' && candidate) approvePath(candidate)
    return true
  })
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

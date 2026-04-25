import { app, BrowserWindow, net, protocol, shell } from 'electron'
import log from 'electron-log/main.js'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { clearTiffPreviewCache, registerIpc } from './ipc'
import { isApproved } from './pathAccess'
import { runPython, shutdownPythonBridge } from './pythonBridge'

const isDev = !app.isPackaged

log.initialize()
log.transports.file.level = 'info'
log.transports.console.level = isDev ? 'debug' : 'info'
log.info('[app] starting', {
  version: app.getVersion(),
  packaged: app.isPackaged,
  platform: process.platform,
  arch: process.arch,
  electron: process.versions.electron,
  resourcesPath: process.resourcesPath
})

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'colorexchange-file',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: false
    }
  }
])

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1100,
    minHeight: 720,
    title: 'ColorExchange',
    show: false,
    backgroundColor: '#111418',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow.show())

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Prevent the renderer from navigating to a dropped file://... URL when the
  // renderer's drop handler doesn't call preventDefault in time. This keeps the
  // app from "disappearing" when users drag images onto the window.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('file://')) event.preventDefault()
  })

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  protocol.handle('colorexchange-file', (request) => {
    const url = new URL(request.url)
    const filePath = url.searchParams.get('path')
    if (!filePath) {
      return new Response('Missing path', { status: 400 })
    }
    if (!isApproved(filePath)) {
      log.warn('[protocol] rejected unapproved path request', { filePath })
      return new Response('Forbidden', { status: 403 })
    }
    return net.fetch(pathToFileURL(filePath).toString())
  })

  registerIpc()
  createWindow()

  // Preheat the Python daemon in the background so the first real preview /
  // mosaic request doesn't stall on cold numpy/PIL/matplotlib imports (which
  // can take 30–90 s on a freshly installed Windows box while Defender scans the
  // PyInstaller _internal DLLs). Failures are non-fatal — when the user
  // eventually clicks "generate preview" the lazy import path still works.
  const preheatStart = Date.now()
  void runPython('warmup', { stages: ['preview'] })
    .then((result) => {
      log.info('[preheat] preview stage done', {
        ms: Date.now() - preheatStart,
        result
      })
      const mosaicStart = Date.now()
      return runPython('warmup', { stages: ['mosaic'] }).then((mosaicResult) => {
        log.info('[preheat] mosaic stage done', {
          ms: Date.now() - mosaicStart,
          result: mosaicResult
        })
      })
    })
    .catch((error) => {
      log.warn('[preheat] failed (non-fatal)', error)
    })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  shutdownPythonBridge()
  try {
    clearTiffPreviewCache()
    log.info('[cache] TIFF preview cache cleared')
  } catch (error) {
    log.warn('[cache] failed to clear TIFF preview cache', error)
  }
})

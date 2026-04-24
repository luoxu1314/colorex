import { app } from 'electron'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

export interface PythonResult {
  success: boolean
  outputPath?: string
  previewPath?: string
  width?: number
  height?: number
  message?: string
  error?: string
}

function bundledBackendExecutable(): string | null {
  if (!app.isPackaged) return null
  const exeName = process.platform === 'win32' ? 'colorexchange-backend.exe' : 'colorexchange-backend'
  const candidate = join(process.resourcesPath, 'backend', exeName)
  return existsSync(candidate) ? candidate : null
}

function pythonExecutable(): string {
  const appRoot = app.getAppPath()
  const localVenv = process.platform === 'win32'
    ? join(appRoot, '.venv', 'Scripts', 'python.exe')
    : join(appRoot, '.venv', 'bin', 'python')
  if (!app.isPackaged && existsSync(localVenv)) {
    return localVenv
  }
  return process.env.COLOREXCHANGE_PYTHON || process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3')
}

function pythonRoot(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'python')
  }
  return join(app.getAppPath(), 'python')
}

export async function runPython(action: string, payload: unknown): Promise<PythonResult> {
  const workDir = join(app.getPath('temp'), 'colorexchange')
  await mkdir(workDir, { recursive: true })

  const requestPath = join(workDir, `${randomUUID()}-request.json`)
  const responsePath = join(workDir, `${randomUUID()}-response.json`)
  await writeFile(requestPath, JSON.stringify({ action, payload, responsePath }, null, 2), 'utf8')
  await mkdir(dirname(responsePath), { recursive: true })

  const backend = bundledBackendExecutable()
  const script = join(pythonRoot(), 'process.py')
  const command = backend ?? pythonExecutable()
  const args = backend ? [requestPath] : [script, requestPath]
  const cwd = backend ? dirname(backend) : pythonRoot()

  return await new Promise<PythonResult>((resolve) => {
    const child = spawn(command, args, {
      cwd,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    })

    let stderr = ''
    let settled = false
    const timeout = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill('SIGKILL')
      resolve({ success: false, error: 'Python 处理超时。预览图可能过大，已终止本次处理。' })
    }, 120_000)

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    child.on('error', (error) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      resolve({ success: false, error: `无法启动 Python: ${error.message}` })
    })

    child.on('close', async (code) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      try {
        const text = await readFile(responsePath, 'utf8')
        const result = JSON.parse(text) as PythonResult
        resolve(result)
      } catch {
        resolve({
          success: false,
          error: `Python 处理失败，退出码 ${code ?? 'unknown'}${stderr ? `\n${stderr}` : ''}`
        })
      } finally {
        await rm(requestPath, { force: true }).catch(() => undefined)
        await rm(responsePath, { force: true }).catch(() => undefined)
      }
    })
  })
}

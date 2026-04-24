import { app } from 'electron'
import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

export interface PythonResult {
  success: boolean
  outputPath?: string
  previewPath?: string
  width?: number
  height?: number
  message?: string
  error?: string
  id?: string
  ready?: boolean
}

interface Pending {
  resolve: (result: PythonResult) => void
  timeout: NodeJS.Timeout
}

function bundledBackendExecutable(): string | null {
  if (!app.isPackaged) return null
  const exeName = process.platform === 'win32' ? 'colorexchange-backend.exe' : 'colorexchange-backend'
  const candidate = join(process.resourcesPath, 'backend', exeName)
  return existsSync(candidate) ? candidate : null
}

function pythonExecutable(): string {
  const appRoot = app.getAppPath()
  const localVenv =
    process.platform === 'win32'
      ? join(appRoot, '.venv', 'Scripts', 'python.exe')
      : join(appRoot, '.venv', 'bin', 'python')
  if (!app.isPackaged && existsSync(localVenv)) {
    return localVenv
  }
  return (
    process.env.COLOREXCHANGE_PYTHON ||
    process.env.PYTHON ||
    (process.platform === 'win32' ? 'python' : 'python3')
  )
}

function pythonRoot(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'python')
  }
  return join(app.getAppPath(), 'python')
}

const PER_REQUEST_TIMEOUT_MS = 180_000
const DAEMON_START_TIMEOUT_MS = 15_000

let child: ChildProcessWithoutNullStreams | null = null
let childReady: Promise<void> | null = null
let stdoutBuffer = ''
let stderrBuffer = ''
const pending = new Map<string, Pending>()

function rejectAll(error: string): void {
  for (const [id, entry] of pending.entries()) {
    clearTimeout(entry.timeout)
    entry.resolve({ success: false, error, id })
  }
  pending.clear()
}

function stopChild(reason?: string): void {
  if (reason) rejectAll(reason)
  if (child && !child.killed) {
    try {
      child.kill('SIGKILL')
    } catch {
      // ignore
    }
  }
  child = null
  childReady = null
  stdoutBuffer = ''
  stderrBuffer = ''
}

function handleStdout(chunk: string): void {
  stdoutBuffer += chunk
  let idx = stdoutBuffer.indexOf('\n')
  while (idx !== -1) {
    const line = stdoutBuffer.slice(0, idx).trim()
    stdoutBuffer = stdoutBuffer.slice(idx + 1)
    if (line) {
      try {
        const msg = JSON.parse(line) as PythonResult
        if (msg.id && pending.has(msg.id)) {
          const entry = pending.get(msg.id)!
          clearTimeout(entry.timeout)
          pending.delete(msg.id)
          entry.resolve(msg)
        }
        // Messages without id (e.g. ready banner) are handled by the start
        // waiter via a one-shot listener below.
      } catch {
        // tolerate stray non-JSON lines
      }
    }
    idx = stdoutBuffer.indexOf('\n')
  }
}

async function ensureChild(): Promise<ChildProcessWithoutNullStreams> {
  if (child && !child.killed) {
    if (childReady) await childReady
    return child
  }

  const backend = bundledBackendExecutable()
  const script = join(pythonRoot(), 'process.py')
  const command = backend ?? pythonExecutable()
  const args = backend ? ['--daemon'] : [script, '--daemon']
  const cwd = backend ? dirname(backend) : pythonRoot()

  let spawned: ChildProcessWithoutNullStreams
  try {
    spawned = spawn(command, args, {
      cwd,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe']
    })
  } catch (error) {
    throw new Error(`无法启动 Python 后台：${(error as Error).message}`)
  }

  child = spawned
  spawned.stdout.setEncoding('utf8')
  spawned.stderr.setEncoding('utf8')

  spawned.stdout.on('data', handleStdout)
  spawned.stderr.on('data', (data: string) => {
    stderrBuffer += data
    if (stderrBuffer.length > 8192) {
      stderrBuffer = stderrBuffer.slice(-8192)
    }
  })

  spawned.on('error', (error) => {
    stopChild(`Python 后台错误：${error.message}`)
  })

  spawned.on('exit', (code, signal) => {
    const trailer = stderrBuffer ? `\n${stderrBuffer}` : ''
    stopChild(
      `Python 后台意外退出（code=${code ?? 'null'}, signal=${signal ?? 'null'}）${trailer}`
    )
  })

  childReady = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      const message = `Python 后台启动超时。${stderrBuffer || ''}`.trim()
      stopChild(message)
      reject(new Error(message))
    }, DAEMON_START_TIMEOUT_MS)

    const onData = (chunk: string) => {
      // Split by line and look for the ready banner. Keep anything else in the
      // buffer for later handleStdout calls.
      stdoutBuffer += chunk
      let idx = stdoutBuffer.indexOf('\n')
      while (idx !== -1) {
        const line = stdoutBuffer.slice(0, idx).trim()
        stdoutBuffer = stdoutBuffer.slice(idx + 1)
        if (line) {
          try {
            const msg = JSON.parse(line) as PythonResult
            if (msg.ready) {
              clearTimeout(timeout)
              spawned.stdout.off('data', onData)
              spawned.stdout.on('data', handleStdout)
              resolve()
              return
            }
          } catch {
            // ignore
          }
        }
        idx = stdoutBuffer.indexOf('\n')
      }
    }

    spawned.stdout.off('data', handleStdout)
    spawned.stdout.on('data', onData)
  })

  await childReady
  return spawned
}

export async function runPython(action: string, payload: unknown): Promise<PythonResult> {
  let current: ChildProcessWithoutNullStreams
  try {
    current = await ensureChild()
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }

  const id = randomUUID()
  return new Promise<PythonResult>((resolve) => {
    const timeout = setTimeout(() => {
      if (!pending.has(id)) return
      pending.delete(id)
      stopChild('Python 处理超时，后台已重启。')
      resolve({ success: false, error: 'Python 处理超时。' })
    }, PER_REQUEST_TIMEOUT_MS)

    pending.set(id, { resolve, timeout })

    const payload_line = JSON.stringify({ id, action, payload }) + '\n'
    try {
      current.stdin.write(payload_line, 'utf8', (err) => {
        if (err && pending.has(id)) {
          pending.delete(id)
          clearTimeout(timeout)
          resolve({ success: false, error: `写入 Python 后台失败：${err.message}` })
        }
      })
    } catch (error) {
      pending.delete(id)
      clearTimeout(timeout)
      resolve({ success: false, error: `写入 Python 后台失败：${(error as Error).message}` })
    }
  })
}

/**
 * Gracefully stop the Python daemon. Safe to call multiple times and on
 * shutdown. Pending requests resolve with an error.
 */
export function shutdownPythonBridge(): void {
  stopChild('应用正在退出。')
}

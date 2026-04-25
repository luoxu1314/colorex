import { app } from 'electron'
import log from 'electron-log/main.js'
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
// PyInstaller onedir 冷启动（尤其 Windows 首次运行被 Defender 扫描时）加上
// numpy / matplotlib / PIL 的 import，常见会在 20–60 秒量级，所以打包态下
// 放宽到 90 秒，开发态走本地 venv 一般很快，给 20 秒已经很宽松。
const DAEMON_START_TIMEOUT_MS = app.isPackaged ? 90_000 : 20_000

let child: ChildProcessWithoutNullStreams | null = null
let childReady: Promise<void> | null = null
let childReadyReject: ((reason: Error) => void) | null = null
let stdoutBuffer = ''
let stderrBuffer = ''
const pending = new Map<string, Pending>()

function failChildReady(message: string): void {
  if (childReadyReject) {
    const reject = childReadyReject
    childReadyReject = null
    reject(new Error(message))
  }
}

function rejectAll(error: string): void {
  for (const [id, entry] of pending.entries()) {
    clearTimeout(entry.timeout)
    entry.resolve({ success: false, error, id })
  }
  pending.clear()
}

function stopChild(reason?: string): void {
  if (reason) {
    failChildReady(reason)
    rejectAll(reason)
  }
  if (child && !child.killed) {
    try {
      child.kill('SIGKILL')
    } catch {
      // ignore
    }
  }
  child = null
  childReady = null
  childReadyReject = null
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
          log.info('[pythonBridge] response received', {
            id: msg.id,
            success: msg.success
          })
          entry.resolve(msg)
        }
        // Messages without id (e.g. ready banner) are handled by the start
        // waiter via a one-shot listener below.
      } catch {
        log.warn('[pythonBridge] non-JSON stdout line:', line)
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

  log.info('[pythonBridge] spawning backend', {
    command,
    args,
    cwd,
    packaged: app.isPackaged,
    startTimeoutMs: DAEMON_START_TIMEOUT_MS
  })

  let spawned: ChildProcessWithoutNullStreams
  try {
    spawned = spawn(command, args, {
      cwd,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        // 防止 Python 的 stdout 被块缓冲导致 ready banner 延迟送达；
        // 强制 UTF-8 避免中文 Windows 默认 cp936 造成的乱码。
        PYTHONUNBUFFERED: '1',
        PYTHONIOENCODING: 'utf-8',
        PYTHONUTF8: '1'
      }
    })
  } catch (error) {
    const message = `无法启动 Python 后台：${(error as Error).message}`
    log.error('[pythonBridge] spawn threw', error)
    throw new Error(message)
  }

  child = spawned
  spawned.stdout.setEncoding('utf8')
  spawned.stderr.setEncoding('utf8')

  spawned.stdout.on('data', handleStdout)
  spawned.stderr.on('data', (data: string) => {
    stderrBuffer += data
    if (stderrBuffer.length > 16384) {
      stderrBuffer = stderrBuffer.slice(-16384)
    }
    // stderr 里通常是 Python traceback / DLL 加载失败之类的信息，逐行落盘。
    for (const line of data.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (trimmed) log.warn('[python.stderr]', trimmed)
    }
  })

  spawned.on('error', (error) => {
    log.error('[pythonBridge] child error event', error)
    stopChild(`Python 后台错误：${error.message}`)
  })

  spawned.on('exit', (code, signal) => {
    const trailer = stderrBuffer ? `\n${stderrBuffer}` : ''
    const reason = `Python 后台意外退出（code=${code ?? 'null'}, signal=${signal ?? 'null'}）${trailer}`
    log.error('[pythonBridge] child exited', { code, signal, stderr: stderrBuffer })
    stopChild(reason)
  })

  childReady = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      const tail = stderrBuffer ? `\nstderr 末尾:\n${stderrBuffer.trim()}` : ''
      const logPath = (() => {
        try {
          return log.transports.file.getFile().path
        } catch {
          return ''
        }
      })()
      const hint = logPath ? `\n详细日志见：${logPath}` : ''
      const message = `Python 后台启动超时（${Math.round(
        DAEMON_START_TIMEOUT_MS / 1000
      )} 秒内未就绪）。${tail}${hint}`.trim()
      stopChild(message)
    }, DAEMON_START_TIMEOUT_MS)

    let settled = false
    const finish = (err?: Error): void => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      childReadyReject = null
      if (err) reject(err)
      else resolve()
    }
    // 外部（stopChild / error / exit 事件）通过 failChildReady 触发
    childReadyReject = (err) => finish(err)

    const onData = (chunk: string) => {
      stdoutBuffer += chunk
      let idx = stdoutBuffer.indexOf('\n')
      while (idx !== -1) {
        const line = stdoutBuffer.slice(0, idx).trim()
        stdoutBuffer = stdoutBuffer.slice(idx + 1)
        if (line) {
          try {
            const msg = JSON.parse(line) as PythonResult
            if (msg.ready) {
              spawned.stdout.off('data', onData)
              spawned.stdout.on('data', handleStdout)
              log.info('[pythonBridge] backend ready')
              finish()
              return
            }
          } catch {
            log.warn('[pythonBridge] non-JSON startup line:', line)
          }
        }
        idx = stdoutBuffer.indexOf('\n')
      }
    }

    spawned.stdout.off('data', handleStdout)
    spawned.stdout.on('data', onData)
  })

  try {
    await childReady
  } catch (error) {
    throw error instanceof Error ? error : new Error(String(error))
  }
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
    const byteLen = Buffer.byteLength(payload_line, 'utf8')
    log.info('[pythonBridge] write request', { id, action, bytes: byteLen })
    try {
      const drained = current.stdin.write(payload_line, 'utf8', (err) => {
        if (err) {
          log.error('[pythonBridge] stdin write error', { id, action, error: err.message })
          if (pending.has(id)) {
            pending.delete(id)
            clearTimeout(timeout)
            resolve({ success: false, error: `写入 Python 后台失败：${err.message}` })
          }
          return
        }
        log.debug('[pythonBridge] stdin write flushed', { id, action, bytes: byteLen })
      })
      if (!drained) {
        log.warn('[pythonBridge] stdin backpressure, pipe buffer full', { id, action })
      }
    } catch (error) {
      log.error('[pythonBridge] stdin write threw', { id, action, error: (error as Error).message })
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

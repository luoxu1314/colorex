import { app } from 'electron'
import { existsSync, realpathSync } from 'node:fs'
import { resolve, sep } from 'node:path'

const IS_WINDOWS = process.platform === 'win32'

/** Normalize for case-insensitive comparison on Windows; no-op elsewhere. */
function normalizeCase(p: string): string {
  return IS_WINDOWS ? p.toLowerCase() : p
}

/**
 * Track the set of local file paths the renderer is allowed to load via the
 * ``colorexchange-file://`` protocol. Without this, anything that constructs
 * such a URL (e.g. a compromised renderer) could ask the main process to
 * ``net.fetch`` arbitrary files on disk.
 *
 * Paths become approved when:
 *  - the user selected them through a native file dialog (open / save);
 *  - the Python backend returned them as an ``outputPath`` / ``previewPath``;
 *  - they live under an always-allowed root (app temp dir + userData).
 */

const approved = new Set<string>()

/** Normalize a path for set membership comparisons. */
function canonical(p: string): string {
  const abs = resolve(p)
  let real = abs
  if (existsSync(abs)) {
    try {
      real = realpathSync(abs)
    } catch {
      real = abs
    }
  }
  return normalizeCase(real)
}

function isUnderRoot(target: string, root: string): boolean {
  if (!root) return false
  const normTarget = target.endsWith(sep) ? target : target + sep
  const normRoot = root.endsWith(sep) ? root : root + sep
  return normTarget === normRoot || normTarget.startsWith(normRoot)
}

function allowedRoots(): string[] {
  const roots: string[] = []
  try {
    roots.push(canonical(app.getPath('temp')))
  } catch {
    // ignore
  }
  try {
    roots.push(canonical(app.getPath('userData')))
  } catch {
    // ignore
  }
  return roots
}

/** Approve a single path (idempotent). Silently ignores empty / invalid inputs. */
export function approvePath(p: string | null | undefined): void {
  if (!p) return
  approved.add(canonical(p))
}

/** Approve a list of paths at once. */
export function approvePaths(paths: Iterable<string | null | undefined>): void {
  for (const p of paths) approvePath(p)
}

/** Check whether the protocol handler should serve the requested path. */
export function isApproved(p: string): boolean {
  if (!p) return false
  let real: string
  try {
    real = canonical(p)
  } catch {
    return false
  }
  if (approved.has(real)) return true
  for (const root of allowedRoots()) {
    if (isUnderRoot(real, root)) return true
  }
  return false
}

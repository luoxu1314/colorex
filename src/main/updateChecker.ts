import { app, shell } from 'electron'

const RELEASE_OWNER = 'luoxu1314'
const RELEASE_REPO = 'colorex'
const RELEASES_URL = `https://github.com/${RELEASE_OWNER}/${RELEASE_REPO}/releases`
const LATEST_RELEASE_API = `https://api.github.com/repos/${RELEASE_OWNER}/${RELEASE_REPO}/releases/latest`

export interface UpdateCheckResult {
  success: boolean
  currentVersion: string
  latestVersion?: string
  updateAvailable?: boolean
  releaseName?: string
  releaseUrl?: string
  publishedAt?: string
  error?: string
}

interface GitHubRelease {
  tag_name?: string
  name?: string
  html_url?: string
  published_at?: string
}

function cleanVersion(version: string): string {
  return version.trim().replace(/^v/i, '').split('+')[0]
}

function numericParts(version: string): number[] {
  return cleanVersion(version)
    .split('-')[0]
    .split('.')
    .map((part) => Number.parseInt(part, 10))
    .map((part) => (Number.isFinite(part) ? part : 0))
}

function compareVersions(a: string, b: string): number {
  const left = numericParts(a)
  const right = numericParts(b)
  const len = Math.max(left.length, right.length, 3)
  for (let i = 0; i < len; i++) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

function releaseUrlIsAllowed(url: string): boolean {
  try {
    const parsed = new URL(url)
    return (
      parsed.protocol === 'https:' &&
      parsed.hostname === 'github.com' &&
      parsed.pathname.startsWith(`/${RELEASE_OWNER}/${RELEASE_REPO}/releases`)
    )
  } catch {
    return false
  }
}

export async function checkForUpdates(): Promise<UpdateCheckResult> {
  const currentVersion = app.getVersion()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 12_000)
  try {
    const response = await fetch(LATEST_RELEASE_API, {
      signal: controller.signal,
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': `ColorExchange/${currentVersion}`,
      },
    })
    if (response.status === 404) {
      return {
        success: false,
        currentVersion,
        error: 'GitHub Release 暂未发布。',
      }
    }
    if (!response.ok) {
      return {
        success: false,
        currentVersion,
        error: `GitHub 返回 ${response.status} ${response.statusText}`.trim(),
      }
    }
    const release = (await response.json()) as GitHubRelease
    const latestVersion = release.tag_name || ''
    if (!latestVersion) {
      return { success: false, currentVersion, error: 'Release 响应缺少版本号。' }
    }
    const releaseUrl = release.html_url && releaseUrlIsAllowed(release.html_url)
      ? release.html_url
      : RELEASES_URL
    return {
      success: true,
      currentVersion,
      latestVersion,
      updateAvailable: compareVersions(latestVersion, currentVersion) > 0,
      releaseName: release.name,
      releaseUrl,
      publishedAt: release.published_at,
    }
  } catch (error) {
    const message = error instanceof Error && error.name === 'AbortError'
      ? '检查更新超时，请稍后重试。'
      : `检查更新失败：${error instanceof Error ? error.message : String(error)}`
    return { success: false, currentVersion, error: message }
  } finally {
    clearTimeout(timeout)
  }
}

export async function openReleasePage(url?: string): Promise<boolean> {
  const target = url && releaseUrlIsAllowed(url) ? url : RELEASES_URL
  try {
    await shell.openExternal(target)
    return true
  } catch {
    return false
  }
}

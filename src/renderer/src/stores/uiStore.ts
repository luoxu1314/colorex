import { defineStore } from 'pinia'

export type ThemeMode = 'dark' | 'light'
export type ToastLevel = 'info' | 'success' | 'warn' | 'error'

export interface Toast {
  id: number
  message: string
  level: ToastLevel
  // Optional title shown on the first line.
  title?: string
  // Auto-dismiss timeout in ms. 0 means sticky (manual dismiss only).
  duration: number
}

const THEME_KEY = 'colorexchange.theme'

function initialTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'dark'
  try {
    const saved = window.localStorage.getItem(THEME_KEY)
    if (saved === 'dark' || saved === 'light') return saved
  } catch {
    // ignore storage failures
  }
  // Respect OS preference on first launch.
  if (window.matchMedia?.('(prefers-color-scheme: light)').matches) return 'light'
  return 'dark'
}

function applyThemeAttr(mode: ThemeMode, animate = false): void {
  if (typeof document === 'undefined') return
  const html = document.documentElement
  if (animate) {
    html.setAttribute('data-theme-animating', 'true')
    window.setTimeout(() => html.removeAttribute('data-theme-animating'), 320)
  }
  html.setAttribute('data-theme', mode)
  html.style.colorScheme = mode
}

let toastCounter = 1

interface UiState {
  theme: ThemeMode
  toasts: Toast[]
  commandPaletteOpen: boolean
  shortcutsOpen: boolean
}

export const useUiStore = defineStore('ui', {
  state: (): UiState => ({
    theme: initialTheme(),
    toasts: [],
    commandPaletteOpen: false,
    shortcutsOpen: false,
  }),
  actions: {
    setTheme(mode: ThemeMode) {
      const animate = this.theme !== mode
      this.theme = mode
      applyThemeAttr(mode, animate)
      try {
        localStorage.setItem(THEME_KEY, mode)
      } catch {
        // ignore
      }
    },
    toggleTheme() {
      this.setTheme(this.theme === 'dark' ? 'light' : 'dark')
    },
    pushToast(
      message: string,
      level: ToastLevel = 'info',
      opts: { title?: string; duration?: number } = {},
    ): number {
      const id = toastCounter++
      const duration = opts.duration ?? (level === 'error' ? 6000 : 3800)
      this.toasts = [
        ...this.toasts,
        { id, message, level, title: opts.title, duration },
      ].slice(-5)
      if (duration > 0 && typeof window !== 'undefined') {
        window.setTimeout(() => this.dismissToast(id), duration)
      }
      return id
    },
    dismissToast(id: number) {
      this.toasts = this.toasts.filter((t) => t.id !== id)
    },
    clearToasts() {
      this.toasts = []
    },
    openCommandPalette() {
      this.commandPaletteOpen = true
    },
    closeCommandPalette() {
      this.commandPaletteOpen = false
    },
    toggleCommandPalette() {
      this.commandPaletteOpen = !this.commandPaletteOpen
    },
    openShortcuts() {
      this.shortcutsOpen = true
    },
    closeShortcuts() {
      this.shortcutsOpen = false
    },
  },
})

/**
 * Apply the saved/detected theme to <html> as early as possible. Call this
 * once at app startup, before the first paint, so users never see a flash of
 * the wrong theme.
 */
export function installTheme(): void {
  applyThemeAttr(initialTheme())
  if (typeof window === 'undefined') return
  // Track OS-level theme changes — but only override if the user hasn't
  // explicitly chosen one (no value in localStorage).
  const media = window.matchMedia?.('(prefers-color-scheme: light)')
  media?.addEventListener?.('change', (ev) => {
    try {
      if (localStorage.getItem(THEME_KEY)) return
    } catch {
      // ignore
    }
    applyThemeAttr(ev.matches ? 'light' : 'dark')
  })
}

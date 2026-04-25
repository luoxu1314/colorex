import type { Component } from 'vue'

export interface CommandItem {
  id: string
  title: string
  hint?: string
  group: string
  icon: Component
  shortcut?: string
  disabled?: boolean
  keywords?: string
  run: () => void | Promise<void>
}

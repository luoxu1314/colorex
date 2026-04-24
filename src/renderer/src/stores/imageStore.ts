import { defineStore } from 'pinia'
import type { ImageItem, PythonImageInput } from '../types/image'

function fileNameFromPath(path: string): string {
  const normalized = path.replace(/\\/g, '/')
  return normalized.split('/').pop() || path
}

function nameWithoutExt(name: string): string {
  return name.replace(/\.[^.]+$/, '')
}

function indexLabel(index: number): string {
  const letters = 'abcdefghijklmnopqrstuvwxyz'
  let n = index + 1
  let tag = ''
  while (n > 0) {
    const r = (n - 1) % 26
    tag = letters[r] + tag
    n = Math.floor((n - 1) / 26)
  }
  return tag
}

function stripLabelPrefix(label: string): string {
  return label.replace(/^\s*\([A-Za-z]+\)\s*/, '')
}

export function needsGeneratedPreview(path: string): boolean {
  return /\.(tif|tiff)$/i.test(path)
}

export const useImageStore = defineStore('images', {
  state: () => ({
    items: [] as ImageItem[],
    selectedId: '' as string
  }),
  getters: {
    selectedItem(state): ImageItem | undefined {
      return state.items.find((item) => item.id === state.selectedId)
    },
    pythonImages(state): PythonImageInput[] {
      return state.items.map((item) => ({ path: item.path, label: item.label, crop: item.crop }))
    }
  },
  actions: {
    addPaths(paths: string[]): ImageItem[] {
      const added: ImageItem[] = []
      for (const path of paths) {
        const name = fileNameFromPath(path)
        const label = `(${indexLabel(this.items.length)}) ${nameWithoutExt(name)}`
        const item: ImageItem = {
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          path,
          name,
          label,
          crop: { enabled: false, left: 0, top: 0, right: 0, bottom: 0 },
          previewPending: needsGeneratedPreview(path)
        }
        this.items.push(item)
        added.push(item)
      }
      if (!this.selectedId && this.items.length) {
        this.selectedId = this.items[this.items.length - 1].id
      }
      return added
    },
    setPreview(id: string, previewPath: string | undefined, error?: string) {
      const item = this.items.find((row) => row.id === id)
      if (!item) return
      item.previewPath = previewPath
      item.previewPending = false
      item.previewError = error
    },
    removeSelected() {
      if (!this.selectedId) return
      const index = this.items.findIndex((item) => item.id === this.selectedId)
      if (index < 0) return
      this.items.splice(index, 1)
      this.selectedId = this.items[Math.min(index, this.items.length - 1)]?.id ?? ''
    },
    clear() {
      this.items = []
      this.selectedId = ''
    },
    select(id: string) {
      this.selectedId = id
    },
    updateLabel(id: string, label: string) {
      const item = this.items.find((row) => row.id === id)
      if (item) item.label = label
    },
    updateCrop(id: string, crop: Partial<ImageItem['crop']>) {
      const item = this.items.find((row) => row.id === id)
      if (!item) return
      item.crop = {
        ...item.crop,
        ...crop,
        left: Math.max(0, Math.min(0.9, crop.left ?? item.crop.left)),
        top: Math.max(0, Math.min(0.9, crop.top ?? item.crop.top)),
        right: Math.max(0, Math.min(0.9, crop.right ?? item.crop.right)),
        bottom: Math.max(0, Math.min(0.9, crop.bottom ?? item.crop.bottom))
      }
      if (item.crop.left + item.crop.right > 0.92) {
        item.crop.right = Math.max(0, 0.92 - item.crop.left)
      }
      if (item.crop.top + item.crop.bottom > 0.92) {
        item.crop.bottom = Math.max(0, 0.92 - item.crop.top)
      }
    },
    resetCrop(id: string) {
      const item = this.items.find((row) => row.id === id)
      if (item) item.crop = { enabled: false, left: 0, top: 0, right: 0, bottom: 0 }
    },
    reorder(ids: string[]) {
      const byId = new Map(this.items.map((item) => [item.id, item]))
      this.items = ids.map((id) => byId.get(id)).filter((item): item is ImageItem => Boolean(item))
      this.relabelRows()
    },
    moveSelected(delta: number) {
      const index = this.items.findIndex((item) => item.id === this.selectedId)
      const target = index + delta
      if (index < 0 || target < 0 || target >= this.items.length) return
      const tmp = this.items[index]
      this.items[index] = this.items[target]
      this.items[target] = tmp
      this.relabelRows()
    },
    relabelRows() {
      this.items = this.items.map((item, index) => {
        const body = stripLabelPrefix(item.label).trim() || nameWithoutExt(item.name)
        return { ...item, label: `(${indexLabel(index)}) ${body}` }
      })
    },
    autoLabels() {
      this.items = this.items.map((item, index) => ({
        ...item,
        label: `(${indexLabel(index)}) ${nameWithoutExt(item.name)}`
      }))
    }
  }
})

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import ImageList from './components/ImageList.vue'
import ParameterPanel from './components/ParameterPanel.vue'
import PreviewPanel from './components/PreviewPanel.vue'
import ImageEditorDialog from './components/ImageEditorDialog.vue'
import ExportPanel from './components/ExportPanel.vue'
import StatusLog from './components/StatusLog.vue'
import { needsGeneratedPreview, useImageStore } from './stores/imageStore'
import { useSettingsStore } from './stores/settingsStore'
import type { ImageItem, RenderResult } from './types/image'
import type { LogEntry, LogLevel } from './types/log'
import { Download, Eye, FilePlus2, Palette, Sparkles, Wand2 } from 'lucide-vue-next'

const imageStore = useImageStore()
const settings = useSettingsStore()
const previewPath = ref('')
const lastOutputPath = ref('')
const outputSize = ref('')
const busy = ref(false)
const editorOpen = ref(false)
const renameSignal = ref(0)

let logCounter = 0
const logs = ref<LogEntry[]>([
  { id: logCounter++, time: now(), message: '就绪：添加图像后生成预览或导出。', level: 'info' }
])

const selectedImage = computed(() => imageStore.selectedItem)

function now(): string {
  return new Date().toLocaleTimeString()
}

function appendLog(message: string, level: LogLevel = 'info') {
  logs.value = [{ id: logCounter++, time: now(), message, level }, ...logs.value].slice(0, 120)
}

function clearLogs() {
  logs.value = []
}

function dirnameOf(p: string): string {
  if (!p) return ''
  const idx = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'))
  return idx >= 0 ? p.slice(0, idx) : ''
}

function stemOf(p: string): string {
  const base = p.slice(Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\')) + 1)
  const dot = base.lastIndexOf('.')
  return dot > 0 ? base.slice(0, dot) : base
}

function hasExplicitPath(p: string): boolean {
  return /[\\/]/.test(p || '')
}

function inferOutputPath(imagePath: string): string {
  const dir = dirnameOf(imagePath)
  const stem = stemOf(imagePath)
  const sep = imagePath.includes('\\') && !imagePath.includes('/') ? '\\' : '/'
  const base = `${stem}_mosaic.${settings.outputFormat}`
  return dir ? `${dir}${sep}${base}` : base
}

async function ensurePreview(item: ImageItem) {
  if (!needsGeneratedPreview(item.path)) return
  try {
    const result = await window.colorExchange.buildTiffPreview(item.path)
    if (result?.success && result.previewPath) {
      imageStore.setPreview(item.id, result.previewPath)
    } else {
      imageStore.setPreview(item.id, undefined, result?.error)
      appendLog(`TIFF 预览生成失败：${item.name} - ${result?.error ?? '未知错误'}`, 'warn')
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    imageStore.setPreview(item.id, undefined, message)
    appendLog(`TIFF 预览生成失败：${item.name} - ${message}`, 'warn')
  }
}

async function addImages() {
  const paths = await window.colorExchange.openImages()
  if (!paths.length) return
  const added = imageStore.addPaths(paths)
  appendLog(`已添加 ${paths.length} 张图像。`, 'success')
  if (!hasExplicitPath(settings.outputPath) && paths.length) {
    settings.outputPath = inferOutputPath(paths[0])
    appendLog(`已自动设定输出路径：${settings.outputPath}`)
  }
  const tiffs = added.filter((item) => needsGeneratedPreview(item.path))
  if (tiffs.length) {
    appendLog(`正在为 ${tiffs.length} 张 TIFF 生成预览缩略图...`)
    await Promise.all(tiffs.map(ensurePreview))
  }
}

async function chooseOutput() {
  const selected = await window.colorExchange.saveOutput(settings.outputPath, settings.outputFormat)
  if (selected) {
    settings.outputPath = selected
    appendLog(`输出路径：${selected}`)
  }
}

function payload(exportOutput: boolean) {
  const plainSettings = JSON.parse(JSON.stringify(settings.$state))
  const plainImages = imageStore.items.map((item) => ({
    path: item.path,
    label: item.label,
    crop: {
      enabled: Boolean(item.crop.enabled),
      left: Number(item.crop.left),
      top: Number(item.crop.top),
      right: Number(item.crop.right),
      bottom: Number(item.crop.bottom)
    }
  }))
  return {
    images: plainImages,
    settings: plainSettings,
    outputPath: exportOutput ? settings.outputPath : undefined
  }
}

async function render(exportOutput: boolean) {
  if (!imageStore.items.length) {
    appendLog('请先添加图像文件。', 'warn')
    return
  }
  if (settings.climMax <= settings.climMin) {
    appendLog('CLim 最大值必须大于最小值。', 'error')
    return
  }
  if (exportOutput && !hasExplicitPath(settings.outputPath)) {
    await chooseOutput()
    if (!hasExplicitPath(settings.outputPath)) return
  }
  busy.value = true
  appendLog(exportOutput ? '开始导出高分辨率拼图...' : '开始生成预览...')
  try {
    const result = (await window.colorExchange.renderMosaic(payload(exportOutput))) as RenderResult
    if (!result.success) {
      appendLog(`错误：${result.error ?? '未知错误'}`, 'error')
      return
    }
    previewPath.value = result.previewPath || result.outputPath || previewPath.value
    if (exportOutput && result.outputPath) {
      lastOutputPath.value = result.outputPath
    }
    outputSize.value = result.width && result.height ? `${result.width} × ${result.height}px` : ''
    appendLog(
      exportOutput ? `导出完成：${result.outputPath}` : `预览完成：${outputSize.value}`,
      'success'
    )
  } catch (error) {
    appendLog(`错误：${error instanceof Error ? error.message : String(error)}`, 'error')
  } finally {
    busy.value = false
  }
}

async function convertSingle() {
  const inputPath = await window.colorExchange.openSingleImage()
  if (!inputPath) return
  const suggested = inputPath.replace(/\.[^.]+$/, `_color.${settings.outputFormat}`)
  const out = await window.colorExchange.saveOutput(suggested, settings.outputFormat)
  if (!out) return
  busy.value = true
  appendLog('开始单图伪彩色转换...')
  try {
    const plainSettings = JSON.parse(JSON.stringify(settings.$state))
    const result = (await window.colorExchange.convertSingle({
      inputPath,
      outputPath: out,
      settings: plainSettings
    })) as RenderResult
    if (result.success) {
      lastOutputPath.value = result.outputPath ?? lastOutputPath.value
      appendLog(`单图转换完成：${result.outputPath}`, 'success')
    } else {
      appendLog(`错误：${result.error ?? '未知错误'}`, 'error')
    }
  } finally {
    busy.value = false
  }
}

async function revealInFolder(target: string) {
  if (!target) {
    appendLog('尚无可定位的文件。', 'warn')
    return
  }
  const result = await window.colorExchange.revealInFolder(target)
  if (result?.success) {
    appendLog(`已打开文件管理器：${result.revealed || target}`)
  } else {
    appendLog(`无法打开文件管理器：${result?.reason || target}`, 'warn')
  }
}

function revealPreview() {
  return revealInFolder(lastOutputPath.value || settings.outputPath || previewPath.value)
}

function revealOutputDir() {
  return revealInFolder(lastOutputPath.value || settings.outputPath)
}

function onKeyDown(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null
  const inEditable =
    target?.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName || '')

  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'o') {
    event.preventDefault()
    addImages()
    return
  }
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
    event.preventDefault()
    render(false)
    return
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
    event.preventDefault()
    render(true)
    return
  }
  if (!inEditable && event.key === 'F2' && imageStore.selectedId) {
    event.preventDefault()
    renameSignal.value++
    return
  }
  if (!inEditable && (event.key === 'Delete' || event.key === 'Backspace')) {
    if (imageStore.selectedId) {
      event.preventDefault()
      imageStore.removeSelected()
    }
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown)
})
</script>

<template>
  <div class="app-root">
    <header class="app-header">
      <div class="brand">
        <span class="brand-icon"><Palette :size="18" /></span>
        <div>
          <div class="brand-title">ColorExchange</div>
          <div class="brand-caption">Pseudo-color mosaic for scientific images</div>
        </div>
      </div>
      <div class="header-actions">
        <button class="header-btn" title="Ctrl/⌘ + O" @click="addImages">
          <FilePlus2 :size="16" />
          <span>添加图像</span>
        </button>
        <button class="header-btn" title="对单张图片做伪彩色转换" @click="convertSingle">
          <Wand2 :size="16" />
          <span>单图转换</span>
        </button>
        <button
          class="header-btn ghost"
          :disabled="!imageStore.items.length"
          title="应用归一化预设"
          @click="settings.applyNormalizedPreset()"
        >
          <Sparkles :size="16" />
          <span>归一化预设</span>
        </button>
      </div>
    </header>

    <main class="app-shell">
      <section class="sidebar">
        <ImageList
          :rename-signal="renameSignal"
          @add="addImages"
          @open-editor="editorOpen = true"
          @log="appendLog"
        />
      </section>

      <section class="workspace">
        <PreviewPanel
          :preview-path="previewPath"
          :busy="busy"
          :output-size="outputSize"
          @refresh="render(false)"
          @reveal="revealPreview"
        />
        <div class="bottom-actions">
          <button
            class="primary action-button"
            :disabled="busy || !imageStore.items.length"
            title="Ctrl/⌘ + Enter"
            @click="render(false)"
          >
            <Eye :size="18" />
            <span>生成预览</span>
          </button>
          <button
            class="success action-button"
            :disabled="busy || !imageStore.items.length"
            :title="
              hasExplicitPath(settings.outputPath)
                ? `Ctrl/⌘ + S · ${settings.outputPath}`
                : '选择输出路径并导出'
            "
            @click="render(true)"
          >
            <Download :size="18" />
            <span>导出图片</span>
          </button>
        </div>
        <StatusLog :logs="logs" @clear="clearLogs" />
      </section>

      <aside class="settings">
        <ParameterPanel />
        <ExportPanel @choose-output="chooseOutput" @reveal-output-dir="revealOutputDir" />
      </aside>
    </main>

    <ImageEditorDialog
      v-if="editorOpen && selectedImage"
      :image="selectedImage"
      @update-crop="imageStore.updateCrop(selectedImage.id, $event)"
      @reset-crop="imageStore.resetCrop(selectedImage.id)"
      @close="editorOpen = false"
    />
  </div>
</template>

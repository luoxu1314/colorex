<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import ImageList from './components/ImageList.vue'
import ParameterPanel from './components/ParameterPanel.vue'
import PreviewPanel from './components/PreviewPanel.vue'
import ImageEditorDialog from './components/ImageEditorDialog.vue'
import ExportPanel from './components/ExportPanel.vue'
import StatusLog from './components/StatusLog.vue'
import ThemeToggle from './components/ThemeToggle.vue'
import CommandPalette from './components/CommandPalette.vue'
import appIcon from './assets/app-icon.png'
import type { CommandItem } from './types/command'
import ToastContainer from './components/ToastContainer.vue'
import ShortcutsHelp from './components/ShortcutsHelp.vue'
import { needsGeneratedPreview, useImageStore } from './stores/imageStore'
import { useSettingsStore } from './stores/settingsStore'
import { useUiStore } from './stores/uiStore'
import { APP_COPYRIGHT } from './config/appInfo'
import type { ImageItem, RenderResult } from './types/image'
import type { LogEntry, LogLevel } from './types/log'
import {
  Command,
  Download,
  Eye,
  FilePlus2,
  FolderOpen,
  HelpCircle,
  ImagePlus,
  Keyboard,
  Moon,
  RotateCcw,
  Sparkles,
  Sun,
  Trash2,
  Wand2,
} from 'lucide-vue-next'

const imageStore = useImageStore()
const settings = useSettingsStore()
const ui = useUiStore()
const previewPath = ref('')
const lastOutputPath = ref('')
const outputSize = ref('')
const busy = ref(false)
const editorOpen = ref(false)
const renameSignal = ref(0)
const dragActive = ref(false)
const dragHover = ref(false)
let dragDepth = 0
let dragLeaveTimer: ReturnType<typeof setTimeout> | null = null

const SUPPORTED_EXT_RE = /\.(png|jpe?g|tiff?|bmp|webp)$/i

const appVersion = __APP_VERSION__

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
  // Also surface success/warn/error as a toast so the user notices the event
  // even if the status log is out of view. Plain info stays silent.
  if (level === 'success') ui.pushToast(message, 'success')
  else if (level === 'warn') ui.pushToast(message, 'warn')
  else if (level === 'error') ui.pushToast(message, 'error', { title: '出错了' })
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

async function addPathsToStore(paths: string[]) {
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

async function addImages() {
  const paths = await window.colorExchange.openImages()
  await addPathsToStore(paths)
}

function clearDragState() {
  dragDepth = 0
  dragActive.value = false
  dragHover.value = false
  if (dragLeaveTimer) {
    clearTimeout(dragLeaveTimer)
    dragLeaveTimer = null
  }
}

function hasFilesInDrag(event: DragEvent): boolean {
  const items = event.dataTransfer?.items
  if (items && items.length) {
    for (let i = 0; i < items.length; i++) {
      if (items[i].kind === 'file') return true
    }
    return false
  }
  return Boolean(event.dataTransfer?.types?.includes('Files'))
}

function onWindowDragEnter(event: DragEvent) {
  // Only react to external-file drags. Internal drags (e.g. sortable.js row
  // reorder) carry no 'Files' type so we leave them alone.
  if (!hasFilesInDrag(event)) return
  event.preventDefault()
  event.stopPropagation()
  dragDepth++
  dragActive.value = true
}

function onWindowDragOver(event: DragEvent) {
  // Chrome hides dataTransfer contents during dragover for privacy, so we can
  // no longer rely on hasFilesInDrag here. Trust the state we locked in at
  // dragenter and just make sure drop is allowed.
  if (!dragActive.value) return
  event.preventDefault()
  event.stopPropagation()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
  dragHover.value = true
  if (dragLeaveTimer) {
    clearTimeout(dragLeaveTimer)
    dragLeaveTimer = null
  }
}

function onWindowDragLeave(event: DragEvent) {
  if (!dragActive.value) return
  dragDepth = Math.max(0, dragDepth - 1)
  if (dragDepth === 0) {
    if (dragLeaveTimer) clearTimeout(dragLeaveTimer)
    dragLeaveTimer = setTimeout(clearDragState, 80)
  }
}

async function onWindowDrop(event: DragEvent) {
  if (!dragActive.value && !hasFilesInDrag(event)) return
  event.preventDefault()
  event.stopPropagation()
  const files = Array.from(event.dataTransfer?.files ?? [])
  clearDragState()
  if (!files.length) {
    appendLog('未识别到拖入的文件。', 'warn')
    return
  }
  const getPath = window.colorExchange.getDroppedFilePath
  const paths: string[] = []
  const rejected: string[] = []
  for (const file of files) {
    const p = typeof getPath === 'function' ? await getPath(file) : ''
    if (!p) {
      rejected.push(file.name || '(unknown)')
      continue
    }
    if (!SUPPORTED_EXT_RE.test(p)) {
      rejected.push(file.name || p)
      continue
    }
    paths.push(p)
  }
  if (rejected.length) {
    appendLog(
      `已忽略 ${rejected.length} 个不支持/无法解析的文件：${rejected.slice(0, 3).join('、')}${rejected.length > 3 ? '…' : ''}`,
      'warn'
    )
  }
  if (paths.length) {
    await addPathsToStore(paths)
  } else if (!rejected.length) {
    appendLog('拖入的文件无法获取路径，请尝试从文件管理器拖入真实文件。', 'warn')
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
  } catch (error) {
    appendLog(`错误：${error instanceof Error ? error.message : String(error)}`, 'error')
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

  const cmd = event.metaKey || event.ctrlKey

  if (cmd && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    ui.toggleCommandPalette()
    return
  }
  if (cmd && event.key === '/') {
    event.preventDefault()
    ui.toggleTheme()
    return
  }
  if (!inEditable && event.key === '?') {
    event.preventDefault()
    ui.openShortcuts()
    return
  }
  if (cmd && event.key.toLowerCase() === 'o') {
    event.preventDefault()
    addImages()
    return
  }
  if (cmd && event.key === 'Enter') {
    event.preventDefault()
    render(false)
    return
  }
  if (cmd && event.key.toLowerCase() === 's') {
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

// Modifier key rendered as a symbol on macOS. Renderer process has
// `navigator.platform` available; no need for the main process.
const isMac =
  typeof navigator !== 'undefined' &&
  /(Mac|iPhone|iPad|iPod)/i.test(navigator.platform ?? '')
const modLabel = isMac ? '⌘' : 'Ctrl'

function clearAllImages() {
  if (!imageStore.items.length) return
  imageStore.clear()
  appendLog('已清空图像列表。', 'info')
}

const commands = computed<CommandItem[]>(() => {
  const hasImages = imageStore.items.length > 0
  const hasSelection = Boolean(imageStore.selectedId)
  return [
    {
      id: 'add-images',
      title: '添加图像',
      hint: '从文件选择器添加一张或多张图片',
      group: '文件',
      icon: FilePlus2,
      shortcut: `${modLabel}O`,
      keywords: 'open import add files image',
      run: addImages,
    },
    {
      id: 'convert-single',
      title: '单图伪彩色转换',
      hint: '对单张图片直接输出伪彩色结果',
      group: '文件',
      icon: Wand2,
      keywords: 'single convert pseudo color',
      run: convertSingle,
    },
    {
      id: 'render-preview',
      title: '生成预览',
      hint: '渲染当前参数下的拼图预览',
      group: '处理',
      icon: Eye,
      shortcut: `${modLabel}↵`,
      disabled: !hasImages || busy.value,
      keywords: 'preview render mosaic',
      run: () => render(false),
    },
    {
      id: 'export-output',
      title: '导出图片',
      hint: '按完整分辨率导出成品文件',
      group: '处理',
      icon: Download,
      shortcut: `${modLabel}S`,
      disabled: !hasImages || busy.value,
      keywords: 'export save output',
      run: () => render(true),
    },
    {
      id: 'normalized-preset',
      title: '应用归一化预设',
      hint: '快速应用 0-1 归一化显示',
      group: '处理',
      icon: Sparkles,
      disabled: !hasImages,
      keywords: 'normalize preset',
      run: () => settings.applyNormalizedPreset(),
    },
    {
      id: 'edit-selected',
      title: '编辑选中图像',
      hint: '在图像编辑器中裁剪或调整',
      group: '编辑',
      icon: ImagePlus,
      disabled: !hasSelection,
      keywords: 'edit crop dialog',
      run: () => {
        editorOpen.value = true
      },
    },
    {
      id: 'remove-selected',
      title: '移除选中图像',
      group: '编辑',
      icon: Trash2,
      shortcut: 'Del',
      disabled: !hasSelection,
      keywords: 'remove delete selected',
      run: () => imageStore.removeSelected(),
    },
    {
      id: 'clear-images',
      title: '清空图像列表',
      group: '编辑',
      icon: RotateCcw,
      disabled: !hasImages,
      keywords: 'clear reset images',
      run: clearAllImages,
    },
    {
      id: 'reveal-output',
      title: '打开输出目录',
      group: '其他',
      icon: FolderOpen,
      keywords: 'reveal folder open output',
      run: revealOutputDir,
    },
    {
      id: 'toggle-theme',
      title: ui.theme === 'dark' ? '切换到明亮模式' : '切换到黑暗模式',
      hint: '切换界面的明暗主题',
      group: '其他',
      icon: ui.theme === 'dark' ? Sun : Moon,
      shortcut: `${modLabel}/`,
      keywords: 'theme mode dark light toggle',
      run: () => ui.toggleTheme(),
    },
    {
      id: 'show-shortcuts',
      title: '显示键盘快捷键',
      group: '其他',
      icon: Keyboard,
      shortcut: '?',
      keywords: 'shortcuts keys help',
      run: () => ui.openShortcuts(),
    },
    {
      id: 'clear-logs',
      title: '清空日志',
      group: '其他',
      icon: Trash2,
      keywords: 'clear logs history',
      run: clearLogs,
    },
  ]
})

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('dragenter', onWindowDragEnter)
  window.addEventListener('dragover', onWindowDragOver)
  window.addEventListener('dragleave', onWindowDragLeave)
  window.addEventListener('drop', onWindowDrop)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('dragenter', onWindowDragEnter)
  window.removeEventListener('dragover', onWindowDragOver)
  window.removeEventListener('dragleave', onWindowDragLeave)
  window.removeEventListener('drop', onWindowDrop)
})
</script>

<template>
  <div class="app-root">
    <header class="app-header">
      <div class="brand">
        <span class="brand-icon">
          <img :src="appIcon" alt="" aria-hidden="true" />
        </span>
        <div>
          <div class="brand-title">ColorExchange</div>
          <div class="brand-caption">Pseudo-color mosaic for scientific images</div>
          <div class="brand-meta" role="contentinfo" aria-label="版本与版权">
            v{{ appVersion }} · {{ APP_COPYRIGHT }}
          </div>
        </div>
        <span
          class="status-chip"
          :data-state="busy ? 'busy' : 'ready'"
          :title="busy ? 'Python 后台正在处理' : 'Python 后台就绪'"
        >
          <span class="status-chip-dot" aria-hidden="true"></span>
          <span>{{ busy ? '处理中' : '就绪' }}</span>
        </span>
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
        <button
          class="header-btn ghost"
          title="命令面板 (Ctrl/⌘ + K)"
          @click="ui.openCommandPalette()"
        >
          <Command :size="15" />
          <span>命令</span>
        </button>
        <button
          class="icon-button ghost"
          title="键盘快捷键 (按 ?)"
          aria-label="键盘快捷键"
          @click="ui.openShortcuts()"
        >
          <HelpCircle :size="16" />
        </button>
        <ThemeToggle />
      </div>
    </header>

    <div v-if="busy" class="app-progress" aria-hidden="true"></div>

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
          @open-command="ui.openCommandPalette()"
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

    <Transition name="drop-overlay">
      <div v-if="dragActive" class="drop-overlay" :class="{ hot: dragHover }">
        <div class="drop-card">
          <div class="drop-ring">
            <ImagePlus :size="34" />
          </div>
          <div class="drop-title">松开即可添加图像</div>
          <div class="drop-caption">支持 png · jpg · tif · bmp · webp · 多选 OK</div>
        </div>
      </div>
    </Transition>

    <CommandPalette :commands="commands" />
    <ShortcutsHelp />
    <ToastContainer />
  </div>
</template>

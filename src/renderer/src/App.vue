<script setup lang="ts">
import { computed, ref } from 'vue'
import ImageList from './components/ImageList.vue'
import ParameterPanel from './components/ParameterPanel.vue'
import PreviewPanel from './components/PreviewPanel.vue'
import ImageEditorDialog from './components/ImageEditorDialog.vue'
import ExportPanel from './components/ExportPanel.vue'
import StatusLog from './components/StatusLog.vue'
import { useImageStore } from './stores/imageStore'
import { useSettingsStore } from './stores/settingsStore'
import type { RenderResult } from './types/image'
import { Download, Eye, Wand2 } from 'lucide-vue-next'

const imageStore = useImageStore()
const settings = useSettingsStore()
const previewPath = ref('')
const outputSize = ref('')
const busy = ref(false)
const logs = ref<string[]>(['就绪：添加图像后生成预览或导出。'])
const editorOpen = ref(false)

const selectedImage = computed(() => imageStore.selectedItem)

function appendLog(message: string) {
  logs.value = [`${new Date().toLocaleTimeString()}  ${message}`, ...logs.value].slice(0, 80)
}

async function addImages() {
  const paths = await window.colorExchange.openImages()
  if (!paths.length) return
  imageStore.addPaths(paths)
  appendLog(`已添加 ${paths.length} 张图像。`)
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
    appendLog('请先添加图像文件。')
    return
  }
  busy.value = true
  appendLog(exportOutput ? '开始导出高分辨率拼图...' : '开始生成预览...')
  try {
    const result = (await window.colorExchange.renderMosaic(payload(exportOutput))) as RenderResult
    if (!result.success) {
      appendLog(`错误：${result.error ?? '未知错误'}`)
      return
    }
    previewPath.value = result.previewPath || result.outputPath || previewPath.value
    outputSize.value = result.width && result.height ? `${result.width} x ${result.height}px` : ''
    appendLog(exportOutput ? `导出完成：${result.outputPath}` : `预览完成：${outputSize.value}`)
  } catch (error) {
    appendLog(`错误：${error instanceof Error ? error.message : String(error)}`)
  } finally {
    busy.value = false
  }
}

async function convertSingle() {
  const inputPath = await window.colorExchange.openSingleImage()
  if (!inputPath) return
  const out = await window.colorExchange.saveOutput(inputPath.replace(/\.[^.]+$/, `_color.${settings.outputFormat}`), settings.outputFormat)
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
    appendLog(result.success ? `单图转换完成：${result.outputPath}` : `错误：${result.error ?? '未知错误'}`)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <main class="app-shell">
    <section class="sidebar">
      <ImageList
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
      />
      <div class="bottom-actions">
        <button class="primary action-button" :disabled="busy" @click="render(false)">
          <Eye :size="18" />
          <span>预览</span>
        </button>
        <button class="success action-button" :disabled="busy" @click="render(true)">
          <Download :size="18" />
          <span>导出图片</span>
        </button>
        <button class="warning action-button" :disabled="busy" @click="convertSingle">
          <Wand2 :size="18" />
          <span>单图转换</span>
        </button>
      </div>
      <StatusLog :logs="logs" />
    </section>

    <aside class="settings">
      <ParameterPanel />
      <ExportPanel @choose-output="chooseOutput" />
    </aside>

    <ImageEditorDialog
      v-if="editorOpen && selectedImage"
      :image="selectedImage"
      @update-crop="imageStore.updateCrop(selectedImage.id, $event)"
      @reset-crop="imageStore.resetCrop(selectedImage.id)"
      @close="editorOpen = false"
    />
  </main>
</template>

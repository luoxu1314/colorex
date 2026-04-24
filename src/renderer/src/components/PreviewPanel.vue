<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { FolderOpen, Maximize2, RefreshCw, Scan } from 'lucide-vue-next'

const props = defineProps<{
  previewPath: string
  busy: boolean
  outputSize: string
}>()

defineEmits<{ refresh: []; reveal: [] }>()

const scale = ref(1)
const tx = ref(0)
const ty = ref(0)
const dragging = ref(false)
const last = ref({ x: 0, y: 0 })

const previewUrl = computed(() =>
  props.previewPath
    ? `colorexchange-file://image?path=${encodeURIComponent(props.previewPath)}`
    : ''
)

const transform = computed(() => `translate(${tx.value}px, ${ty.value}px) scale(${scale.value})`)
const zoomPercent = computed(() => Math.round(scale.value * 100))

watch(
  () => props.previewPath,
  () => {
    scale.value = 1
    tx.value = 0
    ty.value = 0
  }
)

function onWheel(event: WheelEvent) {
  if (!previewUrl.value) return
  event.preventDefault()
  const factor = event.deltaY < 0 ? 1.12 : 0.89
  const next = Math.min(8, Math.max(0.1, scale.value * factor))
  if (next === scale.value) return
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const cx = event.clientX - rect.left - rect.width / 2
  const cy = event.clientY - rect.top - rect.height / 2
  const ratio = next / scale.value
  tx.value = cx - (cx - tx.value) * ratio
  ty.value = cy - (cy - ty.value) * ratio
  scale.value = next
}

function down(event: MouseEvent) {
  if (!previewUrl.value) return
  dragging.value = true
  last.value = { x: event.clientX, y: event.clientY }
}

function move(event: MouseEvent) {
  if (!dragging.value) return
  tx.value += event.clientX - last.value.x
  ty.value += event.clientY - last.value.y
  last.value = { x: event.clientX, y: event.clientY }
}

function up() {
  dragging.value = false
}

function fit() {
  scale.value = 1
  tx.value = 0
  ty.value = 0
}
</script>

<template>
  <div class="preview-panel">
    <div class="preview-header">
      <div class="preview-heading">
        <strong>拼图预览</strong>
        <span v-if="outputSize" class="muted">{{ outputSize }} · {{ zoomPercent }}%</span>
        <span v-else class="muted">{{ zoomPercent }}%</span>
      </div>
      <div class="toolbar compact">
        <button class="tool-button compact" title="适配窗口" @click="fit">
          <Maximize2 :size="15" /><span>适配</span>
        </button>
        <button class="tool-button compact" title="恢复 100%" @click="scale = 1">
          <Scan :size="15" /><span>100%</span>
        </button>
        <button class="tool-button compact" title="刷新预览" @click="$emit('refresh')">
          <RefreshCw :size="15" /><span>刷新</span>
        </button>
        <button
          class="tool-button compact"
          :disabled="!previewPath"
          title="在文件夹中显示"
          @click="$emit('reveal')"
        >
          <FolderOpen :size="15" /><span>打开目录</span>
        </button>
      </div>
    </div>
    <div
      class="preview-canvas"
      :class="{ empty: !previewUrl }"
      @wheel="onWheel"
      @mousedown="down"
      @mousemove="move"
      @mouseup="up"
      @mouseleave="up"
    >
      <div v-if="busy" class="busy">处理中...</div>
      <img
        v-else-if="previewUrl"
        class="preview-image"
        :src="previewUrl"
        :style="{ transform }"
        alt="preview"
        draggable="false"
      />
      <div v-else class="empty-state">
        <div class="empty-title">预览区</div>
        <div class="empty-caption">添加图像后点击"预览"生成拼图</div>
      </div>
    </div>
  </div>
</template>

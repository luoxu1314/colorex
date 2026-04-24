<script setup lang="ts">
import { computed, ref } from 'vue'
import { Maximize2, RefreshCw, Scan } from 'lucide-vue-next'

const props = defineProps<{
  previewPath: string
  busy: boolean
  outputSize: string
}>()

defineEmits<{ refresh: [] }>()

const scale = ref(1)
const tx = ref(0)
const ty = ref(0)
const dragging = ref(false)
const last = ref({ x: 0, y: 0 })

const previewUrl = computed(() => {
  if (!props.previewPath) return ''
  return `colorexchange-file://image?path=${encodeURIComponent(props.previewPath)}`
})

const transform = computed(() => `translate(${tx.value}px, ${ty.value}px) scale(${scale.value})`)

function onWheel(event: WheelEvent) {
  event.preventDefault()
  scale.value = Math.min(8, Math.max(0.1, scale.value * (event.deltaY < 0 ? 1.12 : 0.89)))
}

function down(event: MouseEvent) {
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
      <div>
        <strong>拼图预览</strong>
        <span v-if="outputSize" class="muted">{{ outputSize }}</span>
      </div>
      <div class="toolbar compact">
        <button class="tool-button compact" title="适配窗口" @click="fit"><Maximize2 :size="15" />适配</button>
        <button class="tool-button compact" title="恢复 100%" @click="scale = 1"><Scan :size="15" />100%</button>
        <button class="tool-button compact" title="刷新预览" @click="$emit('refresh')"><RefreshCw :size="15" />刷新</button>
      </div>
    </div>
    <div class="preview-canvas" @wheel="onWheel" @mousedown="down" @mousemove="move" @mouseup="up" @mouseleave="up">
      <div v-if="busy" class="busy">处理中...</div>
      <img v-else-if="previewUrl" class="preview-image" :src="previewUrl" :style="{ transform }" alt="preview" draggable="false" />
      <div v-else class="empty-state">预览图将在这里显示</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { CropMargins, ImageItem } from '../types/image'

const props = defineProps<{ image: ImageItem }>()
const emit = defineEmits<{
  close: []
  'update-crop': [crop: Partial<CropMargins>]
  'reset-crop': []
}>()

const scale = ref(1)
const tx = ref(0)
const ty = ref(0)
const drag = ref(false)
const cropDrag = ref<null | { mode: string; x: number; y: number; start: CropMargins }>(null)
const last = ref({ x: 0, y: 0 })

const url = computed(() => {
  return `colorexchange-file://image?path=${encodeURIComponent(props.image.path)}`
})

function wheel(event: WheelEvent) {
  event.preventDefault()
  scale.value = Math.min(12, Math.max(0.05, scale.value * (event.deltaY < 0 ? 1.12 : 0.89)))
}

function pointerMove(event: MouseEvent) {
  if (!drag.value) return
  tx.value += event.clientX - last.value.x
  ty.value += event.clientY - last.value.y
  last.value = { x: event.clientX, y: event.clientY }
}

const cropStyle = computed(() => ({
  left: `${(props.image.crop.enabled ? props.image.crop.left : 0) * 100}%`,
  top: `${(props.image.crop.enabled ? props.image.crop.top : 0) * 100}%`,
  right: `${(props.image.crop.enabled ? props.image.crop.right : 0) * 100}%`,
  bottom: `${(props.image.crop.enabled ? props.image.crop.bottom : 0) * 100}%`
}))

function enableCrop() {
  emit('update-crop', { enabled: true })
}

function startCropDrag(mode: string, event: PointerEvent) {
  event.preventDefault()
  event.stopPropagation()
  enableCrop()
  const target = event.currentTarget as HTMLElement
  target.setPointerCapture?.(event.pointerId)
  cropDrag.value = {
    mode,
    x: event.clientX,
    y: event.clientY,
    start: { ...props.image.crop, enabled: true }
  }
}

function moveCrop(event: PointerEvent) {
  if (!cropDrag.value) return
  const frame = (event.currentTarget as HTMLElement).querySelector('.image-frame') as HTMLElement | null
  if (!frame) return
  const rect = frame.getBoundingClientRect()
  const dx = (event.clientX - cropDrag.value.x) / Math.max(1, rect.width)
  const dy = (event.clientY - cropDrag.value.y) / Math.max(1, rect.height)
  const start = cropDrag.value.start
  const next: Partial<CropMargins> = { enabled: true }

  if (cropDrag.value.mode.includes('move')) {
    const cropW = 1 - start.left - start.right
    const cropH = 1 - start.top - start.bottom
    const left = Math.max(0, Math.min(1 - cropW, start.left + dx))
    const top = Math.max(0, Math.min(1 - cropH, start.top + dy))
    next.left = left
    next.right = 1 - cropW - left
    next.top = top
    next.bottom = 1 - cropH - top
  } else {
    if (cropDrag.value.mode.includes('w')) next.left = start.left + dx
    if (cropDrag.value.mode.includes('e')) next.right = start.right - dx
    if (cropDrag.value.mode.includes('n')) next.top = start.top + dy
    if (cropDrag.value.mode.includes('s')) next.bottom = start.bottom - dy
  }
  emit('update-crop', next)
}

function endCropDrag() {
  cropDrag.value = null
}
</script>

<template>
  <div class="modal-backdrop">
    <div class="editor-dialog">
      <header>
        <div>
          <strong>{{ image.label }}</strong>
          <span class="muted">{{ image.path }}</span>
        </div>
        <button @click="$emit('close')">关闭</button>
      </header>
      <div class="toolbar compact">
        <button @click="scale = 1; tx = 0; ty = 0">适配窗口</button>
        <button @click="scale = 1">100%</button>
        <button @click="scale *= 1.2">放大</button>
        <button @click="scale /= 1.2">缩小</button>
        <button @click="enableCrop">启用裁剪框</button>
        <button @click="$emit('reset-crop')">清除裁剪</button>
      </div>
      <div
        class="editor-canvas"
        @wheel="wheel"
        @mousedown="drag = true; last = { x: $event.clientX, y: $event.clientY }"
        @mousemove="pointerMove"
        @mouseup="drag = false"
        @mouseleave="drag = false"
        @pointermove="moveCrop"
        @pointerup="endCropDrag"
        @pointercancel="endCropDrag"
      >
        <div class="image-frame" :style="{ transform: `translate(${tx}px, ${ty}px) scale(${scale})` }">
          <img :src="url" draggable="false" />
          <div class="crop-box" :style="cropStyle" @mousedown.stop @pointerdown="startCropDrag('move', $event)">
            <span class="crop-edge edge-n" @pointerdown="startCropDrag('n', $event)"></span>
            <span class="crop-edge edge-e" @pointerdown="startCropDrag('e', $event)"></span>
            <span class="crop-edge edge-s" @pointerdown="startCropDrag('s', $event)"></span>
            <span class="crop-edge edge-w" @pointerdown="startCropDrag('w', $event)"></span>
            <span class="crop-handle handle-nw" @pointerdown="startCropDrag('nw', $event)"></span>
            <span class="crop-handle handle-ne" @pointerdown="startCropDrag('ne', $event)"></span>
            <span class="crop-handle handle-se" @pointerdown="startCropDrag('se', $event)"></span>
            <span class="crop-handle handle-sw" @pointerdown="startCropDrag('sw', $event)"></span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

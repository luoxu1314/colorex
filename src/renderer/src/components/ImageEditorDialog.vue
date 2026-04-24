<script setup lang="ts">
import { computed, ref } from 'vue'
import type { CropMargins, ImageItem } from '../types/image'
import { Crop, Maximize2, Minus, Plus, Scan, Square, X } from 'lucide-vue-next'

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
const aspectLock = ref(true)
const naturalW = ref(0)
const naturalH = ref(0)

const url = computed(() => {
  const target = props.image.previewPath || props.image.path
  return `colorexchange-file://image?path=${encodeURIComponent(target)}`
})

const previewPending = computed(
  () => props.image.previewPending === true && !props.image.previewPath
)

const zoomPercent = computed(() => Math.round(scale.value * 100))

function onImageLoad(event: Event) {
  const img = event.target as HTMLImageElement
  naturalW.value = img.naturalWidth || 1
  naturalH.value = img.naturalHeight || 1
}

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

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v))
}

function imageAspect() {
  if (!naturalW.value || !naturalH.value) return 1
  return naturalW.value / naturalH.value
}

function enableCrop() {
  if (props.image.crop.enabled) return
  if (aspectLock.value && naturalW.value && naturalH.value) {
    // Center a 1:1 crop (in pixel space) that spans ~80% of the shorter axis.
    const aspect = imageAspect()
    if (aspect >= 1) {
      // image wider than tall: square side = 0.8 * height_px (in normalized height 0.8)
      const sideW = 0.8 / aspect
      const leftOrRight = (1 - sideW) / 2
      emit('update-crop', {
        enabled: true,
        left: leftOrRight,
        right: leftOrRight,
        top: 0.1,
        bottom: 0.1
      })
    } else {
      const sideH = 0.8 * aspect
      const topOrBottom = (1 - sideH) / 2
      emit('update-crop', {
        enabled: true,
        left: 0.1,
        right: 0.1,
        top: topOrBottom,
        bottom: topOrBottom
      })
    }
  } else {
    emit('update-crop', { enabled: true })
  }
}

function toggleAspectLock() {
  aspectLock.value = !aspectLock.value
  // If enabling aspect lock on an existing non-square crop, reshape to square
  // around the current center using the opposite side as anchor.
  if (aspectLock.value && props.image.crop.enabled) {
    const { left, right, top, bottom } = props.image.crop
    const cropWn = 1 - left - right
    const cropHn = 1 - top - bottom
    const aspect = imageAspect()
    const cropWpx = cropWn
    const cropHpx = cropHn / aspect // Express both in the same "x" coordinate units; 1:1 means cropWn == cropHn/aspect
    if (Math.abs(cropWpx - cropHpx) < 1e-3) return
    // Shrink the larger side to match the smaller one, centered.
    if (cropWpx > cropHpx) {
      const newCropWn = cropHn / aspect
      const centerX = (left + (1 - right)) / 2
      const half = newCropWn / 2
      emit('update-crop', {
        enabled: true,
        left: clamp(centerX - half, 0, 1),
        right: clamp(1 - (centerX + half), 0, 1)
      })
    } else {
      const newCropHn = cropWn * aspect
      const centerY = (top + (1 - bottom)) / 2
      const half = newCropHn / 2
      emit('update-crop', {
        enabled: true,
        top: clamp(centerY - half, 0, 1),
        bottom: clamp(1 - (centerY + half), 0, 1)
      })
    }
  }
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
  const frame = (event.currentTarget as HTMLElement).querySelector(
    '.image-frame'
  ) as HTMLElement | null
  if (!frame) return
  const rect = frame.getBoundingClientRect()
  const dx = (event.clientX - cropDrag.value.x) / Math.max(1, rect.width)
  const dy = (event.clientY - cropDrag.value.y) / Math.max(1, rect.height)
  const start = cropDrag.value.start
  const mode = cropDrag.value.mode
  const next: Partial<CropMargins> = { enabled: true }

  if (mode.includes('move')) {
    const cropW = 1 - start.left - start.right
    const cropH = 1 - start.top - start.bottom
    const left = clamp(start.left + dx, 0, 1 - cropW)
    const top = clamp(start.top + dy, 0, 1 - cropH)
    next.left = left
    next.right = 1 - cropW - left
    next.top = top
    next.bottom = 1 - cropH - top
    emit('update-crop', next)
    return
  }

  let L = start.left
  let R = start.right
  let T = start.top
  let B = start.bottom
  if (mode.includes('w')) L = clamp(start.left + dx, 0, 1 - start.right - 0.02)
  if (mode.includes('e')) R = clamp(start.right - dx, 0, 1 - start.left - 0.02)
  if (mode.includes('n')) T = clamp(start.top + dy, 0, 1 - start.bottom - 0.02)
  if (mode.includes('s')) B = clamp(start.bottom - dy, 0, 1 - start.top - 0.02)

  if (aspectLock.value && naturalW.value && naturalH.value) {
    const aspect = imageAspect()
    const cropWn = 1 - L - R
    const cropHn = 1 - T - B
    // 1:1 in pixel space => cropWn * W == cropHn * H => cropHn = cropWn / aspect
    const horizontalEdge = mode === 'w' || mode === 'e'
    const verticalEdge = mode === 'n' || mode === 's'
    if (horizontalEdge) {
      const targetCropHn = cropWn / aspect
      const centerY = (start.top + (1 - start.bottom)) / 2
      const half = targetCropHn / 2
      T = clamp(centerY - half, 0, 1)
      B = clamp(1 - (centerY + half), 0, 1)
    } else if (verticalEdge) {
      const targetCropWn = cropHn * aspect
      const centerX = (start.left + (1 - start.right)) / 2
      const half = targetCropWn / 2
      L = clamp(centerX - half, 0, 1)
      R = clamp(1 - (centerX + half), 0, 1)
    } else {
      // Corner: anchor the opposite corner; adjust the other axis to match 1:1.
      const anchorX = mode.includes('w') ? 1 - start.right : start.left
      const anchorY = mode.includes('n') ? 1 - start.bottom : start.top
      const currentWn = 1 - L - R
      const currentHn = 1 - T - B
      // Use whichever drag was larger (in normalized image space) to drive.
      const driveW = Math.abs(currentWn - (1 - start.left - start.right))
      const driveH = Math.abs(currentHn - (1 - start.top - start.bottom))
      if (driveW >= driveH) {
        const targetHn = currentWn / aspect
        if (mode.includes('n')) {
          T = clamp(anchorY - targetHn, 0, 1)
        } else {
          B = clamp(1 - (anchorY + targetHn), 0, 1)
        }
      } else {
        const targetWn = currentHn * aspect
        if (mode.includes('w')) {
          L = clamp(anchorX - targetWn, 0, 1)
        } else {
          R = clamp(1 - (anchorX + targetWn), 0, 1)
        }
      }
    }
  }

  next.left = L
  next.right = R
  next.top = T
  next.bottom = B
  emit('update-crop', next)
}

function endCropDrag() {
  cropDrag.value = null
}

function fit() {
  scale.value = 1
  tx.value = 0
  ty.value = 0
}
</script>

<template>
  <div class="modal-backdrop" @mousedown.self="$emit('close')">
    <div class="editor-dialog">
      <header>
        <div class="editor-title">
          <strong>{{ image.label }}</strong>
          <span class="muted" :title="image.path">{{ image.path }}</span>
        </div>
        <button class="icon-button ghost" title="关闭" @click="$emit('close')">
          <X :size="15" />
        </button>
      </header>
      <div class="toolbar compact editor-toolbar">
        <button class="tool-button compact" title="适配窗口" @click="fit">
          <Maximize2 :size="14" /><span>适配</span>
        </button>
        <button class="tool-button compact" title="恢复 100%" @click="scale = 1">
          <Scan :size="14" /><span>100%</span>
        </button>
        <button class="tool-button compact" title="放大" @click="scale = Math.min(12, scale * 1.2)">
          <Plus :size="14" /><span>放大</span>
        </button>
        <button class="tool-button compact" title="缩小" @click="scale = Math.max(0.05, scale / 1.2)">
          <Minus :size="14" /><span>缩小</span>
        </button>
        <span class="toolbar-spacer" />
        <button class="tool-button compact" title="启用裁剪框" @click="enableCrop">
          <Crop :size="14" /><span>启用裁剪</span>
        </button>
        <button
          class="tool-button compact"
          :class="{ active: aspectLock }"
          :title="aspectLock ? '当前：1:1 正方形（点击切换为自由裁剪）' : '当前：自由裁剪（点击切换为 1:1）'"
          @click="toggleAspectLock"
        >
          <Square :size="14" /><span>{{ aspectLock ? '1:1' : '自由' }}</span>
        </button>
        <button class="tool-button compact danger-hover" title="清除裁剪" @click="$emit('reset-crop')">
          <X :size="14" /><span>清除裁剪</span>
        </button>
        <span class="zoom-chip">{{ zoomPercent }}%</span>
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
        <div v-if="previewPending" class="editor-loading">正在生成 TIFF 预览...</div>
        <div
          class="image-frame"
          :style="{ transform: `translate(${tx}px, ${ty}px) scale(${scale})` }"
        >
          <img :src="url" draggable="false" @load="onImageLoad" />
          <div
            class="crop-box"
            :style="cropStyle"
            @mousedown.stop
            @pointerdown="startCropDrag('move', $event)"
          >
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

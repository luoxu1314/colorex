<script setup lang="ts">
import { computed, ref, watch } from 'vue'
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
const last = ref({ x: 0, y: 0 })
const aspectLock = ref(true)
const naturalW = ref(0)
const naturalH = ref(0)
let defaultCropInitialized = false

// Minimum crop side in image pixels — large enough to hit, small enough to
// not feel constrained on tiny thumbnails.
const MIN_CROP_PX = 4

// We store drag state fully in IMAGE PIXEL space. Everything about aspect
// constraints is decided in image pixels, then we convert back to normalized
// CropMargins at the very end. This is the standard crop-editor approach
// (Photoshop, Lightroom, etc.) and sidesteps any CSS-layout mismatch.
type PxRect = { x0: number; y0: number; x1: number; y1: number }
const cropDrag = ref<null | {
  mode: string
  startClientX: number
  startClientY: number
  startRect: PxRect
  frameW: number // rendered frame width in screen px, for dx/dy → image-px conversion
  frameH: number
}>(null)

const url = computed(() => {
  const target = props.image.previewPath || props.image.path
  return `colorexchange-file://image?path=${encodeURIComponent(target)}`
})

const previewPending = computed(
  () => props.image.previewPending === true && !props.image.previewPath
)

const zoomPercent = computed(() => Math.round(scale.value * 100))

const frameStyle = computed(() => {
  const aspect = naturalW.value && naturalH.value ? naturalW.value / naturalH.value : 1
  return {
    transform: `translate(${tx.value}px, ${ty.value}px) scale(${scale.value})`,
    aspectRatio: `${aspect}`,
  }
})

function onImageLoad(event: Event) {
  const img = event.target as HTMLImageElement
  naturalW.value = img.naturalWidth || 1
  naturalH.value = img.naturalHeight || 1
  ensureDefaultCrop()
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

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

function cropRectFromProps(): PxRect {
  const W = Math.max(1, naturalW.value || 1)
  const H = Math.max(1, naturalH.value || 1)
  const { left, right, top, bottom, enabled } = props.image.crop
  if (!enabled) return { x0: 0, y0: 0, x1: W, y1: H }
  return { x0: left * W, y0: top * H, x1: (1 - right) * W, y1: (1 - bottom) * H }
}

function initialSquareRect(): PxRect {
  const W = Math.max(1, naturalW.value || 1)
  const H = Math.max(1, naturalH.value || 1)
  const side = Math.min(W, H)
  const x0 = (W - side) / 2
  const y0 = (H - side) / 2
  return { x0, y0, x1: x0 + side, y1: y0 + side }
}

function emitRect(rect: PxRect): void {
  const W = Math.max(1, naturalW.value || 1)
  const H = Math.max(1, naturalH.value || 1)
  emit('update-crop', {
    enabled: true,
    left: clamp(rect.x0 / W, 0, 1),
    right: clamp(1 - rect.x1 / W, 0, 1),
    top: clamp(rect.y0 / H, 0, 1),
    bottom: clamp(1 - rect.y1 / H, 0, 1),
  })
}

function enableCrop(): void {
  if (props.image.crop.enabled) return
  if (aspectLock.value && naturalW.value && naturalH.value) {
    emitRect(initialSquareRect())
  } else {
    emit('update-crop', { enabled: true })
  }
}

function ensureDefaultCrop(): void {
  if (defaultCropInitialized) return
  if (props.image.crop.enabled) return
  if (!naturalW.value || !naturalH.value) return
  defaultCropInitialized = true
  aspectLock.value = true
  emitRect(initialSquareRect())
}

function currentCropIsSquare(): boolean {
  if (!props.image.crop.enabled) return false
  if (!naturalW.value || !naturalH.value) return false
  const r = cropRectFromProps()
  return Math.abs(r.x1 - r.x0 - (r.y1 - r.y0)) < 0.5
}

function reshapeCurrentToSquare(): void {
  if (!props.image.crop.enabled) return
  const W = Math.max(1, naturalW.value || 1)
  const H = Math.max(1, naturalH.value || 1)
  const r = cropRectFromProps()
  const side = Math.min(r.x1 - r.x0, r.y1 - r.y0)
  const cx = (r.x0 + r.x1) / 2
  const cy = (r.y0 + r.y1) / 2
  const half = side / 2
  let x0 = cx - half
  let x1 = cx + half
  let y0 = cy - half
  let y1 = cy + half
  if (x0 < 0) { x1 -= x0; x0 = 0 }
  if (x1 > W) { x0 -= x1 - W; x1 = W }
  if (y0 < 0) { y1 -= y0; y0 = 0 }
  if (y1 > H) { y0 -= y1 - H; y1 = H }
  emitRect({ x0, y0, x1, y1 })
}

function toggleAspectLock(): void {
  // Three cases make the UX feel predictable:
  //   1. Locked + already square  → unlock (switch to free-form).
  //   2. Locked + NOT square      → keep locked, reshape to square NOW.
  //   3. Unlocked                 → lock, reshape to square if needed.
  // This means clicking "1:1" always results in either (a) a square crop
  // with the lock on, or (b) the current crop with the lock off — never
  // the confusing "lock on, but crop still rectangular" state.
  const isSquare = currentCropIsSquare()
  if (aspectLock.value && isSquare) {
    aspectLock.value = false
    return
  }
  aspectLock.value = true
  if (!isSquare) reshapeCurrentToSquare()
}

// When the dialog opens (or when the image's natural size becomes known),
// sync aspectLock to reflect whether the persisted crop is actually square.
// This prevents the confusing state where the button is shown as "1:1 on"
// while the crop is rectangular, carried over from an earlier session.
let lockSynced = false
watch(
  [naturalW, naturalH, () => props.image.crop.enabled],
  () => {
    if (lockSynced) return
    if (!naturalW.value || !naturalH.value) return
    if (!props.image.crop.enabled) {
      lockSynced = true
      return
    }
    aspectLock.value = currentCropIsSquare()
    lockSynced = true
  },
  { immediate: true }
)

function startCropDrag(mode: string, event: PointerEvent): void {
  event.preventDefault()
  event.stopPropagation()
  const wasEnabled = props.image.crop.enabled
  enableCrop()
  const target = event.currentTarget as HTMLElement
  target.setPointerCapture?.(event.pointerId)

  const frame =
    (target.closest('.editor-canvas') as HTMLElement | null)?.querySelector(
      '.image-frame'
    ) as HTMLElement | null
  const rect = frame?.getBoundingClientRect()
  // Resolve the "starting" image-pixel rect synchronously. If enableCrop()
  // just initialized the crop, the parent's state-update hasn't arrived via
  // props yet — use the same initial rect directly.
  let startRect: PxRect
  if (!wasEnabled) {
    startRect =
      aspectLock.value && naturalW.value && naturalH.value
        ? initialSquareRect()
        : { x0: 0, y0: 0, x1: naturalW.value || 1, y1: naturalH.value || 1 }
  } else {
    startRect = cropRectFromProps()
  }

  cropDrag.value = {
    mode,
    startClientX: event.clientX,
    startClientY: event.clientY,
    startRect,
    frameW: Math.max(1, rect?.width || 1),
    frameH: Math.max(1, rect?.height || 1),
  }
}

function moveCrop(event: PointerEvent): void {
  const d = cropDrag.value
  if (!d) return
  const W = Math.max(1, naturalW.value || 1)
  const H = Math.max(1, naturalH.value || 1)
  const s = d.startRect
  const mode = d.mode

  // Convert screen-pixel drag delta → image-pixel delta.
  const dxPx = ((event.clientX - d.startClientX) / d.frameW) * W
  const dyPx = ((event.clientY - d.startClientY) / d.frameH) * H

  if (mode === 'move') {
    const w = s.x1 - s.x0
    const h = s.y1 - s.y0
    const x0 = clamp(s.x0 + dxPx, 0, W - w)
    const y0 = clamp(s.y0 + dyPx, 0, H - h)
    emitRect({ x0, y0, x1: x0 + w, y1: y0 + h })
    return
  }

  // 1) Free-form edit: move the edges that the handle controls.
  let x0 = s.x0
  let y0 = s.y0
  let x1 = s.x1
  let y1 = s.y1
  if (mode.includes('w')) x0 = clamp(s.x0 + dxPx, 0, s.x1 - MIN_CROP_PX)
  if (mode.includes('e')) x1 = clamp(s.x1 + dxPx, s.x0 + MIN_CROP_PX, W)
  if (mode.includes('n')) y0 = clamp(s.y0 + dyPx, 0, s.y1 - MIN_CROP_PX)
  if (mode.includes('s')) y1 = clamp(s.y1 + dyPx, s.y0 + MIN_CROP_PX, H)

  // 2) If aspect is locked, force square in IMAGE PIXELS.
  if (aspectLock.value) {
    const isHorizontalEdge = mode === 'w' || mode === 'e'
    const isVerticalEdge = mode === 'n' || mode === 's'

    if (isHorizontalEdge) {
      // Keep vertical center stable; match height to width.
      let side = x1 - x0
      const cy = (s.y0 + s.y1) / 2
      // If the square would overflow top/bottom, shrink side so it fits.
      const maxSideByY = 2 * Math.min(cy, H - cy)
      if (side > maxSideByY) {
        side = maxSideByY
        if (mode === 'w') x0 = x1 - side
        else x1 = x0 + side
      }
      side = Math.max(side, MIN_CROP_PX)
      y0 = cy - side / 2
      y1 = cy + side / 2
    } else if (isVerticalEdge) {
      // Keep horizontal center stable; match width to height.
      let side = y1 - y0
      const cx = (s.x0 + s.x1) / 2
      const maxSideByX = 2 * Math.min(cx, W - cx)
      if (side > maxSideByX) {
        side = maxSideByX
        if (mode === 'n') y0 = y1 - side
        else y1 = y0 + side
      }
      side = Math.max(side, MIN_CROP_PX)
      x0 = cx - side / 2
      x1 = cx + side / 2
    } else {
      // Corner drag: anchor the OPPOSITE corner and grow/shrink a square.
      const anchorX = mode.includes('w') ? s.x1 : s.x0
      const anchorY = mode.includes('n') ? s.y1 : s.y0
      const sideX = Math.abs((mode.includes('w') ? x0 : x1) - anchorX)
      const sideY = Math.abs((mode.includes('n') ? y0 : y1) - anchorY)
      // Square side = min(requestedX, requestedY), clamped to what fits
      // from the anchor to the image edges.
      const maxSideX = mode.includes('w') ? anchorX : W - anchorX
      const maxSideY = mode.includes('n') ? anchorY : H - anchorY
      let side = Math.min(sideX, sideY, maxSideX, maxSideY)
      side = Math.max(side, MIN_CROP_PX)
      if (mode.includes('w')) { x0 = anchorX - side; x1 = anchorX }
      else { x0 = anchorX; x1 = anchorX + side }
      if (mode.includes('n')) { y0 = anchorY - side; y1 = anchorY }
      else { y0 = anchorY; y1 = anchorY + side }
    }
  }

  emitRect({ x0, y0, x1, y1 })
}

function endCropDrag(): void {
  cropDrag.value = null
}

function fit(): void {
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
        <div class="image-frame" :style="frameStyle">
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

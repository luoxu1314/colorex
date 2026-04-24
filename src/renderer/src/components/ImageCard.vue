<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { ImageItem } from '../types/image'
import { GripVertical, Pencil, Scissors, X } from 'lucide-vue-next'

const props = defineProps<{
  item: ImageItem
  selected: boolean
  renameTick?: number
}>()

const emit = defineEmits<{
  select: []
  'edit-label': [label: string]
  'reset-crop': []
  'open-editor': []
}>()

const editing = ref(false)
const draft = ref(props.item.label)
const inputRef = ref<HTMLInputElement | null>(null)
const naturalAspect = ref(1)

const displayPath = computed(() => props.item.previewPath || props.item.path)

const fileUrl = computed(() => {
  return `colorexchange-file://image?path=${encodeURIComponent(displayPath.value)}`
})

const previewPending = computed(
  () => props.item.previewPending === true && !props.item.previewPath
)
const previewFailed = computed(() => Boolean(props.item.previewError) && !props.item.previewPath)

const cropInset = computed(() => {
  const crop = props.item.crop
  return `${crop.top * 100}% ${crop.right * 100}% ${crop.bottom * 100}% ${crop.left * 100}%`
})

const cropActive = computed(
  () =>
    props.item.crop.enabled &&
    (props.item.crop.left > 0 ||
      props.item.crop.top > 0 ||
      props.item.crop.right > 0 ||
      props.item.crop.bottom > 0)
)

const thumbInnerStyle = computed(() => ({ aspectRatio: `${naturalAspect.value}` }))

function onThumbLoad(event: Event): void {
  const img = event.target as HTMLImageElement
  const w = img.naturalWidth || 1
  const h = img.naturalHeight || 1
  naturalAspect.value = w / h
}

function startEdit() {
  draft.value = props.item.label
  editing.value = true
  nextTick(() => {
    const el = inputRef.value
    if (el) {
      el.focus()
      el.select()
    }
  })
}

function commit(cancel = false) {
  if (!editing.value) return
  if (!cancel) {
    const next = draft.value.trim()
    if (next && next !== props.item.label) emit('edit-label', next)
  }
  editing.value = false
}

// External F2 signal from App.vue only fires for the selected card.
watch(
  () => props.renameTick,
  (tick) => {
    if (!tick || !props.selected) return
    startEdit()
  }
)
</script>

<template>
  <article
    class="image-card"
    :class="{ selected }"
    @click="emit('select')"
    @dblclick="emit('open-editor')"
  >
    <div class="drag-handle" title="拖拽排序"><GripVertical :size="16" /></div>
    <div class="thumb-wrap" :class="{ cropped: cropActive }">
      <div v-if="previewPending" class="thumb-placeholder" :title="item.name">生成预览中...</div>
      <div v-else-if="previewFailed" class="thumb-placeholder error" :title="item.previewError">
        预览失败
      </div>
      <div v-else class="thumb-inner" :style="thumbInnerStyle">
        <img
          class="thumb"
          :src="fileUrl"
          :alt="item.name"
          loading="lazy"
          @load="onThumbLoad"
        />
        <div v-if="cropActive" class="crop-window" :style="{ inset: cropInset }"></div>
      </div>
    </div>
    <div class="image-meta">
      <div class="file-name" :title="item.path">{{ item.name }}</div>
      <div class="label-row">
        <input
          v-if="editing"
          ref="inputRef"
          v-model="draft"
          class="label-input"
          @keydown.enter="commit(false)"
          @keydown.esc="commit(true)"
          @blur="commit(false)"
          @click.stop
          @dblclick.stop
        />
        <template v-else>
          <button
            class="label-button"
            :title="`点击重命名 (F2)：${item.label}`"
            @click.stop="startEdit"
          >
            {{ item.label }}
          </button>
          <button
            class="rename-icon"
            title="重命名 (F2)"
            @click.stop="startEdit"
          >
            <Pencil :size="12" />
          </button>
        </template>
      </div>
      <div class="file-path" :title="item.path">{{ item.path }}</div>
    </div>

    <div v-if="selected" class="crop-actions" @click.stop @dblclick.stop>
      <button class="mini-button" @click="emit('open-editor')">
        <Scissors :size="13" />打开裁剪
      </button>
      <span v-if="cropActive" class="crop-badge">已裁剪</span>
      <button v-if="cropActive" class="mini-button" @click="emit('reset-crop')">
        <X :size="13" />清除
      </button>
    </div>
  </article>
</template>

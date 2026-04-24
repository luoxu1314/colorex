<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ImageItem } from '../types/image'
import { GripVertical, Scissors, X } from 'lucide-vue-next'

const props = defineProps<{
  item: ImageItem
  selected: boolean
}>()

const emit = defineEmits<{
  select: []
  'edit-label': [label: string]
  'reset-crop': []
  'open-editor': []
}>()

const editing = ref(false)
const draft = ref(props.item.label)

const fileUrl = computed(() => {
  return `colorexchange-file://image?path=${encodeURIComponent(props.item.path)}`
})

const cropInset = computed(() => {
  const crop = props.item.crop
  return `${crop.top * 100}% ${crop.right * 100}% ${crop.bottom * 100}% ${crop.left * 100}%`
})

const cropActive = computed(() => props.item.crop.enabled && (
  props.item.crop.left > 0 || props.item.crop.top > 0 || props.item.crop.right > 0 || props.item.crop.bottom > 0
))

function startEdit() {
  draft.value = props.item.label
  editing.value = true
}

function commit(cancel = false) {
  if (!cancel) emit('edit-label', draft.value)
  editing.value = false
}
</script>

<template>
  <article class="image-card" :class="{ selected }" @click="emit('select')" @dblclick="emit('open-editor')">
    <div class="drag-handle" title="拖拽排序"><GripVertical :size="16" /></div>
    <div class="thumb-wrap" :class="{ cropped: cropActive }">
      <img class="thumb" :src="fileUrl" :alt="item.name" loading="lazy" />
      <div v-if="cropActive" class="crop-window" :style="{ inset: cropInset }"></div>
    </div>
    <div class="image-meta">
      <div class="file-name" :title="item.path">{{ item.name }}</div>
      <input
        v-if="editing"
        v-model="draft"
        class="label-input"
        autofocus
        @keydown.enter="commit(false)"
        @keydown.esc="commit(true)"
        @blur="commit(false)"
        @click.stop
      />
      <button v-else class="label-button" :title="item.label" @dblclick.stop="startEdit">{{ item.label }}</button>
      <div class="file-path" :title="item.path">{{ item.path }}</div>
    </div>

    <div v-if="selected" class="crop-actions" @click.stop @dblclick.stop>
      <button class="mini-button" @click="emit('open-editor')"><Scissors :size="13" />打开裁剪</button>
      <span v-if="cropActive" class="crop-badge">已裁剪</span>
      <button v-if="cropActive" class="mini-button" @click="emit('reset-crop')"><X :size="13" />清除</button>
    </div>
  </article>
</template>

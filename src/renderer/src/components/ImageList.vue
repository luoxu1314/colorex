<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import Sortable from 'sortablejs'
import ImageCard from './ImageCard.vue'
import { useImageStore } from '../stores/imageStore'
import { ArrowDown, ArrowUp, FilePlus2, Tags, Trash2, XCircle } from 'lucide-vue-next'

const props = defineProps<{
  renameSignal?: number
}>()

const emit = defineEmits<{
  add: []
  'open-editor': []
  log: [message: string]
}>()

const imageStore = useImageStore()
const listEl = ref<HTMLElement | null>(null)
let sortable: Sortable | null = null

onMounted(() => {
  if (!listEl.value) return
  sortable = Sortable.create(listEl.value, {
    animation: 140,
    handle: '.drag-handle',
    ghostClass: 'drag-ghost',
    onEnd: async () => {
      await nextTick()
      const ids = Array.from(listEl.value?.querySelectorAll<HTMLElement>('[data-id]') ?? []).map(
        (el) => el.dataset.id || ''
      )
      imageStore.reorder(ids)
      emit('log', `已按拖拽顺序重新排序，共 ${imageStore.items.length} 张图像。`)
    }
  })
})

onBeforeUnmount(() => {
  sortable?.destroy()
  sortable = null
})
</script>

<template>
  <div class="panel fill image-panel">
    <div class="panel-heading">
      <div>
        <div class="panel-title">图像文件</div>
        <div class="panel-caption">{{ imageStore.items.length }} 张 · 拖拽排序 / 双击裁剪</div>
      </div>
    </div>

    <button class="primary add-button" title="添加图像（Ctrl+O）" @click="emit('add')">
      <FilePlus2 :size="18" />
      <span>添加图像</span>
    </button>

    <div class="tool-grid five">
      <button
        class="tool-button icon-only"
        :disabled="!imageStore.selectedId"
        title="上移选中（↑）"
        @click="imageStore.moveSelected(-1)"
      >
        <ArrowUp :size="15" />
      </button>
      <button
        class="tool-button icon-only"
        :disabled="!imageStore.selectedId"
        title="下移选中（↓）"
        @click="imageStore.moveSelected(1)"
      >
        <ArrowDown :size="15" />
      </button>
      <button
        class="tool-button icon-only"
        :disabled="!imageStore.items.length"
        title="自动重置标签"
        @click="imageStore.autoLabels()"
      >
        <Tags :size="15" />
      </button>
      <button
        class="tool-button icon-only danger-hover"
        :disabled="!imageStore.selectedId"
        title="删除选中（Delete）"
        @click="imageStore.removeSelected()"
      >
        <Trash2 :size="15" />
      </button>
      <button
        class="tool-button icon-only danger-hover"
        :disabled="!imageStore.items.length"
        title="清空全部"
        @click="imageStore.clear()"
      >
        <XCircle :size="15" />
      </button>
    </div>

    <div ref="listEl" class="image-list">
      <ImageCard
        v-for="item in imageStore.items"
        :key="item.id"
        :data-id="item.id"
        :item="item"
        :selected="item.id === imageStore.selectedId"
        :rename-tick="props.renameSignal"
        @select="imageStore.select(item.id)"
        @edit-label="imageStore.updateLabel(item.id, $event)"
        @reset-crop="imageStore.resetCrop(item.id)"
        @open-editor="emit('open-editor')"
      />
      <div v-if="!imageStore.items.length" class="empty-state image-empty">
        <FilePlus2 :size="22" />
        <div class="empty-title">尚未添加图像</div>
        <div class="empty-caption">支持 png / jpg / tif / bmp，多选即可</div>
      </div>
    </div>
  </div>
</template>

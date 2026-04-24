<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'
import Sortable from 'sortablejs'
import ImageCard from './ImageCard.vue'
import { useImageStore } from '../stores/imageStore'
import { ArrowDown, ArrowUp, FilePlus2, RotateCcw, Tags, Trash2 } from 'lucide-vue-next'

const emit = defineEmits<{
  add: []
  'open-editor': []
  log: [message: string]
}>()

const imageStore = useImageStore()
const listEl = ref<HTMLElement | null>(null)

onMounted(() => {
  if (!listEl.value) return
  Sortable.create(listEl.value, {
    animation: 140,
    handle: '.drag-handle',
    ghostClass: 'drag-ghost',
    onEnd: async () => {
      await nextTick()
      const ids = Array.from(listEl.value?.querySelectorAll<HTMLElement>('[data-id]') ?? []).map((el) => el.dataset.id || '')
      imageStore.reorder(ids)
      emit('log', `已按拖拽顺序重新排序，共 ${imageStore.items.length} 张图像。`)
    }
  })
})
</script>

<template>
  <div class="panel fill">
    <div class="panel-heading">
      <div>
        <div class="panel-title">图像文件</div>
        <div class="panel-caption">{{ imageStore.items.length }} 张图像</div>
      </div>
      <button class="icon-button primary-soft" title="添加图片" @click="emit('add')">
        <FilePlus2 :size="18" />
      </button>
    </div>
    <div class="tool-grid">
      <button class="tool-button" :disabled="!imageStore.selectedId" @click="imageStore.removeSelected()">
        <Trash2 :size="15" />
        <span>移除</span>
      </button>
      <button class="tool-button" :disabled="!imageStore.items.length" @click="imageStore.clear()">
        <RotateCcw :size="15" />
        <span>清空</span>
      </button>
      <button class="tool-button" :disabled="!imageStore.items.length" @click="imageStore.autoLabels()">
        <Tags :size="15" />
        <span>自动标签</span>
      </button>
      <button class="tool-button" :disabled="!imageStore.selectedId" @click="imageStore.moveSelected(-1)">
        <ArrowUp :size="15" />
        <span>上移</span>
      </button>
      <button class="tool-button" :disabled="!imageStore.selectedId" @click="imageStore.moveSelected(1)">
        <ArrowDown :size="15" />
        <span>下移</span>
      </button>
    </div>

    <div ref="listEl" class="image-list">
      <ImageCard
        v-for="item in imageStore.items"
        :key="item.id"
        :data-id="item.id"
        :item="item"
        :selected="item.id === imageStore.selectedId"
        @select="imageStore.select(item.id)"
        @edit-label="imageStore.updateLabel(item.id, $event)"
        @reset-crop="imageStore.resetCrop(item.id)"
        @open-editor="emit('open-editor')"
      />
      <div v-if="!imageStore.items.length" class="empty-state">添加图片后在这里拖拽排序</div>
    </div>
  </div>
</template>

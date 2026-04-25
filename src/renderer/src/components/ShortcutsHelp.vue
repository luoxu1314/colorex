<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { X } from 'lucide-vue-next'
import { useUiStore } from '../stores/uiStore'

const ui = useUiStore()

// The "command" modifier is rendered as "⌘" on macOS and "Ctrl" elsewhere so
// shortcuts feel native. This is a presentational check only — the actual
// handlers accept both metaKey and ctrlKey.
const isMac =
  typeof navigator !== 'undefined' &&
  /(Mac|iPhone|iPad|iPod)/i.test(navigator.platform ?? '')

const mod = computed(() => (isMac ? '⌘' : 'Ctrl'))

interface Shortcut {
  keys: string[]
  label: string
}

const groups = computed<{ title: string; items: Shortcut[] }[]>(() => [
  {
    title: '主操作',
    items: [
      { keys: [mod.value, 'O'], label: '添加图像' },
      { keys: [mod.value, 'Enter'], label: '生成预览' },
      { keys: [mod.value, 'S'], label: '导出图片' },
      { keys: [mod.value, 'K'], label: '打开命令面板' },
    ],
  },
  {
    title: '编辑',
    items: [
      { keys: ['F2'], label: '重命名选中图像' },
      { keys: ['Del', '⇐'], label: '移除选中图像' },
    ],
  },
  {
    title: '界面',
    items: [
      { keys: ['?'], label: '显示快捷键帮助' },
      { keys: [mod.value, '/'], label: '切换主题' },
      { keys: ['Esc'], label: '关闭当前对话框' },
    ],
  },
])

function onKey(event: KeyboardEvent): void {
  if (!ui.shortcutsOpen) return
  if (event.key === 'Escape') {
    event.preventDefault()
    ui.closeShortcuts()
  }
}

onMounted(() => window.addEventListener('keydown', onKey, true))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey, true))
</script>

<template>
  <Transition name="shortcuts">
    <div
      v-if="ui.shortcutsOpen"
      class="shortcuts-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="键盘快捷键"
      @mousedown.self="ui.closeShortcuts()"
    >
      <div class="shortcuts-panel">
        <div class="shortcuts-head">
          <span class="shortcuts-title">键盘快捷键</span>
          <button
            type="button"
            class="ghost-button"
            aria-label="关闭"
            @click="ui.closeShortcuts()"
          >
            <X :size="15" />
          </button>
        </div>
        <div class="shortcuts-body">
          <section v-for="g in groups" :key="g.title">
            <div class="shortcuts-group-title">{{ g.title }}</div>
            <div class="shortcuts-list">
              <div v-for="s in g.items" :key="s.label" class="shortcut-row">
                <span class="shortcut-label">{{ s.label }}</span>
                <span class="shortcut-keys">
                  <kbd v-for="k in s.keys" :key="k">{{ k }}</kbd>
                </span>
              </div>
            </div>
          </section>
        </div>
        <div class="shortcuts-foot">
          按 <kbd class="cmdk-kbd">?</kbd> 再次显示 · 按
          <kbd class="cmdk-kbd">Esc</kbd> 关闭
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Search } from 'lucide-vue-next'
import { useUiStore } from '../stores/uiStore'
import type { CommandItem } from '../types/command'

const props = defineProps<{
  commands: CommandItem[]
}>()

const ui = useUiStore()
const query = ref('')
const activeIdx = ref(0)
const inputEl = ref<HTMLInputElement | null>(null)

interface ScoredCommand {
  cmd: CommandItem
  score: number
}

function matches(cmd: CommandItem, q: string): number {
  if (!q) return 1
  const hay = (
    cmd.title +
    ' ' +
    (cmd.hint ?? '') +
    ' ' +
    (cmd.group ?? '') +
    ' ' +
    (cmd.keywords ?? '')
  ).toLowerCase()
  const needle = q.toLowerCase().trim()
  if (!needle) return 1
  if (hay.includes(needle)) return 1
  let hi = 0
  for (const ch of needle) {
    const idx = hay.indexOf(ch, hi)
    if (idx < 0) return 0
    hi = idx + 1
  }
  // Subsequence hit — ranked lower than substring.
  return 0.6
}

const filtered = computed<CommandItem[]>(() => {
  const q = query.value.trim()
  const scored: ScoredCommand[] = []
  for (const cmd of props.commands) {
    const s = matches(cmd, q)
    if (s <= 0) continue
    scored.push({ cmd, score: s })
  }
  scored.sort((a, b) => b.score - a.score)
  return scored.map((x) => x.cmd)
})

const grouped = computed(() => {
  const out: Array<{ group: string; items: CommandItem[] }> = []
  const order: string[] = []
  const by: Record<string, CommandItem[]> = {}
  for (const cmd of filtered.value) {
    if (!by[cmd.group]) {
      by[cmd.group] = []
      order.push(cmd.group)
    }
    by[cmd.group].push(cmd)
  }
  for (const g of order) out.push({ group: g, items: by[g] })
  return out
})

const flatList = computed(() => filtered.value)

watch(filtered, () => {
  activeIdx.value = 0
})

watch(
  () => ui.commandPaletteOpen,
  async (open) => {
    if (open) {
      query.value = ''
      activeIdx.value = 0
      await nextTick()
      inputEl.value?.focus()
    }
  },
)

function runActive(): void {
  const cmd = flatList.value[activeIdx.value]
  if (!cmd || cmd.disabled) return
  ui.closeCommandPalette()
  Promise.resolve(cmd.run()).catch(() => {
    // Errors should already be surfaced by the command; swallow here to keep
    // the palette responsive.
  })
}

function move(delta: number): void {
  const n = flatList.value.length
  if (!n) return
  activeIdx.value = (activeIdx.value + delta + n) % n
  nextTick(() => {
    const el = document.querySelector<HTMLElement>('.cmdk-item.active')
    el?.scrollIntoView({ block: 'nearest' })
  })
}

function onKey(event: KeyboardEvent): void {
  if (!ui.commandPaletteOpen) return
  if (event.key === 'Escape') {
    event.preventDefault()
    ui.closeCommandPalette()
    return
  }
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    move(1)
    return
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault()
    move(-1)
    return
  }
  if (event.key === 'Enter') {
    event.preventDefault()
    runActive()
  }
}

function indexOfCmd(cmd: CommandItem): number {
  return flatList.value.indexOf(cmd)
}

function onItemClick(cmd: CommandItem): void {
  const idx = indexOfCmd(cmd)
  if (idx < 0) return
  activeIdx.value = idx
  runActive()
}

onMounted(() => {
  window.addEventListener('keydown', onKey, true)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey, true)
})
</script>

<template>
  <Transition name="cmdk">
    <div
      v-if="ui.commandPaletteOpen"
      class="cmdk-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      @mousedown.self="ui.closeCommandPalette()"
    >
      <div class="cmdk-panel">
        <div class="cmdk-input-wrap">
          <Search :size="16" />
          <input
            ref="inputEl"
            v-model="query"
            class="cmdk-input"
            type="text"
            placeholder="输入命令或搜索… (Esc 关闭)"
            spellcheck="false"
            autocomplete="off"
          />
          <span class="cmdk-kbd">Esc</span>
        </div>
        <div class="cmdk-list">
          <template v-if="flatList.length === 0">
            <div class="cmdk-empty">没有匹配的命令</div>
          </template>
          <template v-else>
            <template v-for="group in grouped" :key="group.group">
              <div class="cmdk-group-label">{{ group.group }}</div>
              <div
                v-for="cmd in group.items"
                :key="cmd.id"
                class="cmdk-item"
                :class="{
                  active: indexOfCmd(cmd) === activeIdx,
                  disabled: cmd.disabled,
                }"
                @mouseenter="activeIdx = indexOfCmd(cmd)"
                @click="onItemClick(cmd)"
              >
                <span class="cmdk-icon"><component :is="cmd.icon" :size="14" /></span>
                <div class="cmdk-body">
                  <div class="cmdk-title">{{ cmd.title }}</div>
                  <div v-if="cmd.hint" class="cmdk-hint">{{ cmd.hint }}</div>
                </div>
                <span v-if="cmd.shortcut" class="cmdk-shortcut">{{ cmd.shortcut }}</span>
              </div>
            </template>
          </template>
        </div>
        <div class="cmdk-footer">
          <div class="cmdk-footer-group">
            <kbd>↑</kbd><kbd>↓</kbd><span>选择</span>
          </div>
          <div class="cmdk-footer-group">
            <kbd>Enter</kbd><span>执行</span>
          </div>
          <div class="cmdk-footer-group">
            <kbd>Esc</kbd><span>关闭</span>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

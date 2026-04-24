<script setup lang="ts">
import { computed } from 'vue'
import { Trash2 } from 'lucide-vue-next'
import type { LogEntry } from '../types/log'

const props = defineProps<{ logs: LogEntry[] }>()
defineEmits<{ clear: [] }>()

const rendered = computed(() =>
  props.logs.map((log) => ({
    ...log,
    prefix: levelPrefix(log.level)
  }))
)

function levelPrefix(level: LogEntry['level']): string {
  switch (level) {
    case 'error':
      return '✕'
    case 'warn':
      return '!'
    case 'success':
      return '✓'
    default:
      return '›'
  }
}
</script>

<template>
  <section class="status-log">
    <header class="status-log-head">
      <span>运行日志</span>
      <button v-if="logs.length" class="ghost-button" title="清空日志" @click="$emit('clear')">
        <Trash2 :size="13" />
      </button>
    </header>
    <div class="status-log-body">
      <div
        v-for="entry in rendered"
        :key="entry.id"
        class="log-line"
        :class="`level-${entry.level}`"
      >
        <span class="log-time">{{ entry.time }}</span>
        <span class="log-prefix">{{ entry.prefix }}</span>
        <span class="log-text">{{ entry.message }}</span>
      </div>
      <div v-if="!logs.length" class="log-empty">暂无日志</div>
    </div>
  </section>
</template>

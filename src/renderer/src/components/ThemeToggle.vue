<script setup lang="ts">
import { computed } from 'vue'
import { Moon, Sun } from 'lucide-vue-next'
import { useUiStore } from '../stores/uiStore'

const ui = useUiStore()

const label = computed(() =>
  ui.theme === 'dark' ? '切换到明亮模式' : '切换到黑暗模式',
)
</script>

<template>
  <button
    type="button"
    class="theme-toggle"
    :title="label"
    :aria-label="label"
    @click="ui.toggleTheme()"
  >
    <span class="theme-toggle-track" aria-hidden="true">
      <Sun :size="13" />
      <Moon :size="13" />
    </span>
    <span class="theme-toggle-thumb" aria-hidden="true">
      <Sun v-if="ui.theme === 'light'" :size="13" />
      <Moon v-else :size="13" />
    </span>
  </button>
</template>

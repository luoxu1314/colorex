<script setup lang="ts">
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-vue-next'
import { useUiStore, type Toast } from '../stores/uiStore'

const ui = useUiStore()

function iconFor(level: Toast['level']) {
  switch (level) {
    case 'success':
      return CheckCircle2
    case 'warn':
      return AlertTriangle
    case 'error':
      return XCircle
    default:
      return Info
  }
}
</script>

<template>
  <div class="toast-container" aria-live="polite" aria-atomic="false">
    <TransitionGroup name="toast" tag="div" class="toast-container">
      <div
        v-for="t in ui.toasts"
        :key="t.id"
        class="toast"
        :class="['level-' + t.level]"
        role="status"
      >
        <span class="toast-icon">
          <component :is="iconFor(t.level)" :size="14" />
        </span>
        <div class="toast-body">
          <div v-if="t.title" class="toast-title">{{ t.title }}</div>
          <div class="toast-message">{{ t.message }}</div>
        </div>
        <button
          type="button"
          class="toast-close"
          aria-label="关闭提示"
          @click="ui.dismissToast(t.id)"
        >
          <X :size="13" />
        </button>
        <div
          v-if="t.duration > 0"
          class="toast-progress"
          :style="{ '--toast-duration': t.duration + 'ms' }"
          aria-hidden="true"
        ></div>
      </div>
    </TransitionGroup>
  </div>
</template>

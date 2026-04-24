<script setup lang="ts">
import { computed } from 'vue'
import { FolderOpen, FolderSearch } from 'lucide-vue-next'
import { useSettingsStore } from '../stores/settingsStore'
import type { OutputFormat } from '../types/settings'

const emit = defineEmits<{
  'choose-output': []
  'reveal-output-dir': []
}>()
const settings = useSettingsStore()

const outputLeaf = computed(() => {
  const normalized = (settings.outputPath || '').replace(/\\/g, '/')
  return normalized.split('/').pop() || ''
})

function changeFormat(event: Event) {
  const next = (event.target as HTMLSelectElement).value as OutputFormat
  settings.outputFormat = next
  const current = settings.outputPath || ''
  if (!current) return
  const dot = current.lastIndexOf('.')
  const slash = Math.max(current.lastIndexOf('/'), current.lastIndexOf('\\'))
  if (dot > slash) {
    settings.outputPath = current.slice(0, dot + 1) + next
  } else if (current) {
    settings.outputPath = `${current}.${next}`
  }
}
</script>

<template>
  <div class="panel">
    <div class="panel-heading">
      <div>
        <div class="panel-title">导出</div>
        <div class="panel-caption">输出路径 · 格式 · 色条</div>
      </div>
    </div>

    <section class="settings-group primary-group">
      <div class="group-title">输出文件</div>
      <div class="output-stack">
        <label class="field output-field">
          <span>输出路径</span>
          <div class="path-picker">
            <input
              v-model="settings.outputPath"
              type="text"
              :title="settings.outputPath"
              :placeholder="outputLeaf || 'colorexchange_output.png'"
            />
            <button
              class="icon-button"
              title="选择输出路径 (另存为…)"
              @click="emit('choose-output')"
            >
              <FolderOpen :size="15" />
            </button>
            <button
              class="icon-button ghost"
              title="打开输出所在文件夹"
              :disabled="!settings.outputPath"
              @click="emit('reveal-output-dir')"
            >
              <FolderSearch :size="15" />
            </button>
          </div>
        </label>
        <div class="grid2 tight">
          <label class="field">
            <span>格式</span>
            <select :value="settings.outputFormat" @change="changeFormat">
              <option>png</option>
              <option>tif</option>
              <option>jpg</option>
              <option>pdf</option>
            </select>
          </label>
          <label class="field">
            <span>DPI</span>
            <input v-model.number="settings.dpi" type="number" min="72" max="1200" />
          </label>
        </div>
      </div>
    </section>

    <section class="settings-group primary-group">
      <div class="group-title">色条标签</div>
      <label class="field">
        <input
          v-model="settings.colorbarLabel"
          type="text"
          placeholder="如 Pixel intensity / 归一化亮度"
          :disabled="!settings.showColorbar"
        />
      </label>
    </section>

    <details class="settings-group collapsible">
      <summary>
        <span class="group-title">色条样式</span>
        <span class="summary-hint">{{ settings.showColorbar ? '已启用' : '已关闭' }}</span>
      </summary>
      <label class="check">
        <input v-model="settings.showColorbar" type="checkbox" />显示色条
      </label>
      <div class="field wide">
        <span>字号模式</span>
        <div class="segmented compact">
          <button
            :class="{ active: settings.colorbarAutoFont }"
            :disabled="!settings.showColorbar"
            @click="settings.colorbarAutoFont = true"
          >
            自适应
          </button>
          <button
            :class="{ active: !settings.colorbarAutoFont }"
            :disabled="!settings.showColorbar"
            @click="settings.colorbarAutoFont = false"
          >
            自定义
          </button>
        </div>
      </div>
      <div class="grid2 tight">
        <label class="field">
          <span>自定义字号 pt</span>
          <input
            v-model.number="settings.colorbarFontSize"
            type="number"
            min="6"
            max="96"
            :disabled="!settings.showColorbar"
            @focus="settings.colorbarAutoFont = false"
            @input="settings.colorbarAutoFont = false"
          />
        </label>
        <label class="field">
          <span>色条区宽度</span>
          <input
            v-model.number="settings.colorbarReserveRatio"
            type="number"
            min="0.05"
            max="0.4"
            step="0.01"
            :disabled="!settings.showColorbar"
          />
        </label>
        <label class="field">
          <span>色条宽度</span>
          <input
            v-model.number="settings.colorbarWidth"
            type="number"
            min="0.005"
            max="0.15"
            step="0.005"
            :disabled="!settings.showColorbar"
          />
        </label>
      </div>
    </details>

    <details class="settings-group collapsible">
      <summary>
        <span class="group-title">高级</span>
        <span class="summary-hint">预览像素 · 透明背景</span>
      </summary>
      <div class="grid2 tight">
        <label class="check">
          <input v-model="settings.transparentBackground" type="checkbox" />透明背景
        </label>
        <label class="field">
          <span>预览像素上限</span>
          <input
            v-model.number="settings.previewMaxPixels"
            type="number"
            min="600"
            max="4000"
            step="100"
            title="仅影响屏幕预览渲染尺寸，不影响最终导出"
          />
        </label>
      </div>
    </details>
  </div>
</template>

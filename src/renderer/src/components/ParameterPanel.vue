<script setup lang="ts">
import { useSettingsStore } from '../stores/settingsStore'
import type { NormalizeMode } from '../types/settings'
import { RotateCcw } from 'lucide-vue-next'

const settings = useSettingsStore()

const cmaps = [
  'jet',
  'parula',
  'hot',
  'turbo',
  'hsv',
  'cool',
  'spring',
  'summer',
  'autumn',
  'winter',
  'bone',
  'copper',
  'pink',
  'gray',
  'viridis',
  'plasma',
  'inferno',
  'magma'
]
const fonts = [
  'Times New Roman',
  'Arial',
  'Helvetica',
  'Calibri',
  'Microsoft YaHei',
  'PingFang SC',
  'Noto Sans CJK SC',
  'SimHei',
  'SimSun'
]

const normalizeOptions: { value: NormalizeMode; label: string; hint: string }[] = [
  { value: 'absolute', label: '绝对亮度', hint: '保留原始像素值（常用于荧光、强度图）' },
  { value: 'perImage', label: '每图归一化', hint: '每张独立 min-max，拉伸到 0–1' },
  { value: 'percentile', label: '分位数', hint: '1% – 99.5% 分位拉伸' }
]
</script>

<template>
  <div class="panel">
    <div class="panel-heading">
      <div>
        <div class="panel-title">处理参数</div>
        <div class="panel-caption">亮度映射 · 布局</div>
      </div>
      <button class="icon-button ghost" title="恢复默认" @click="settings.resetAll()">
        <RotateCcw :size="15" />
      </button>
    </div>

    <section class="settings-group primary-group">
      <div class="group-title">亮度模式</div>
      <div class="segmented" role="tablist">
        <button
          v-for="opt in normalizeOptions"
          :key="opt.value"
          role="tab"
          :class="{ active: settings.normalizeMode === opt.value }"
          :title="opt.hint"
          @click="settings.setNormalizeMode(opt.value)"
        >
          {{ opt.label }}
        </button>
      </div>
    </section>

    <section class="settings-group primary-group">
      <div class="group-title">布局</div>
      <div class="grid2 tight">
        <label class="field">
          <span>列数</span>
          <input v-model.number="settings.columns" type="number" min="1" max="10" />
        </label>
        <label class="field">
          <span>色图</span>
          <select v-model="settings.colormap">
            <option v-for="cmap in cmaps" :key="cmap">{{ cmap }}</option>
          </select>
        </label>
      </div>
    </section>

    <details class="settings-group collapsible">
      <summary>
        <span class="group-title">CLim 范围</span>
        <span class="summary-hint">{{ settings.climMin }} – {{ settings.climMax }}</span>
      </summary>
      <div class="grid2 tight">
        <label class="field">
          <span>最小</span>
          <input v-model.number="settings.climMin" type="number" step="0.01" />
        </label>
        <label class="field">
          <span>最大</span>
          <input v-model.number="settings.climMax" type="number" step="0.01" />
        </label>
      </div>
    </details>

    <details class="settings-group collapsible">
      <summary>
        <span class="group-title">预处理</span>
        <span class="summary-hint">黑电平 · 阈值</span>
      </summary>
      <div class="grid2 tight">
        <label class="check">
          <input v-model="settings.blackLevelEnabled" type="checkbox" />黑电平校正
        </label>
        <label class="field">
          <span>分位 %</span>
          <input
            v-model.number="settings.blackLevelPercentile"
            type="number"
            min="0"
            max="50"
            step="0.1"
            :disabled="!settings.blackLevelEnabled"
          />
        </label>
        <label class="check">
          <input v-model="settings.thresholdEnabled" type="checkbox" />阈值处理
        </label>
        <label class="field">
          <span>阈值 (≤ 置零)</span>
          <input
            v-model.number="settings.threshold"
            type="number"
            min="0"
            :disabled="!settings.thresholdEnabled"
          />
        </label>
      </div>
    </details>

    <details class="settings-group collapsible">
      <summary>
        <span class="group-title">标签样式</span>
        <span class="summary-hint">
          {{ settings.labelAutoFont ? '自适应字号' : `${settings.labelFontSize} pt` }}
        </span>
      </summary>
      <div class="field wide">
        <span>字号模式</span>
        <div class="segmented compact">
          <button
            :class="{ active: settings.labelAutoFont }"
            title="根据格子尺寸和标签长度自动计算"
            @click="settings.labelAutoFont = true"
          >
            自适应
          </button>
          <button
            :class="{ active: !settings.labelAutoFont }"
            title="使用下方自定义字号"
            @click="settings.labelAutoFont = false"
          >
            自定义
          </button>
        </div>
      </div>
      <div class="grid2 tight">
        <label class="field">
          <span>自定义字号 pt</span>
          <input
            v-model.number="settings.labelFontSize"
            type="number"
            min="6"
            max="120"
            @focus="settings.labelAutoFont = false"
            @input="settings.labelAutoFont = false"
          />
        </label>
        <label class="check">
          <input v-model="settings.labelBold" type="checkbox" />加粗
        </label>
        <label class="field">
          <span>颜色</span>
          <input v-model="settings.labelColor" type="color" />
        </label>
        <label class="field wide">
          <span>字体</span>
          <select v-model="settings.labelFontFamily">
            <option v-for="font in fonts" :key="font">{{ font }}</option>
          </select>
        </label>
      </div>
    </details>

    <details class="settings-group collapsible">
      <summary>
        <span class="group-title">背景与分隔线</span>
        <span class="summary-hint">行/列分隔 · 底色</span>
      </summary>
      <div class="grid2 tight">
        <label class="field wide">
          <span>背景</span>
          <select v-model="settings.backgroundMode">
            <option value="colormap">跟随色图低端</option>
            <option value="black">黑色</option>
            <option value="transparent">透明</option>
          </select>
        </label>
        <label class="check">
          <input v-model="settings.showRowSeparators" type="checkbox" />行分隔线
        </label>
        <label class="check">
          <input v-model="settings.showColumnSeparators" type="checkbox" />列分隔线
        </label>
        <label class="field">
          <span>颜色</span>
          <input v-model="settings.separatorColor" type="color" />
        </label>
        <label class="field">
          <span>粗细 pt</span>
          <input
            v-model.number="settings.separatorLineWidth"
            type="number"
            min="0.1"
            max="6"
            step="0.1"
          />
        </label>
      </div>
    </details>
  </div>
</template>

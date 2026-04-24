<script setup lang="ts">
import { useSettingsStore } from '../stores/settingsStore'

const settings = useSettingsStore()

const cmaps = ['jet', 'parula', 'hot', 'turbo', 'hsv', 'cool', 'spring', 'summer', 'autumn', 'winter', 'bone', 'copper', 'pink', 'gray', 'viridis', 'plasma', 'inferno', 'magma']
const fonts = ['Times New Roman', 'Arial', 'Helvetica', 'Calibri', 'SimHei', 'SimSun']
</script>

<template>
  <div class="panel">
    <div class="panel-heading">
      <div>
        <div class="panel-title">处理参数</div>
        <div class="panel-caption">预处理、映射和布局</div>
      </div>
    </div>

    <section class="settings-group">
      <div class="group-title">强度映射</div>
      <label class="field wide">
        <span>归一化方式</span>
        <select v-model="settings.normalizeMode">
          <option value="absolute">绝对像素值</option>
          <option value="perImage">每张图 0-1</option>
          <option value="percentile">分位数 1%-99.5%</option>
        </select>
      </label>

      <div class="grid2">
        <label class="check"><input v-model="settings.blackLevelEnabled" type="checkbox" />黑电平校正</label>
        <label class="check"><input v-model="settings.thresholdEnabled" type="checkbox" />阈值处理</label>
        <label class="field"><span>阈值</span><input v-model.number="settings.threshold" type="number" min="0" /></label>
        <label class="field"><span>黑电平分位%</span><input v-model.number="settings.blackLevelPercentile" type="number" min="0" max="50" step="0.1" /></label>
        <label class="field"><span>CLim 最小</span><input v-model.number="settings.climMin" type="number" /></label>
        <label class="field"><span>CLim 最大</span><input v-model.number="settings.climMax" type="number" /></label>
      </div>
    </section>

    <div class="preset-row">
      <button @click="settings.applyAbsolutePreset()">绝对亮度模式</button>
      <button @click="settings.applyNormalizedPreset()">归一化模式</button>
    </div>

    <section class="settings-group">
      <div class="group-title">色图与拼图</div>
      <div class="grid2">
        <label class="field"><span>色图</span><select v-model="settings.colormap"><option v-for="cmap in cmaps" :key="cmap">{{ cmap }}</option></select></label>
        <label class="field"><span>列数</span><input v-model.number="settings.columns" type="number" min="1" max="10" /></label>
      </div>
    </section>

    <section class="settings-group">
      <div class="group-title">标签与分隔线</div>
      <div class="grid2">
        <label class="check"><input v-model="settings.labelAutoFont" type="checkbox" />字号自适应</label>
        <label class="check"><input v-model="settings.labelBold" type="checkbox" />标签加粗</label>
        <label class="field"><span>标签字号</span><input v-model.number="settings.labelFontSize" :disabled="settings.labelAutoFont" type="number" min="6" max="72" /></label>
        <label class="field"><span>标签颜色</span><input v-model="settings.labelColor" type="color" /></label>
        <label class="field wide"><span>字体</span><select v-model="settings.labelFontFamily"><option v-for="font in fonts" :key="font">{{ font }}</option></select></label>
        <label class="check"><input v-model="settings.showRowSeparators" type="checkbox" />行分隔线</label>
        <label class="check"><input v-model="settings.showColumnSeparators" type="checkbox" />列分隔线</label>
      </div>
    </section>
  </div>
</template>

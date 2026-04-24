<script setup lang="ts">
import { useSettingsStore } from '../stores/settingsStore'

defineEmits<{ 'choose-output': [] }>()
const settings = useSettingsStore()
</script>

<template>
  <div class="panel">
    <div class="panel-heading">
      <div>
        <div class="panel-title">色条与导出</div>
        <div class="panel-caption">论文/PPT 输出设置</div>
      </div>
    </div>
    <section class="settings-group">
      <div class="group-title">色条</div>
      <div class="grid2">
        <label class="check"><input v-model="settings.showColorbar" type="checkbox" />显示色条</label>
        <label class="check"><input v-model="settings.colorbarAutoFont" type="checkbox" />字号自适应</label>
        <label class="field"><span>色条字号</span><input v-model.number="settings.colorbarFontSize" :disabled="settings.colorbarAutoFont" type="number" min="6" max="48" /></label>
        <label class="field"><span>色条区宽度</span><input v-model.number="settings.colorbarReserveRatio" type="number" min="0.05" max="0.4" step="0.01" /></label>
        <label class="field wide"><span>色条标签</span><input v-model="settings.colorbarLabel" type="text" /></label>
      </div>
    </section>

    <section class="settings-group">
      <div class="group-title">文件</div>
      <div class="grid2">
        <label class="check"><input v-model="settings.transparentBackground" type="checkbox" />透明背景</label>
        <label class="field"><span>DPI</span><input v-model.number="settings.dpi" type="number" min="72" max="1200" /></label>
        <label class="field"><span>格式</span><select v-model="settings.outputFormat"><option>png</option><option>tif</option><option>jpg</option><option>pdf</option></select></label>
        <label class="field wide">
          <span>背景</span>
          <select v-model="settings.backgroundMode">
            <option value="colormap">跟随色图低端</option>
            <option value="black">黑色</option>
            <option value="transparent">透明</option>
          </select>
        </label>
      </div>
      <label class="field wide output-field">
        <span>输出文件</span>
        <div class="path-picker">
          <input v-model="settings.outputPath" type="text" />
          <button class="icon-button" title="选择输出路径" @click="$emit('choose-output')">...</button>
        </div>
      </label>
    </section>
  </div>
</template>

<template>
  <div class="generation-options-bar">
    <button class="mode-trigger" type="button">
      <el-icon><Connection /></el-icon>
      <span>参考生成</span>
    </button>

    <el-popover
      trigger="click"
      placement="bottom-start"
      width="497"
      :teleported="false"
      popper-class="generation-options-popover"
    >
      <template #reference>
        <button class="parameter-trigger" type="button" data-testid="generation-options-trigger">
          <el-icon><Operation /></el-icon>
          <span>{{ ratioLabel }}</span>
          <span>{{ resolutionLabel }}</span>
          <span>{{ config.duration }}秒</span>
          <span>{{ config.count }}条</span>
          <span>{{ config.generateAudio ? '有声' : '无声' }}</span>
        </button>
      </template>

      <div class="generation-options-form" aria-label="生成参数">
        <label>
          <span>比例</span>
          <select data-testid="ratio-select" :value="config.ratio" @change="update('ratio', $event.target.value)">
            <option v-for="option in ratioOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </label>
        <label>
          <span>清晰度</span>
          <select data-testid="resolution-select" :value="config.resolution" @change="update('resolution', $event.target.value)">
            <option v-for="resolution in ARK_RESOLUTIONS" :key="resolution" :value="resolution">
              {{ resolution.toUpperCase() }}
            </option>
          </select>
        </label>
        <label>
          <span>时长</span>
          <select data-testid="duration-select" :value="config.duration" @change="update('duration', Number($event.target.value))">
            <option v-for="duration in durationOptions" :key="duration" :value="duration">{{ duration }}秒</option>
          </select>
        </label>
        <label>
          <span>条数</span>
          <select data-testid="count-select" :value="config.count" @change="update('count', Number($event.target.value))">
            <option v-for="count in [1, 2, 3, 4]" :key="count" :value="count">{{ count }}条</option>
          </select>
        </label>
        <label>
          <span>声音</span>
          <select data-testid="audio-select" :value="String(config.generateAudio)" @change="update('generateAudio', $event.target.value === 'true')">
            <option value="true">有声</option>
            <option value="false">无声</option>
          </select>
        </label>
        <details class="generation-advanced-options">
          <summary>高级选项</summary>
          <label><input type="checkbox" :checked="config.returnLastFrame" @change="update('returnLastFrame', $event.target.checked)">返回尾帧</label>
          <label><input type="checkbox" :checked="config.watermark" @change="update('watermark', $event.target.checked)">AI 水印</label>
          <label>任务超时<input data-testid="expires-input" type="number" min="3600" max="259200" :value="config.executionExpiresAfter" @change="update('executionExpiresAfter', Number($event.target.value))"></label>
          <label>优先级<input data-testid="priority-input" type="number" min="0" max="9" :value="config.priority" @change="update('priority', Number($event.target.value))"></label>
        </details>
      </div>
    </el-popover>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { Connection, Operation } from '@element-plus/icons-vue'
import { ARK_RATIOS, ARK_RESOLUTIONS } from '../domain/arkVideoContract.js'

const props = defineProps({
  config: { type: Object, required: true },
})

const emit = defineEmits(['update'])

const ratioOptions = ARK_RATIOS.map((value) => ({
  value,
  label: value === 'adaptive' ? '智能比例' : value,
}))
const durationOptions = [-1, ...Array.from({ length: 12 }, (_, index) => index + 4)]

const ratioLabel = computed(() => (
  ratioOptions.find((item) => item.value === props.config.ratio)?.label || '智能比例'
))
const resolutionLabel = computed(() => props.config.resolution.toUpperCase())

function update(key, value) {
  emit('update', { [key]: value })
}
</script>

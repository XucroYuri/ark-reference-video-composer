<template>
  <el-drawer
    v-model="visible"
    title="Dry-run 预览"
    size="520px"
    :append-to-body="false"
    class="request-preview-drawer"
  >
    <div v-if="result" class="request-preview">
      <section>
        <h2>可读提示词</h2>
        <pre>{{ serialization.readablePrompt || '（空）' }}</pre>
      </section>
      <section>
        <h2>控制台兼容模板</h2>
        <pre>{{ serialization.templatePrompt || '（空）' }}</pre>
      </section>
      <section>
        <h2>模型规范文本</h2>
        <pre>{{ serialization.modelPrompt || '（空）' }}</pre>
      </section>
      <section>
        <h2>媒体映射</h2>
        <pre>{{ formatJson(serialization.media || []) }}</pre>
      </section>
      <section>
        <h2>最终 API 请求</h2>
        <pre>{{ formatJson(result.request || {}) }}</pre>
      </section>

      <section v-if="blockers.length">
        <h2>阻塞项</h2>
        <ul class="request-blockers">
          <li v-for="blocker in blockers" :key="`${blocker.code}-${blocker.mediaId || ''}`">
            {{ blocker.message || blocker.code }}
          </li>
        </ul>
      </section>

      <div class="request-preview-actions">
        <el-button data-testid="copy-json-button" @click="copyJson">仅复制 JSON</el-button>
        <el-checkbox
          v-if="canConfirm"
          v-model="confirmed"
          data-testid="real-confirm-checkbox"
        >
          确认创建 {{ config.count }} 条 {{ config.resolution.toUpperCase() }} / {{ config.duration }}秒 / {{ config.generateAudio ? '有声' : '无声' }}任务
        </el-checkbox>
        <el-button
          v-if="canConfirm"
          type="primary"
          data-testid="real-generation-button"
          :disabled="!confirmed || pending"
          @click="$emit('confirm-real', result.confirmationToken)"
        >
          确认真实生成
        </el-button>
      </div>
    </div>
    <el-empty v-else description="暂无 Dry-run 结果" />
  </el-drawer>
</template>

<script setup>
import { computed, ref, watch } from 'vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  result: { type: Object, default: null },
  config: { type: Object, required: true },
  pending: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue', 'confirm-real'])
const confirmed = ref(false)

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
})
const serialization = computed(() => props.result?.serialization || {})
const blockers = computed(() => (Array.isArray(props.result?.blockers) ? props.result.blockers : []))
const canConfirm = computed(() => Boolean(
  props.result?.realReady === true && props.result?.confirmationToken,
))

function formatJson(value) {
  return JSON.stringify(value, null, 2)
}

async function copyJson() {
  const value = formatJson(props.result?.request || {})
  if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(value)
}

watch(() => props.result?.confirmationToken, () => {
  confirmed.value = false
})
</script>

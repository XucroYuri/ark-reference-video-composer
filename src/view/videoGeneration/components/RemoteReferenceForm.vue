<template>
  <form class="remote-reference-form" @submit.prevent.stop="submit">
    <label>
      <span>公网图片 URL</span>
      <input
        v-model="url"
        type="url"
        required
        maxlength="2048"
        placeholder="https://example.com/reference.png"
      >
    </label>
    <label>
      <span>显示名称</span>
      <input v-model="name" type="text" maxlength="255" placeholder="可选">
    </label>
    <button type="submit" :disabled="pending || !url.trim()">添加 URL 素材</button>
    <p v-if="errorMessage" class="remote-reference-error" role="alert">
      {{ errorMessage }}
    </p>
  </form>
</template>

<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  pending: { type: Boolean, default: false },
  errorMessage: { type: String, default: '' },
  successSignal: { type: Number, default: 0 },
})

const emit = defineEmits(['submit'])
const url = ref('')
const name = ref('')
let awaitingSuccess = false

function submit() {
  const normalizedUrl = url.value.trim()
  if (props.pending || !normalizedUrl) return
  awaitingSuccess = true
  emit('submit', { url: normalizedUrl, name: name.value.trim() })
}

watch(
  () => props.successSignal,
  () => {
    if (!awaitingSuccess) return
    url.value = ''
    name.value = ''
    awaitingSuccess = false
  },
)
</script>

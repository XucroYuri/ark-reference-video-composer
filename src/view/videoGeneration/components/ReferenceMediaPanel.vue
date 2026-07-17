<template>
  <section class="reference-media-panel" aria-label="参考内容">
    <div class="reference-media-strip" :class="{ 'is-empty': !displayItems.length }">
      <el-upload
        class="reference-upload"
        action="#"
        :auto-upload="false"
        :show-file-list="false"
        :accept="accept"
        :on-change="handleUploadChange"
      >
        <button
          v-if="!displayItems.length"
          class="reference-empty-tile"
          type="button"
          data-testid="reference-upload-trigger"
        >
          <el-icon><Plus /></el-icon>
          <span>参考内容</span>
        </button>
        <button
          v-else
          class="reference-add-button"
          type="button"
          aria-label="上传参考文件"
          data-testid="reference-add-button"
        >
          <el-icon><Plus /></el-icon>
        </button>
      </el-upload>

      <ul v-if="displayItems.length" class="reference-media-list">
        <li
          v-for="item in displayItems"
          :key="item.id"
          class="reference-media-item"
          :class="`is-${item.status || 'ready'}`"
        >
          <img
            v-if="item.previewUrl"
            class="reference-thumbnail"
            :src="item.previewUrl"
            :alt="item.name || `图片${item.realIndex}`"
            :referrerpolicy="item.source === 'remote_url' ? 'no-referrer' : undefined"
          >
          <div v-else class="reference-thumbnail-fallback">
            <el-icon><Picture /></el-icon>
          </div>
          <span class="reference-label">{{ item.status === 'uploading' ? '上传中' : `图片${item.realIndex}` }}</span>
          <button
            class="reference-remove"
            type="button"
            :aria-label="`删除图片${item.realIndex}`"
            :disabled="item.status === 'uploading' || removePending"
            @click.stop="$emit('remove', item)"
          >
            <el-icon><Close /></el-icon>
          </button>
        </li>
      </ul>
    </div>
    <RemoteReferenceForm
      :pending="uploadPending"
      :error-message="remoteErrorMessage"
      :success-signal="remoteSuccessSignal"
      @submit="handleRemoteSubmit"
    />
    <p v-if="errorMessage" class="reference-error" role="alert">{{ errorMessage }}</p>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'
import { Close, Picture, Plus } from '@element-plus/icons-vue'

import RemoteReferenceForm from './RemoteReferenceForm.vue'

const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])
const MAX_FILE_SIZE = 30 * 1024 * 1024

const props = defineProps({
  mediaList: { type: Array, default: () => [] },
  uploadMedia: { type: Function, required: true },
  addRemoteMedia: { type: Function, required: true },
  uploadPending: { type: Boolean, default: false },
  removePending: { type: Boolean, default: false },
})

defineEmits(['remove'])

const accept = 'image/png,image/jpeg,image/webp'
const localItems = ref([])
const errorMessage = ref('')
const remoteErrorMessage = ref('')
const remoteSuccessSignal = ref(0)

const displayItems = computed(() => [
  ...props.mediaList,
  ...localItems.value,
])

function revokeItem(item) {
  if (item?.objectUrl && typeof URL.revokeObjectURL === 'function') {
    URL.revokeObjectURL(item.objectUrl)
  }
}

function createLocalPreview(file) {
  const objectUrl = typeof URL.createObjectURL === 'function'
    ? URL.createObjectURL(file)
    : ''
  return {
    id: `local-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    kind: 'image',
    name: file.name,
    status: 'uploading',
    realIndex: props.mediaList.length + localItems.value.length + 1,
    previewUrl: objectUrl,
    objectUrl,
  }
}

function validateFile(file) {
  if (!ALLOWED_TYPES.has(file.type)) return '仅支持 PNG、JPEG、WebP 图片'
  if (file.size > MAX_FILE_SIZE) return '参考图片不能超过 30MB'
  return ''
}

async function handleUploadChange(uploadFile) {
  const file = uploadFile?.raw
  if (!file || props.uploadPending) return false

  const validationError = validateFile(file)
  if (validationError) {
    errorMessage.value = validationError
    return false
  }

  errorMessage.value = ''
  const localItem = createLocalPreview(file)
  localItems.value.push(localItem)
  try {
    await props.uploadMedia(file)
  } catch (error) {
    errorMessage.value = error?.message || '上传参考内容失败'
  } finally {
    localItems.value = localItems.value.filter((item) => item.id !== localItem.id)
    revokeItem(localItem)
  }
  return false
}

async function handleRemoteSubmit(input) {
  if (props.uploadPending) return
  remoteErrorMessage.value = ''
  try {
    await props.addRemoteMedia(input)
    remoteSuccessSignal.value += 1
  } catch (error) {
    remoteErrorMessage.value = error?.message || '添加 URL 素材失败'
  }
}

onBeforeUnmount(() => {
  for (const item of localItems.value) revokeItem(item)
})
</script>

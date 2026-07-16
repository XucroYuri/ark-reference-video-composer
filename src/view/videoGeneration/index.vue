<template>
  <main class="video-generation-page">
    <h1 class="video-generation-title">体验视频生成，让创意摇动</h1>

    <form class="ark-composer-shell" @submit.prevent="submitDryRun">
      <div class="ark-composer-input-row">
        <ReferenceMediaPanel
          :media-list="store.mediaList"
          :upload-media="store.uploadMedia"
          :upload-pending="store.uploadPending"
          :remove-pending="store.removePending"
          @remove="requestRemoveMedia"
        />

        <div class="ark-composer-prompt" @click="composerRef?.focus()">
          <p v-if="isEditorEmpty" class="ark-composer-placeholder">
            使用 <kbd>@</kbd> 可快速引用上传的文件，如：参考@视频1 中的动作，生成@图片2 和@图片3 中的角色打斗的视频。
          </p>
          <PromptComposer
            ref="composerRef"
            :model-value="store.editorDoc"
            :media-list="store.mediaList"
            :disabled="store.submitPending"
            @update:model-value="store.setEditorDoc"
          />
        </div>
      </div>

      <div class="ark-composer-actions-row">
        <div class="ark-composer-primary-controls">
          <GenerationOptionsBar
            :config="store.config"
            @update="store.setConfig"
          />
          <button
            v-if="store.mediaList.length"
            class="mention-trigger"
            type="button"
            aria-label="引用参考内容"
            @click="insertFirstReadyMedia"
          >
            @
          </button>
        </div>

        <div class="ark-composer-submit-controls">
          <button
            v-if="store.mediaList.length || !isEditorEmpty"
            class="clear-all-button"
            type="button"
            @click="clearAll"
          >
            全部清空
          </button>
          <span class="ark-composer-price">0.046 元/千 tokens</span>
          <button
            class="ark-composer-submit"
            type="submit"
            aria-label="提交 Dry-run"
            :disabled="!canSubmit || store.submitPending"
          >
            <el-icon><Top /></el-icon>
          </button>
        </div>
      </div>
    </form>

    <GenerationTaskPanel :task-list="store.taskList" :submitting="store.submitPending" />
    <RequestPreviewDrawer
      v-model="previewOpen"
      :result="store.dryRunResult"
      :config="store.config"
      :pending="store.submitPending"
      @confirm-real="store.confirmRealGeneration"
    />
  </main>
</template>

<script setup>
import { computed, ref } from 'vue'
import { Top } from '@element-plus/icons-vue'

import GenerationOptionsBar from './components/GenerationOptionsBar.vue'
import GenerationTaskPanel from './components/GenerationTaskPanel.vue'
import PromptComposer from './components/PromptComposer.vue'
import ReferenceMediaPanel from './components/ReferenceMediaPanel.vue'
import RequestPreviewDrawer from './components/RequestPreviewDrawer.vue'
import { useVideoGenerationStore } from './store'
import './styles/index.scss'

const store = useVideoGenerationStore()
const composerRef = ref(null)
const previewOpen = ref(false)
const qaEnabled = import.meta.env.MODE === 'development'

function docText(node) {
  if (!node || typeof node !== 'object') return ''
  if (node.type === 'text') return node.text || ''
  if (node.type === 'mediaMention') return '@'
  if (!Array.isArray(node.content)) return ''
  return node.content.map(docText).join('')
}

function docHasMention(mediaId) {
  let found = false
  const visit = (node) => {
    if (!node || found) return
    if (node.type === 'mediaMention' && node.attrs?.mediaId === mediaId) {
      found = true
      return
    }
    if (Array.isArray(node.content)) node.content.forEach(visit)
  }
  visit(store.editorDoc)
  return found
}

const isEditorEmpty = computed(() => !docText(store.editorDoc).trim())
const readyMedia = computed(() => store.mediaList.filter((item) => item.status === 'ready'))
const canSubmit = computed(() => readyMedia.value.length > 0 || !isEditorEmpty.value)

function insertFirstReadyMedia() {
  const first = readyMedia.value[0]
  if (first) composerRef.value?.insertMedia(first)
}

async function submitDryRun() {
  if (!canSubmit.value || store.submitPending) return
  await store.runDryRun()
  previewOpen.value = true
}

function clearAll() {
  store.clearDraft()
  previewOpen.value = false
}

async function requestRemoveMedia(media) {
  if (!media?.id) return
  if (docHasMention(media.id)) {
    const confirmed = window.confirm(`图片${media.realIndex} 已在提示词中引用，确认删除？`)
    if (!confirmed) return
  }
  await store.removeMedia(media.id)
}

function seedQaReferenceFromLocation() {
  if (!qaEnabled || typeof window === 'undefined') return
  const [, queryString = ''] = window.location.hash.split('?')
  const payload = new URLSearchParams(queryString).get('qaMedia')
  if (!payload) return
  try {
    const media = JSON.parse(payload)
    store.addMedia(media)
  } catch {
    // Ignore malformed QA payloads; this path is only for local browser verification.
  }
}

seedQaReferenceFromLocation()
</script>

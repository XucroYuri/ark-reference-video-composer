<template>
  <main class="video-generation-page">
    <h1 class="video-generation-title">体验视频生成，让创意摇动</h1>

    <section class="ark-composer-shell">
      <div class="ark-composer-input-row">
        <ReferenceMediaPanel
          :media-list="store.mediaList"
          :add-remote-media="store.addRemoteMedia"
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
          <span class="ark-composer-price">实际费用以方舟控制台为准</span>
          <button
            class="ark-composer-submit"
            type="button"
            aria-label="提交 Dry-run"
            :disabled="!canSubmit || store.submitPending"
            @click="submitDryRun"
          >
            <el-icon><Top /></el-icon>
          </button>
        </div>
      </div>
    </section>

    <p v-if="taskActionError" data-testid="task-action-error" role="alert">
      {{ taskActionError }}
    </p>
    <GenerationTaskPanel
      :task-list="store.taskList"
      :total="store.taskTotal"
      :loading="store.taskListPending"
      :action-pending="store.taskActionPending"
      :submitting="store.submitPending"
      @refresh-history="refreshTaskHistory"
      @refresh-task="refreshTask"
      @remove-or-cancel="removeOrCancelTask"
    />
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
const taskActionError = ref('')
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

async function runTaskAction(action, failureMessage) {
  taskActionError.value = ''
  try {
    await action()
  } catch {
    taskActionError.value = failureMessage
  }
}

function refreshTaskHistory(query) {
  return runTaskAction(
    () => store.loadTaskHistory(query),
    '加载任务历史失败，请稍后重试。',
  )
}

function refreshTask(taskId) {
  return runTaskAction(
    () => store.pollTask(taskId),
    '刷新任务失败，请稍后重试。',
  )
}

function removeOrCancelTask(task) {
  return runTaskAction(
    () => store.removeOrCancelTask(task),
    '取消或删除任务失败，请稍后重试。',
  )
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
    // 本入口只用于本地浏览器 QA；URL 参数异常时直接忽略，避免影响正常页面。
  }
}

seedQaReferenceFromLocation()
</script>

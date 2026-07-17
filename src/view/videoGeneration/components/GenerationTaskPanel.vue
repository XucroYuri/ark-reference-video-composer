<template>
  <section class="generation-task-panel" aria-label="生成任务">
    <div class="generation-task-panel-heading">
      <h2>任务历史与结果</h2>
    </div>

    <TaskHistoryFilters
      :total="total"
      :loading="loading"
      @load="$emit('refresh-history', $event)"
    />

    <p v-if="!visibleTasks.length" class="generation-task-empty">暂无任务记录</p>
    <article
      v-for="task in visibleTasks"
      :key="task.id"
      class="generation-task"
      :class="`is-${task.status}`"
      :data-task-status="task.status"
    >
      <div class="generation-task-summary">
        <div class="generation-task-identity">
          <strong>{{ maskTaskId(task.id) }}</strong>
          <button
            v-if="task.status !== 'submitting'"
            type="button"
            data-action="copy"
            aria-label="复制完整任务 ID"
            @click="copyTaskId(task.id)"
          >
            复制 ID
          </button>
        </div>
        <span class="generation-task-status">{{ statusLabels[task.status] || task.status }}</span>
      </div>

      <dl v-if="task.status !== 'submitting'" class="generation-task-metadata">
        <template v-if="task.model != null">
          <dt>model</dt>
          <dd>{{ task.model }}</dd>
        </template>
        <template v-if="task.resolution != null">
          <dt>resolution</dt>
          <dd>{{ task.resolution }}</dd>
        </template>
        <template v-if="task.ratio != null">
          <dt>ratio</dt>
          <dd>{{ task.ratio }}</dd>
        </template>
        <template v-if="task.duration != null">
          <dt>duration</dt>
          <dd>{{ task.duration }}</dd>
        </template>
        <template v-else-if="task.frames != null">
          <dt>frames</dt>
          <dd>{{ task.frames }}</dd>
        </template>
        <template v-if="task.generate_audio != null">
          <dt>generate_audio</dt>
          <dd>{{ String(task.generate_audio) }}</dd>
        </template>
        <template v-if="task.usage?.completion_tokens != null">
          <dt>usage.completion_tokens</dt>
          <dd>{{ task.usage.completion_tokens }}</dd>
        </template>
        <template v-if="task.content?.video_url">
          <dt>content.video_url</dt>
          <dd>
            <a
              :href="task.content.video_url"
              target="_blank"
              rel="noopener noreferrer"
            >
              打开或下载视频
            </a>
          </dd>
        </template>
        <template v-if="task.content?.last_frame_url">
          <dt>content.last_frame_url</dt>
          <dd>生成视频尾帧</dd>
        </template>
      </dl>

      <p v-if="task.status === 'failed'" class="generation-task-error" role="alert">
        <span>
          <strong>error.code</strong>
          {{ displayTaskError(task.error?.code, task.id, '生成失败', ERROR_CODE_LIMIT) }}
        </span>
        <span>
          <strong>error.message</strong>
          {{ displayTaskError(task.error?.message, task.id, '方舟未返回错误详情', ERROR_MESSAGE_LIMIT) }}
        </span>
      </p>
      <p v-if="task.status === 'expired'" role="status">任务超时，已停止生成。</p>
      <p v-if="task.status === 'unavailable'" role="status">任务不可用，无法获取最新状态。</p>
      <video
        v-if="task.status === 'succeeded' && task.content?.video_url"
        :src="task.content.video_url"
        controls
        playsinline
        preload="metadata"
      />
      <img
        v-if="task.content?.last_frame_url"
        :src="task.content.last_frame_url"
        alt="生成视频尾帧"
        referrerpolicy="no-referrer"
      >
      <p v-if="task.status === 'succeeded'" class="generation-task-expiry">
        视频链接有效期为 24 小时。视频与尾帧链接有效期为 24 小时，请及时下载或转存。
      </p>

      <div v-if="task.status !== 'submitting'" class="generation-task-actions">
        <button
          type="button"
          data-action="refresh"
          :disabled="loading || actionPending"
          @click="$emit('refresh-task', task.id)"
        >
          刷新状态
        </button>
        <button
          v-if="deletableStatuses.has(task.status)"
          type="button"
          data-action="delete"
          :disabled="actionPending"
          @click="$emit('remove-or-cancel', task)"
        >
          {{ task.status === 'queued' ? '取消任务' : '删除记录' }}
        </button>
      </div>
    </article>
  </section>
</template>

<script setup>
import { computed } from 'vue'

import TaskHistoryFilters from './TaskHistoryFilters.vue'

const props = defineProps({
  taskList: { type: Array, default: () => [] },
  total: { type: Number, default: 0 },
  loading: { type: Boolean, default: false },
  actionPending: { type: Boolean, default: false },
  submitting: { type: Boolean, default: false },
})

defineEmits(['refresh-history', 'refresh-task', 'remove-or-cancel'])

const statusLabels = {
  submitting: 'submitting · 正在提交',
  queued: 'queued · 排队中',
  running: 'running · 生成中',
  succeeded: 'succeeded · 已完成',
  failed: 'failed · 失败',
  cancelled: 'cancelled · 已取消',
  expired: 'expired · 已超时',
  unavailable: 'unavailable · 不可用',
}
const deletableStatuses = new Set(['queued', 'succeeded', 'failed', 'expired'])
const ERROR_CODE_LIMIT = 120
const ERROR_MESSAGE_LIMIT = 320
const REDACTION_MARKER = '[已隐藏]'
const TRUNCATION_MARKER = '…（已截断）'
const URL_PATTERN = /\bhttps?:\/\/[^\s<>"']+/giu
const AUTH_SCHEME_PATTERN = /\b(?:Bearer|Basic)\s+[^\s<>"']+/giu
const CREDENTIAL_ASSIGNMENT_PATTERN = /(^|[^\p{L}\p{N}_])(["']?)(authorization|auth[-_\s]?token|access[-_\s]?token|refresh[-_\s]?token|api[-_\s]?key|apikey|x[-_\s]?api[-_\s]?key|token|credential|client[-_\s]?secret|password|secret)\2\s*([:=])\s*(?:"(?:\\.|[^"\\\r\n])*"|'(?:\\.|[^'\\\r\n])*'|[^\s,;}\]<>"']+)/gimu
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu

const visibleTasks = computed(() => {
  if (props.submitting) return [{ id: 'local-submitting', status: 'submitting' }]
  if (props.taskList.length) return props.taskList
  return []
})

function maskTaskId(taskId) {
  if (typeof taskId !== 'string' || !taskId) return '未知任务'
  if (taskId.length <= 4) return '••••'
  return `${taskId.slice(0, 4)}…${taskId.slice(-4)}`
}

function displayTaskError(value, taskId, fallback, maxLength) {
  if (typeof value !== 'string') return fallback

  let safeText = value
    .normalize('NFKC')
    .replace(CONTROL_CHARACTER_PATTERN, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
  if (!safeText) return fallback

  const normalizedTaskId = typeof taskId === 'string' ? taskId.normalize('NFKC') : ''
  if (normalizedTaskId) safeText = safeText.split(normalizedTaskId).join(REDACTION_MARKER)
  safeText = safeText
    .replace(URL_PATTERN, REDACTION_MARKER)
    .replace(AUTH_SCHEME_PATTERN, REDACTION_MARKER)
    .replace(CREDENTIAL_ASSIGNMENT_PATTERN, `$1$2$3$2$4${REDACTION_MARKER}`)

  if (safeText.length > maxLength) {
    return `${safeText.slice(0, maxLength)}${TRUNCATION_MARKER}`
  }
  return safeText || fallback
}

async function copyTaskId(taskId) {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return
  try {
    await navigator.clipboard.writeText(taskId)
  } catch {
    // Clipboard availability varies by browser permission; task actions remain unaffected.
  }
}
</script>

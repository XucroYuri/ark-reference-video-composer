import { defineStore } from 'pinia'
import { onScopeDispose, reactive, ref, watch } from 'vue'

import {
  createVideoGenerationTask,
  deleteReference,
  dryRunVideoGeneration,
  getVideoGenerationTask,
  uploadReference,
} from '@/api/videoGeneration'

const createEmptyDoc = () => ({
  type: 'doc',
  content: [{ type: 'paragraph' }],
})

const createDefaultConfig = () => ({
  mode: 'reference_media',
  ratio: 'adaptive',
  resolution: '720p',
  duration: 5,
  count: 1,
  generateAudio: true,
})

const CONFIG_KEYS = Object.keys(createDefaultConfig())
const CONFIG_VALIDATORS = {
  mode: (value) => value === 'reference_media',
  ratio: (value) => ['adaptive', '16:9', '9:16', '1:1'].includes(value),
  resolution: (value) => ['720p', '1080p'].includes(value),
  duration: (value) => [5, 10].includes(value),
  count: (value) => Number.isInteger(value) && value >= 1 && value <= 4,
  generateAudio: (value) => typeof value === 'boolean',
}
const TASK_STATUSES = new Set(['queued', 'running', 'succeeded', 'failed', 'cancelled'])
const TERMINAL_TASK_STATUSES = new Set(['succeeded', 'failed', 'cancelled'])
const VISIBLE_POLL_INTERVAL_MS = 3000
const HIDDEN_POLL_INTERVAL_MS = 10000

export class VideoGenerationStoreError extends Error {
  constructor(code, message, details = {}) {
    super(message)
    this.name = 'VideoGenerationStoreError'
    this.code = code
    this.details = details
  }
}

function unwrapEnvelope(response) {
  const isObject = response && typeof response === 'object' && !Array.isArray(response)
  if (!isObject
    || !Object.hasOwn(response, 'code')
    || !Number.isInteger(response.code)
    || !Object.hasOwn(response, 'data')
    || typeof response.msg !== 'string') {
    throw new VideoGenerationStoreError(
      'VIDEO_GENERATION_API_MALFORMED',
      '视频生成接口响应格式无效',
    )
  }
  if (response.code !== 0) {
    throw new VideoGenerationStoreError(
      'VIDEO_GENERATION_API_REJECTED',
      typeof response.msg === 'string' && response.msg ? response.msg : '视频生成请求失败',
      { responseCode: response.code, data: response.data },
    )
  }
  return response.data
}

async function unwrapApiCall(request) {
  let response
  try {
    response = await request
  } catch (error) {
    if (error instanceof VideoGenerationStoreError) throw error
    if (error?.response && Object.hasOwn(error.response, 'data')) {
      return unwrapEnvelope(error.response.data)
    }
    throw new VideoGenerationStoreError(
      'VIDEO_GENERATION_NETWORK_ERROR',
      '视频生成网络请求失败',
    )
  }

  if (response?.response && Object.hasOwn(response.response, 'data')) {
    return unwrapEnvelope(response.response.data)
  }
  if (response == null || response instanceof Error) {
    throw new VideoGenerationStoreError(
      'VIDEO_GENERATION_NETWORK_ERROR',
      '视频生成网络请求失败',
    )
  }
  return unwrapEnvelope(response)
}

function requireMedia(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)
    || typeof data.id !== 'string' || !data.id.trim()) {
    throw new VideoGenerationStoreError(
      'VIDEO_GENERATION_API_MALFORMED',
      '上传接口未返回有效素材',
    )
  }
  return data
}

function requireObject(data, message = '视频生成接口未返回有效数据') {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new VideoGenerationStoreError(
      'VIDEO_GENERATION_API_MALFORMED',
      message,
    )
  }
  return data
}

function isPlayableHttpsUrl(value) {
  if (typeof value !== 'string' || !value || value.trim() !== value) return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && Boolean(url.hostname) && !url.username && !url.password
  } catch {
    return false
  }
}

export function removeMentionsByMediaId(doc, mediaId) {
  const visit = (node) => {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return node
    if (node.type === 'mediaMention' && node.attrs?.mediaId === mediaId) return null

    const copy = { ...node }
    if (Array.isArray(node.content)) {
      copy.content = node.content.map(visit).filter((child) => child !== null)
    }
    return copy
  }

  return visit(doc)
}

export const useVideoGenerationStore = defineStore('videoGeneration', () => {
  const mediaList = ref([])
  const editorDoc = ref(createEmptyDoc())
  const config = reactive(createDefaultConfig())
  const dryRunResult = ref(null)
  const taskList = ref([])
  const uploadPending = ref(false)
  const removePending = ref(false)
  const submitPending = ref(false)
  let nextRealIndex = 1
  let lifecycleEpoch = 0
  let draftRevision = 0
  let operationSequence = 0
  let activeUploadOperation = null
  let activeRemovalOperation = null
  let activeSubmissionOperation = null
  const pollingTimers = new Map()
  const activePollingTasks = new Set()
  const pollingEpochByTask = new Map()

  function invalidateDryRun() {
    dryRunResult.value = null
  }

  function markDraftChanged() {
    draftRevision += 1
    invalidateDryRun()
  }

  watch(
    [mediaList, editorDoc, () => config],
    markDraftChanged,
    { deep: true, flush: 'sync' },
  )

  function createSubmissionDto() {
    return JSON.parse(JSON.stringify({
      doc: editorDoc.value,
      mediaList: mediaList.value.map((item) => ({
        id: item.id,
        realIndex: item.realIndex,
      })),
      config: Object.fromEntries(CONFIG_KEYS.map((key) => [key, config[key]])),
    }))
  }

  function captureDraftOperation() {
    return {
      epoch: lifecycleEpoch,
      revision: draftRevision,
    }
  }

  function captureLifecycleOperation() {
    return { epoch: lifecycleEpoch }
  }

  function assertCurrentDraftOperation(captured) {
    if (captured.epoch !== lifecycleEpoch || captured.revision !== draftRevision) {
      throw new VideoGenerationStoreError(
        'VIDEO_GENERATION_STALE_OPERATION',
        '草稿已变化，已忽略过期响应',
      )
    }
  }

  function assertCurrentLifecycle(captured) {
    if (captured.epoch !== lifecycleEpoch) {
      throw new VideoGenerationStoreError(
        'VIDEO_GENERATION_STALE_OPERATION',
        '草稿生命周期已变化，已忽略过期响应',
      )
    }
  }

  function createOperationId() {
    operationSequence += 1
    return operationSequence
  }

  function throwPending() {
    throw new VideoGenerationStoreError(
      'VIDEO_GENERATION_REQUEST_PENDING',
      '视频生成请求正在处理中',
    )
  }

  function recordTaskIds(taskIds) {
    if (!Array.isArray(taskIds)) return []

    const existing = new Set(taskList.value.map((task) => task.id))
    const recorded = []
    for (const value of taskIds) {
      const id = typeof value === 'string' ? value.trim() : ''
      if (!id || existing.has(id)) continue
      existing.add(id)
      taskList.value.push({ id, status: 'queued' })
      recorded.push(id)
    }
    return recorded
  }

  function addMedia(media) {
    const id = typeof media?.id === 'string' ? media.id.trim() : ''
    if (!id) return null

    const existing = mediaList.value.find((item) => item.id === id)
    if (existing) return existing

    const item = { ...media, realIndex: nextRealIndex }
    item.id = id
    nextRealIndex += 1
    mediaList.value.push(item)
    invalidateDryRun()
    return mediaList.value.at(-1)
  }

  function setEditorDoc(doc) {
    editorDoc.value = doc
    invalidateDryRun()
  }

  function setConfig(patch) {
    const patchIsObject = patch && typeof patch === 'object' && !Array.isArray(patch)
    const keys = patchIsObject ? Object.keys(patch) : []
    const valid = patchIsObject && keys.every((key) => (
      Object.hasOwn(CONFIG_VALIDATORS, key) && CONFIG_VALIDATORS[key](patch[key])
    ))
    if (!valid) {
      throw new VideoGenerationStoreError(
        'VIDEO_GENERATION_INVALID_CONFIG',
        '视频生成参数无效',
      )
    }

    let changed = false
    for (const key of keys) {
      if (config[key] !== patch[key]) {
        config[key] = patch[key]
        changed = true
      }
    }
    if (changed) invalidateDryRun()
  }

  async function uploadMedia(file) {
    if (activeUploadOperation !== null
      || activeRemovalOperation !== null
      || activeSubmissionOperation !== null
      || submitPending.value) throwPending()
    const operationId = createOperationId()
    const captured = captureLifecycleOperation()
    activeUploadOperation = operationId
    uploadPending.value = true
    try {
      const formData = new FormData()
      formData.append('file', file)
      const data = requireMedia(await unwrapApiCall(uploadReference(formData)))
      assertCurrentLifecycle(captured)
      return addMedia(data)
    } finally {
      if (activeUploadOperation === operationId) {
        activeUploadOperation = null
        uploadPending.value = false
      }
    }
  }

  async function removeMedia(mediaId) {
    if (activeRemovalOperation !== null
      || activeUploadOperation !== null
      || activeSubmissionOperation !== null
      || submitPending.value) throwPending()
    if (!mediaList.value.some((item) => item.id === mediaId)) return null

    const operationId = createOperationId()
    const captured = captureLifecycleOperation()
    activeRemovalOperation = operationId
    removePending.value = true
    try {
      await unwrapApiCall(deleteReference({ mediaId }))
      assertCurrentLifecycle(captured)
      const currentIndex = mediaList.value.findIndex((item) => item.id === mediaId)
      const [removed] = currentIndex >= 0
        ? mediaList.value.splice(currentIndex, 1)
        : [null]
      editorDoc.value = removeMentionsByMediaId(editorDoc.value, mediaId)
      invalidateDryRun()
      return removed
    } finally {
      if (activeRemovalOperation === operationId) {
        activeRemovalOperation = null
        removePending.value = false
      }
    }
  }

  async function runDryRun() {
    if (activeSubmissionOperation !== null
      || activeUploadOperation !== null
      || activeRemovalOperation !== null
      || uploadPending.value
      || removePending.value) throwPending()

    const operationId = createOperationId()
    const captured = captureDraftOperation()
    const dto = createSubmissionDto()
    activeSubmissionOperation = operationId
    submitPending.value = true
    try {
      const data = requireObject(await unwrapApiCall(
        dryRunVideoGeneration(dto),
      ))
      assertCurrentDraftOperation(captured)
      dryRunResult.value = data
      return data
    } finally {
      if (activeSubmissionOperation === operationId) {
        activeSubmissionOperation = null
        submitPending.value = false
      }
    }
  }

  async function confirmRealGeneration(token) {
    if (activeUploadOperation !== null
      || activeRemovalOperation !== null
      || uploadPending.value
      || removePending.value) throwPending()
    const currentToken = dryRunResult.value?.confirmationToken
    if (typeof token !== 'string' || !token || token !== currentToken) {
      throw new VideoGenerationStoreError(
        'VIDEO_GENERATION_CONFIRMATION_MISMATCH',
        '确认凭证不是当前草稿的有效凭证',
      )
    }
    if (activeSubmissionOperation !== null) throwPending()

    const operationId = createOperationId()
    const captured = captureDraftOperation()
    const dto = createSubmissionDto()
    activeSubmissionOperation = operationId
    submitPending.value = true
    try {
      const data = requireObject(await unwrapApiCall(createVideoGenerationTask({
        ...dto,
        confirmationToken: token,
      })))
      if (!Array.isArray(data.taskIds)) {
        throw new VideoGenerationStoreError(
          'VIDEO_GENERATION_API_MALFORMED',
          '创建任务接口未返回任务 ID 列表',
        )
      }
      recordTaskIds(data.taskIds).forEach((taskId) => startPolling(taskId))
      return data
    } catch (error) {
      recordTaskIds(error?.details?.data?.taskIds).forEach((taskId) => startPolling(taskId))
      throw error
    } finally {
      if (captured.epoch === lifecycleEpoch
        && captured.revision === draftRevision
        && dryRunResult.value?.confirmationToken === token) {
        dryRunResult.value = {
          ...dryRunResult.value,
          confirmationToken: '',
        }
      }
      if (activeSubmissionOperation === operationId) {
        activeSubmissionOperation = null
        submitPending.value = false
      }
    }
  }

  function getPollingEpoch(taskId) {
    return pollingEpochByTask.get(taskId) || 0
  }

  function bumpPollingEpoch(taskId) {
    pollingEpochByTask.set(taskId, getPollingEpoch(taskId) + 1)
  }

  function isCurrentPollingGuard(taskId, guard) {
    return !guard || (
      activePollingTasks.has(taskId)
      && guard.epoch === getPollingEpoch(taskId)
      && guard.lifecycleEpoch === lifecycleEpoch
    )
  }

  function assertCurrentPollingGuard(taskId, guard) {
    if (isCurrentPollingGuard(taskId, guard)) return
    throw new VideoGenerationStoreError(
      'VIDEO_GENERATION_STALE_OPERATION',
      '任务轮询已停止，已忽略过期响应',
    )
  }

  async function pollTask(taskId, pollingGuard) {
    if (typeof taskId !== 'string' || !taskId.trim()) {
      throw new VideoGenerationStoreError(
        'VIDEO_GENERATION_INVALID_TASK_ID',
        '任务 ID 无效',
      )
    }

    const data = requireObject(await unwrapApiCall(
      getVideoGenerationTask({ taskId }),
    ))
    assertCurrentPollingGuard(taskId, pollingGuard)
    const responseId = typeof data.id === 'string' && data.id
      ? data.id
      : typeof data.task_id === 'string' && data.task_id
        ? data.task_id
        : ''
    const validStatus = typeof data.status === 'string' && TASK_STATUSES.has(data.status)
    const validSucceededContent = data.status !== 'succeeded'
      || isPlayableHttpsUrl(data.content?.video_url)
    if (!responseId || responseId !== taskId || !validStatus || !validSucceededContent) {
      throw new VideoGenerationStoreError(
        'VIDEO_GENERATION_API_MALFORMED',
        '任务查询接口返回了无效任务数据',
      )
    }

    const index = taskList.value.findIndex((task) => task.id === taskId)
    if (index < 0) {
      taskList.value.push({ ...data, id: taskId })
      return taskList.value.at(-1)
    }

    taskList.value[index] = {
      ...taskList.value[index],
      ...data,
      id: taskId,
    }
    return taskList.value[index]
  }

  function getPollingInterval() {
    return document.visibilityState === 'hidden'
      ? HIDDEN_POLL_INTERVAL_MS
      : VISIBLE_POLL_INTERVAL_MS
  }

  function clearPollingTimer(taskId) {
    const timer = pollingTimers.get(taskId)
    if (timer) clearTimeout(timer)
    pollingTimers.delete(taskId)
  }

  function stopPolling(taskId) {
    if (typeof taskId === 'string' && taskId.trim()) {
      const normalizedTaskId = taskId.trim()
      clearPollingTimer(normalizedTaskId)
      activePollingTasks.delete(normalizedTaskId)
      bumpPollingEpoch(normalizedTaskId)
      return
    }
    for (const id of new Set([...activePollingTasks, ...pollingTimers.keys()])) {
      stopPolling(id)
    }
  }

  function schedulePolling(taskId) {
    clearPollingTimer(taskId)
    const pollingGuard = {
      epoch: getPollingEpoch(taskId),
      lifecycleEpoch,
    }
    const timer = setTimeout(async () => {
      pollingTimers.delete(taskId)
      try {
        const task = await pollTask(taskId, pollingGuard)
        if (!isCurrentPollingGuard(taskId, pollingGuard)) return
        if (TERMINAL_TASK_STATUSES.has(task.status)) {
          stopPolling(taskId)
          return
        }
        schedulePolling(taskId)
      } catch {
        if (isCurrentPollingGuard(taskId, pollingGuard)
          && taskList.value.some((task) => task.id === taskId)) {
          schedulePolling(taskId)
        }
      }
    }, getPollingInterval())
    pollingTimers.set(taskId, timer)
  }

  function startPolling(taskId) {
    if (typeof taskId !== 'string' || !taskId.trim()) {
      throw new VideoGenerationStoreError(
        'VIDEO_GENERATION_INVALID_TASK_ID',
        '任务 ID 无效',
      )
    }
    const normalizedTaskId = taskId.trim()
    const existing = taskList.value.find((task) => task.id === normalizedTaskId)
    if (existing && TERMINAL_TASK_STATUSES.has(existing.status)) {
      stopPolling(normalizedTaskId)
      return false
    }
    activePollingTasks.add(normalizedTaskId)
    schedulePolling(normalizedTaskId)
    return true
  }

  function resumeTask(taskId) {
    if (typeof taskId !== 'string' || !taskId.trim()) {
      throw new VideoGenerationStoreError(
        'VIDEO_GENERATION_INVALID_TASK_ID',
        '任务 ID 无效',
      )
    }
    const normalizedTaskId = taskId.trim()
    if (!taskList.value.some((task) => task.id === normalizedTaskId)) {
      taskList.value.push({ id: normalizedTaskId, status: 'queued' })
    }
    return startPolling(normalizedTaskId)
  }

  function clearDraft() {
    lifecycleEpoch += 1
    activeUploadOperation = null
    activeRemovalOperation = null
    activeSubmissionOperation = null
    mediaList.value = []
    editorDoc.value = createEmptyDoc()
    Object.assign(config, createDefaultConfig())
    dryRunResult.value = null
    taskList.value = []
    stopPolling()
    uploadPending.value = false
    removePending.value = false
    submitPending.value = false
    nextRealIndex = 1
  }

  onScopeDispose(() => stopPolling())

  return {
    mediaList,
    editorDoc,
    config,
    dryRunResult,
    taskList,
    uploadPending,
    removePending,
    submitPending,
    addMedia,
    uploadMedia,
    removeMedia,
    runDryRun,
    confirmRealGeneration,
    pollTask,
    resumeTask,
    startPolling,
    stopPolling,
    setEditorDoc,
    setConfig,
    clearDraft,
  }
})

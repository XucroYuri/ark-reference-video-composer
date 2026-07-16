import { defineStore } from 'pinia'
import { reactive, ref, watch } from 'vue'

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

  function invalidateDryRun() {
    dryRunResult.value = null
  }

  watch(
    [mediaList, editorDoc, () => config],
    invalidateDryRun,
    { deep: true, flush: 'sync' },
  )

  function createSubmissionDto() {
    return {
      doc: editorDoc.value,
      mediaList: mediaList.value.map((item) => ({
        id: item.id,
        realIndex: item.realIndex,
      })),
      config: Object.fromEntries(CONFIG_KEYS.map((key) => [key, config[key]])),
    }
  }

  function recordTaskIds(taskIds) {
    if (!Array.isArray(taskIds)) return

    const existing = new Set(taskList.value.map((task) => task.id))
    for (const value of taskIds) {
      const id = typeof value === 'string' ? value.trim() : ''
      if (!id || existing.has(id)) continue
      existing.add(id)
      taskList.value.push({ id, status: 'queued' })
    }
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
    let changed = false
    for (const key of CONFIG_KEYS) {
      if (Object.hasOwn(patch || {}, key) && config[key] !== patch[key]) {
        config[key] = patch[key]
        changed = true
      }
    }
    if (changed) invalidateDryRun()
  }

  async function uploadMedia(file) {
    uploadPending.value = true
    try {
      const formData = new FormData()
      formData.append('file', file)
      const data = requireMedia(unwrapEnvelope(await uploadReference(formData)))
      return addMedia(data)
    } finally {
      uploadPending.value = false
    }
  }

  async function removeMedia(mediaId) {
    const index = mediaList.value.findIndex((item) => item.id === mediaId)
    if (index < 0) return null

    removePending.value = true
    try {
      unwrapEnvelope(await deleteReference({ mediaId }))
      const [removed] = mediaList.value.splice(index, 1)
      editorDoc.value = removeMentionsByMediaId(editorDoc.value, mediaId)
      invalidateDryRun()
      return removed
    } finally {
      removePending.value = false
    }
  }

  async function runDryRun() {
    if (submitPending.value) {
      throw new VideoGenerationStoreError(
        'VIDEO_GENERATION_REQUEST_PENDING',
        '视频生成请求正在处理中',
      )
    }

    submitPending.value = true
    try {
      const data = requireObject(unwrapEnvelope(
        await dryRunVideoGeneration(createSubmissionDto()),
      ))
      dryRunResult.value = data
      return data
    } finally {
      submitPending.value = false
    }
  }

  async function confirmRealGeneration(token) {
    const currentToken = dryRunResult.value?.confirmationToken
    if (typeof token !== 'string' || !token || token !== currentToken) {
      throw new VideoGenerationStoreError(
        'VIDEO_GENERATION_CONFIRMATION_MISMATCH',
        '确认凭证不是当前草稿的有效凭证',
      )
    }
    if (submitPending.value) {
      throw new VideoGenerationStoreError(
        'VIDEO_GENERATION_REQUEST_PENDING',
        '视频生成请求正在处理中',
      )
    }

    submitPending.value = true
    try {
      const data = requireObject(unwrapEnvelope(await createVideoGenerationTask({
        ...createSubmissionDto(),
        confirmationToken: token,
      })))
      if (!Array.isArray(data.taskIds)) {
        throw new VideoGenerationStoreError(
          'VIDEO_GENERATION_API_MALFORMED',
          '创建任务接口未返回任务 ID 列表',
        )
      }
      recordTaskIds(data.taskIds)
      return data
    } catch (error) {
      recordTaskIds(error?.details?.data?.taskIds)
      throw error
    } finally {
      if (dryRunResult.value?.confirmationToken === token) {
        dryRunResult.value = {
          ...dryRunResult.value,
          confirmationToken: '',
        }
      }
      submitPending.value = false
    }
  }

  async function pollTask(taskId) {
    if (typeof taskId !== 'string' || !taskId.trim()) {
      throw new VideoGenerationStoreError(
        'VIDEO_GENERATION_INVALID_TASK_ID',
        '任务 ID 无效',
      )
    }

    const data = requireObject(unwrapEnvelope(
      await getVideoGenerationTask({ taskId }),
    ))
    const responseId = data.id || data.task_id || taskId
    if (responseId !== taskId) {
      throw new VideoGenerationStoreError(
        'VIDEO_GENERATION_API_MALFORMED',
        '任务查询接口返回了不匹配的任务 ID',
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

  function clearDraft() {
    mediaList.value = []
    editorDoc.value = createEmptyDoc()
    Object.assign(config, createDefaultConfig())
    dryRunResult.value = null
    taskList.value = []
    uploadPending.value = false
    removePending.value = false
    submitPending.value = false
    nextRealIndex = 1
  }

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
    setEditorDoc,
    setConfig,
    clearDraft,
  }
})

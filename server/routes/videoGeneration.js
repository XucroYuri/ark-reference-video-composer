import { createHash } from 'node:crypto'

import { Router } from 'express'
import multer from 'multer'

import {
  buildArkRequest,
  serializePrompt,
  validateRealSubmission,
} from '../../src/view/videoGeneration/utils/requestBuilder.js'
import {
  DEFAULT_GENERATION_CONFIG,
  validateGenerationConfig,
} from '../../src/view/videoGeneration/domain/arkVideoContract.js'
import { MAX_UPLOAD_BYTES, MediaStoreError } from '../media/store.js'

export const ok = (res, data, msg = '操作成功') => res.json({ code: 0, data, msg })

export const fail = (res, code, msg, data = {}, status = 400) => (
  res.status(status).json({ code, data, msg })
)

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const TASK_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${stableStringify(value[key])}`
    )).join(',')}}`
  }
  return JSON.stringify(value)
}

function createConfirmationHash(request, count) {
  return createHash('sha256')
    .update(stableStringify({ count, request, version: 1 }))
    .digest('hex')
}

function normalizeArkError(error, apiKey) {
  const redact = (value, maxLength) => {
    let result = String(value ?? '').replace(
      /Bearer\s+[^\s"'<>]+/gi,
      'Bearer [REDACTED]',
    )
    const normalizedKey = typeof apiKey === 'string' ? apiKey.trim() : ''
    if (normalizedKey) result = result.split(normalizedKey).join('[REDACTED]')
    return result.slice(0, maxLength)
  }
  return {
    status: Number.isInteger(error?.status) ? error.status : 502,
    code: redact(error?.code || 'ARK_REQUEST_FAILED', 120),
    message: redact(error?.message || 'Ark 请求失败', 500),
    requestId: redact(error?.requestId || '', 200),
  }
}

function getRuntimeBlockers(config) {
  const blockers = []
  if (!config?.realGenerationEnabled) {
    blockers.push({
      code: 'REAL_GENERATION_DISABLED',
      message: '真实生成未启用',
    })
  }
  if (typeof config?.arkApiKey !== 'string' || !config.arkApiKey.trim()) {
    blockers.push({
      code: 'ARK_API_KEY_MISSING',
      message: '服务端未配置 ARK_API_KEY',
    })
  }
  return blockers
}

function failRuntimeGate(res, blockers) {
  return fail(res, 40301, '真实生成条件不满足', { blockers }, 403)
}

function validateEditorDoc(value) {
  let nodeCount = 0
  const invalid = (path, message) => ({ error: { reason: 'INVALID_DOC', path, message } })

  const sanitizeNode = (node, path, depth) => {
    nodeCount += 1
    if (nodeCount > 10000) return invalid(path, '文档节点过多')
    if (depth > 32) return invalid(path, '文档嵌套过深')
    if (!node || typeof node !== 'object' || Array.isArray(node)) {
      return invalid(path, '节点必须是对象')
    }

    if (node.type === 'text') {
      if (typeof node.text !== 'string') return invalid(`${path}.text`, '文本必须是字符串')
      return { node: { type: 'text', text: node.text } }
    }

    if (node.type === 'hardBreak') return { node: { type: 'hardBreak' } }

    if (node.type === 'mediaMention') {
      if (!node.attrs || typeof node.attrs !== 'object' || Array.isArray(node.attrs)) {
        return invalid(`${path}.attrs`, '引用属性必须是对象')
      }
      if (!UUID_PATTERN.test(node.attrs.mediaId || '')) {
        return invalid(`${path}.attrs.mediaId`, '引用素材 ID 格式无效')
      }
      return { node: { type: 'mediaMention', attrs: { mediaId: node.attrs.mediaId } } }
    }

    if (node.type !== 'paragraph') return invalid(`${path}.type`, '不支持的节点类型')
    const content = node.content ?? []
    if (!Array.isArray(content)) return invalid(`${path}.content`, '段落内容必须是数组')

    const sanitized = []
    for (let index = 0; index < content.length; index += 1) {
      const child = sanitizeNode(content[index], `${path}.content[${index}]`, depth + 1)
      if (child.error) return child
      sanitized.push(child.node)
    }
    return { node: { type: 'paragraph', content: sanitized } }
  }

  if (!value || typeof value !== 'object' || Array.isArray(value) || value.type !== 'doc') {
    return invalid('doc', '文档必须是 doc 对象')
  }
  if (!Array.isArray(value.content)) return invalid('doc.content', '文档内容必须是数组')

  const content = []
  for (let index = 0; index < value.content.length; index += 1) {
    const child = sanitizeNode(value.content[index], `doc.content[${index}]`, 1)
    if (child.error) return child
    content.push(child.node)
  }
  return { doc: { type: 'doc', content } }
}

async function resolveAuthoritativeMedia(mediaList, mediaStore) {
  if (!Array.isArray(mediaList)) {
    return { error: { path: 'mediaList', reason: 'INVALID_MEDIA_LIST' } }
  }

  const resolved = []
  const seenIds = new Set()
  const seenIndexes = new Set()
  for (let index = 0; index < mediaList.length; index += 1) {
    const submitted = mediaList[index]
    if (!submitted || typeof submitted !== 'object' || Array.isArray(submitted)) {
      return { error: { path: `mediaList[${index}]`, reason: 'INVALID_MEDIA_ITEM' } }
    }

    if (!UUID_PATTERN.test(submitted.id || '')) {
      return { error: { path: `mediaList[${index}].id`, reason: 'INVALID_MEDIA_ID' } }
    }
    if (seenIds.has(submitted.id)) {
      return { error: { path: `mediaList[${index}].id`, reason: 'DUPLICATE_MEDIA_ID' } }
    }
    if (!Number.isInteger(submitted.realIndex) || submitted.realIndex <= 0) {
      return { error: { path: `mediaList[${index}].realIndex`, reason: 'INVALID_MEDIA_REAL_INDEX' } }
    }
    if (seenIndexes.has(submitted.realIndex)) {
      return { error: { path: `mediaList[${index}].realIndex`, reason: 'DUPLICATE_MEDIA_REAL_INDEX' } }
    }

    const stored = await mediaStore.get(submitted.id)
    if (!stored) {
      return { error: { path: `mediaList[${index}].id`, reason: 'UNKNOWN_MEDIA_ID' } }
    }

    seenIds.add(submitted.id)
    seenIndexes.add(submitted.realIndex)
    resolved.push({ ...stored, realIndex: submitted.realIndex })
  }

  return { mediaList: resolved }
}

async function prepareSubmission(body, config, mediaStore) {
  const configInput = body.config && typeof body.config === 'object' && !Array.isArray(body.config)
    ? { ...DEFAULT_GENERATION_CONFIG, ...body.config }
    : body.config
  const validatedConfig = validateGenerationConfig(configInput)
  if (validatedConfig.errors.length > 0) {
    return { error: { reason: 'INVALID_CONFIG', errors: validatedConfig.errors } }
  }

  const validatedDoc = validateEditorDoc(body.doc)
  if (validatedDoc.error) return validatedDoc

  const authoritative = await resolveAuthoritativeMedia(body.mediaList, mediaStore)
  if (authoritative.error) return authoritative

  const serialization = serializePrompt(validatedDoc.doc, authoritative.mediaList)
  const request = buildArkRequest({
    doc: validatedDoc.doc,
    mediaList: authoritative.mediaList,
    config: validatedConfig.value,
    model: config.arkModel,
  })
  const submissionBlockers = validateRealSubmission({
    serialization,
    runtime: {
      ...config,
      realGenerationEnabled: true,
      arkApiKey: 'runtime-gate-validated',
    },
  })
  return {
    config: validatedConfig.value,
    doc: validatedDoc.doc,
    mediaList: authoritative.mediaList,
    serialization,
    request,
    blockers: [...getRuntimeBlockers(config), ...submissionBlockers],
    confirmationHash: createConfirmationHash(request, validatedConfig.value.count),
  }
}

export function createVideoGenerationRouter({
  config,
  arkClient,
  mediaStore,
  confirmationStore,
}) {
  const router = Router()
  const maxUploadBytes = Number.isInteger(config.maxUploadBytes) && config.maxUploadBytes > 0
    ? config.maxUploadBytes
    : MAX_UPLOAD_BYTES
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxUploadBytes, files: 1 },
  })

  router.post('/uploadReference', upload.single('file'), async (req, res, next) => {
    try {
      if (!req.file) return fail(res, 40002, '请选择要上传的参考图片')
      const media = await mediaStore.save(req.file)
      return ok(res, media, '参考素材上传成功')
    } catch (error) {
      if (error instanceof MediaStoreError) {
        return fail(res, 40003, error.message, { reason: error.code })
      }
      return next(error)
    }
  })

  router.post('/deleteReference', async (req, res, next) => {
    const mediaId = req.body?.mediaId
    try {
      const removed = await mediaStore.remove(mediaId)
      return ok(
        res,
        { mediaId, removed },
        removed ? '参考素材已删除' : '参考素材已不存在',
      )
    } catch (error) {
      if (error instanceof MediaStoreError) {
        return fail(res, 40005, error.message, { reason: error.code })
      }
      return next(error)
    }
  })

  router.post('/dryRun', async (req, res, next) => {
    const body = req.body || {}
    try {
      const prepared = await prepareSubmission(body, config, mediaStore)
      if (prepared.error) {
        return fail(res, 40006, 'Dry-run 请求参数无效', prepared.error)
      }

      // 保留依赖可见性，便于迁移时理解边界；Dry-run 绝不调用 Ark。
      void arkClient
      void confirmationStore

      return ok(res, {
        serialization: prepared.serialization,
        request: prepared.request,
        blockers: prepared.blockers,
        realReady: prepared.blockers.length === 0,
        confirmationToken: prepared.blockers.length === 0
          ? confirmationStore?.issue(prepared.confirmationHash) || ''
          : '',
      }, 'Dry-run 校验成功')
    } catch (error) {
      return next(error)
    }
  })

  router.post('/createTask', async (req, res, next) => {
    try {
      const prepared = await prepareSubmission(req.body || {}, config, mediaStore)
      if (prepared.error) {
        return fail(res, 40007, '真实生成请求参数无效', prepared.error)
      }
      if (prepared.blockers.length > 0) {
        return fail(
          res,
          40301,
          '真实生成条件不满足',
          { blockers: prepared.blockers },
          403,
        )
      }
      const confirmed = confirmationStore?.consume(
        req.body?.confirmationToken,
        prepared.confirmationHash,
      )
      if (!confirmed) return fail(res, 40901, '确认凭证无效或已过期', {}, 409)

      const taskIds = []
      for (let index = 0; index < prepared.config.count; index += 1) {
        try {
          const task = await arkClient.createTask(prepared.request)
          const taskId = task?.id || task?.task_id
          if (typeof taskId !== 'string' || !taskId) {
            throw {
              status: 502,
              code: 'ARK_INVALID_RESPONSE',
              message: 'Ark 创建任务响应缺少任务 ID',
              requestId: '',
            }
          }
          taskIds.push(taskId)
        } catch (error) {
          return fail(res, 50201, 'Ark 创建任务失败', {
            taskIds,
            error: normalizeArkError(error, config.arkApiKey),
          }, 502)
        }
      }
      return ok(res, {
        taskIds,
        count: taskIds.length,
      }, '视频生成任务已创建')
    } catch (error) {
      return next(error)
    }
  })

  router.get('/getTask', async (req, res) => {
    try {
      const runtimeBlockers = getRuntimeBlockers(config)
      if (runtimeBlockers.length > 0) return failRuntimeGate(res, runtimeBlockers)
      const taskId = req.query.taskId
      if (typeof taskId !== 'string' || !TASK_ID_PATTERN.test(taskId)) {
        return fail(res, 40008, '任务 ID 格式无效', { reason: 'INVALID_TASK_ID' })
      }
      const task = await arkClient.getTask(taskId)
      return ok(res, task, '任务状态查询成功')
    } catch (error) {
      return fail(res, 50202, 'Ark 任务查询失败', {
        error: normalizeArkError(error, config.arkApiKey),
      }, 502)
    }
  })

  router.post('/deleteTask', async (req, res) => {
    try {
      const runtimeBlockers = getRuntimeBlockers(config)
      if (runtimeBlockers.length > 0) return failRuntimeGate(res, runtimeBlockers)
      const taskId = req.body?.taskId
      if (typeof taskId !== 'string' || !TASK_ID_PATTERN.test(taskId)) {
        return fail(res, 40008, '任务 ID 格式无效', { reason: 'INVALID_TASK_ID' })
      }
      const task = await arkClient.deleteTask(taskId)
      return ok(res, task, '任务删除成功')
    } catch (error) {
      return fail(res, 50203, 'Ark 任务删除失败', {
        error: normalizeArkError(error, config.arkApiKey),
      }, 502)
    }
  })

  return router
}

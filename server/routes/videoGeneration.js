import { Router } from 'express'
import multer from 'multer'

import {
  buildArkRequest,
  serializePrompt,
  validateRealSubmission,
} from '../../src/view/videoGeneration/utils/requestBuilder.js'
import { MAX_UPLOAD_BYTES, MediaStoreError } from '../media/store.js'

export const ok = (res, data, msg = '操作成功') => res.json({ code: 0, data, msg })

export const fail = (res, code, msg, data = {}, status = 400) => (
  res.status(status).json({ code, data, msg })
)

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const RATIOS = new Set(['adaptive', '21:9', '16:9', '4:3', '1:1', '3:4', '9:16'])
const RESOLUTIONS = new Set(['480p', '720p', '1080p', '4k'])

function validateGenerationConfig(value) {
  const errors = []
  const add = (path, message) => errors.push({ path, message })
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { error: { reason: 'INVALID_CONFIG', errors: [{ path: 'config', message: '必须是对象' }] } }
  }

  if (value.mode !== 'reference_media') add('config.mode', '仅支持 reference_media')
  if (!RATIOS.has(value.ratio)) add('config.ratio', '比例不在允许范围内')
  if (!RESOLUTIONS.has(value.resolution)) add('config.resolution', '分辨率不在允许范围内')
  if (!Number.isInteger(value.duration) || value.duration < 4 || value.duration > 15) {
    add('config.duration', '时长必须是 4 到 15 的整数')
  }
  if (!Number.isInteger(value.count) || value.count < 1 || value.count > 8) {
    add('config.count', '数量必须是 1 到 8 的整数')
  }
  if (typeof value.generateAudio !== 'boolean') {
    add('config.generateAudio', '必须是布尔值')
  }

  if (errors.length > 0) return { error: { reason: 'INVALID_CONFIG', errors } }
  return {
    config: {
      mode: value.mode,
      ratio: value.ratio,
      resolution: value.resolution,
      duration: value.duration,
      count: value.count,
      generateAudio: value.generateAudio,
    },
  }
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

export function createVideoGenerationRouter({ config, arkClient, mediaStore }) {
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
      const validatedConfig = validateGenerationConfig(body.config)
      if (validatedConfig.error) {
        return fail(res, 40006, 'Dry-run 请求参数无效', validatedConfig.error)
      }
      const validatedDoc = validateEditorDoc(body.doc)
      if (validatedDoc.error) {
        return fail(res, 40006, 'Dry-run 请求参数无效', validatedDoc.error)
      }
      const authoritative = await resolveAuthoritativeMedia(body.mediaList, mediaStore)
      if (authoritative.error) {
        return fail(res, 40006, 'Dry-run 请求参数无效', authoritative.error)
      }
      const serialization = serializePrompt(validatedDoc.doc, authoritative.mediaList)
      const request = buildArkRequest({
        doc: validatedDoc.doc,
        mediaList: authoritative.mediaList,
        config: validatedConfig.config,
        model: config.arkModel,
      })
      const blockers = validateRealSubmission({ serialization, runtime: config })

      // Keep this dependency visible for Task 5. Dry-run never invokes Ark.
      void arkClient

      return ok(res, {
        serialization,
        request,
        blockers,
        realReady: blockers.length === 0,
        confirmationToken: '',
      }, 'Dry-run 校验成功')
    } catch (error) {
      return next(error)
    }
  })

  return router
}

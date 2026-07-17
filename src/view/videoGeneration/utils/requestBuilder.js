import { pickArkRequestOptions } from '../domain/arkVideoContract.js'

const TOKEN_BY_KIND = {
  image: '图片',
  video: '视频',
  audio: '音频',
}

function walkNodes(node, visitor) {
  if (!node || typeof node !== 'object') return

  visitor(node)
  if (!Array.isArray(node.content)) return

  for (const child of node.content) {
    walkNodes(child, visitor)
  }
}

function resolveMediaUrl(item) {
  if (item.assetId) return `asset://${item.assetId}`
  if (item.remoteUrl) return item.remoteUrl
  return `local://${item.id}`
}

function serializeMedia(item, index) {
  const url = resolveMediaUrl(item)
  return {
    ...item,
    canonicalIndex: index + 1,
    url,
    notPublic: url.startsWith('local://'),
  }
}

function isPublicMediaUrl(url) {
  return /^asset:\/\/[^\s]+$/.test(url) || /^https:\/\/[^\s]+$/.test(url)
}

function isValidMediaId(mediaId) {
  return typeof mediaId === 'string' && mediaId.trim().length > 0
}

function collectMediaMetadataErrors(mediaList) {
  const errors = []
  const seenIds = new Set()
  const seenRealIndexes = new Set()

  mediaList.forEach((item, index) => {
    const validId = isValidMediaId(item.id)
    const validRealIndex = Number.isInteger(item.realIndex) && item.realIndex > 0
    const duplicateId = validId && seenIds.has(item.id)

    if (!validId) {
      errors.push({
        code: 'INVALID_MEDIA_ID',
        path: `mediaList[${index}].id`,
        mediaId: item.id,
        message: `素材 ID 必须是非空字符串：mediaList[${index}].id`,
      })
    } else if (duplicateId) {
      errors.push({
        code: 'DUPLICATE_MEDIA_ID',
        path: `mediaList[${index}].id`,
        mediaId: item.id,
        message: `素材 ID 重复：${item.id}`,
      })
    } else {
      seenIds.add(item.id)
    }

    if (item.kind !== 'image') {
      errors.push({
        code: 'UNSUPPORTED_MEDIA_KIND',
        path: `mediaList[${index}].kind`,
        mediaId: item.id,
        message: `仅支持图片参考素材：${item.id}`,
      })
    }

    if (!validRealIndex) {
      errors.push({
        code: 'INVALID_MEDIA_REAL_INDEX',
        path: `mediaList[${index}].realIndex`,
        mediaId: item.id,
        message: `素材 realIndex 必须是正整数：${item.id}`,
      })
    } else if (validId && !duplicateId && seenRealIndexes.has(item.realIndex)) {
      errors.push({
        code: 'DUPLICATE_MEDIA_REAL_INDEX',
        path: `mediaList[${index}].realIndex`,
        mediaId: item.id,
        realIndex: item.realIndex,
        message: `素材 realIndex 重复：${item.realIndex}`,
      })
    } else if (validId && !duplicateId) {
      seenRealIndexes.add(item.realIndex)
    }
  })

  return errors
}

export function collectCanonicalMedia(doc, mediaList) {
  const list = Array.isArray(mediaList) ? mediaList : []
  const byId = new Map()
  for (const item of list) {
    if (isValidMediaId(item.id) && !byId.has(item.id)) byId.set(item.id, item)
  }
  const ordered = []
  const seen = new Set()

  walkNodes(doc, (node) => {
    if (node.type !== 'mediaMention') return

    const item = byId.get(node.attrs?.mediaId)
    if (item && !seen.has(item.id)) {
      seen.add(item.id)
      ordered.push(item)
    }
  })

  for (const item of list) {
    if (isValidMediaId(item.id) && !seen.has(item.id)) {
      seen.add(item.id)
      ordered.push(item)
    }
  }

  return ordered
}

export function serializePrompt(doc, mediaList) {
  const list = Array.isArray(mediaList) ? mediaList : []
  const canonicalMedia = collectCanonicalMedia(doc, list)
  const canonicalIndexById = new Map(
    canonicalMedia.map((item, index) => [item.id, index + 1]),
  )
  const mediaById = new Map(canonicalMedia.map((item) => [item.id, item]))
  const prompts = {
    readablePrompt: '',
    templatePrompt: '',
    modelPrompt: '',
  }
  const missingMedia = []
  const missingMediaKeys = new Set()
  let paragraphCount = 0
  let mentionCount = 0

  const appendToPrompts = (value) => {
    prompts.readablePrompt += value
    prompts.templatePrompt += value
    prompts.modelPrompt += value
  }

  walkNodes(doc, (node) => {
    if (node.type === 'paragraph') {
      if (paragraphCount > 0) appendToPrompts('\n')
      paragraphCount += 1
      return
    }

    if (node.type === 'hardBreak') {
      appendToPrompts('\n')
      return
    }

    if (node.type === 'text') {
      appendToPrompts(node.text || '')
      return
    }

    if (node.type !== 'mediaMention') return

    const mentionIndex = mentionCount
    mentionCount += 1
    const mediaId = node.attrs?.mediaId
    const media = isValidMediaId(mediaId) ? mediaById.get(mediaId) : undefined
    const canonicalIndex = isValidMediaId(mediaId) ? canonicalIndexById.get(mediaId) : undefined
    if (!media || !canonicalIndex) {
      const attrs = node.attrs || {}
      const token = TOKEN_BY_KIND[attrs.kind] || attrs.kind || '素材'
      const sourceLabel = attrs.sourceLabel || `${token}${attrs.realIndex ?? ''}`
      appendToPrompts(`@${sourceLabel}`)

      const path = `doc.mediaMention[${mentionIndex}].attrs.mediaId`
      const missingKey = isValidMediaId(mediaId) ? `id:${mediaId}` : `path:${path}`
      if (!missingMediaKeys.has(missingKey)) {
        missingMediaKeys.add(missingKey)
        missingMedia.push({
          mediaId,
          kind: attrs.kind,
          sourceLabel,
          realIndex: attrs.realIndex,
          path,
        })
      }
      return
    }

    const kind = media.kind
    const token = TOKEN_BY_KIND[kind] || kind
    const realIndex = media.realIndex
    const sourceLabel = `${token}${realIndex}`

    prompts.readablePrompt += `@${sourceLabel}`
    prompts.templatePrompt += `<<<${kind}_${canonicalIndex}_${realIndex}>>>`
    prompts.modelPrompt += `【${token} ${canonicalIndex}】`
  })

  return {
    ...prompts,
    media: canonicalMedia.map(serializeMedia),
    missingMedia,
    errors: [
      ...collectMediaMetadataErrors(list),
      ...missingMedia.map((item) => ({
        code: 'MISSING_MEDIA',
        path: item.path,
        mediaId: item.mediaId,
        message: `引用的素材不存在：${item.sourceLabel}`,
      })),
    ],
  }
}

export function buildArkRequest({ doc, mediaList, config, model }) {
  const serialization = serializePrompt(doc, mediaList)

  return {
    model,
    content: [
      ...(serialization.modelPrompt.trim()
        ? [{ type: 'text', text: serialization.modelPrompt }]
        : []),
      ...serialization.media.map((item) => ({
        type: 'image_url',
        role: 'reference_image',
        image_url: { url: item.url },
      })),
    ],
    ...pickArkRequestOptions(config),
  }
}

export function validateRealSubmission({ serialization, runtime }) {
  const blockers = []
  const blockerKeys = new Set()
  const addBlocker = (blocker) => {
    if (!blocker || typeof blocker.code !== 'string') return

    const copy = { ...blocker }
    const key = JSON.stringify([
      copy.code,
      copy.path || '',
      copy.mediaId || '',
      copy.status ?? '',
    ])
    if (blockerKeys.has(key)) return

    blockerKeys.add(key)
    blockers.push(copy)
  }

  if (!runtime?.realGenerationEnabled) {
    addBlocker({
      code: 'REAL_GENERATION_DISABLED',
      message: '真实生成未启用',
    })
  }

  if (typeof runtime?.arkApiKey !== 'string' || !runtime.arkApiKey.trim()) {
    addBlocker({
      code: 'ARK_API_KEY_MISSING',
      message: '服务端未配置 ARK_API_KEY',
    })
  }

  if (serialization?.media?.length > 9) {
    addBlocker({
      code: 'REFERENCE_IMAGE_COUNT',
      message: '参考图片数量不能超过 9 张',
    })
  }

  if (!serialization?.modelPrompt?.trim() && !(serialization?.media?.length > 0)) {
    addBlocker({
      code: 'EMPTY_CONTENT',
      message: '请填写提示词或添加参考内容',
    })
  }

  for (const error of serialization?.errors || []) addBlocker(error)

  for (const item of serialization?.media || []) {
    if (item.status !== 'ready') {
      addBlocker({
        code: 'MEDIA_NOT_READY',
        mediaId: item.id,
        status: item.status,
        message: `参考素材尚未就绪：${item.name || item.id}`,
      })
    }

    if (item.notPublic || !isPublicMediaUrl(item.url)) {
      addBlocker({
        code: 'MEDIA_NOT_PUBLIC',
        mediaId: item.id,
        message: `参考素材不是可公开访问的 HTTPS URL 或 Ark 资产：${item.name || item.id}`,
      })
    }
  }

  return blockers
}

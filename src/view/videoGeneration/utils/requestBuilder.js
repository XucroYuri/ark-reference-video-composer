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

export function collectCanonicalMedia(doc, mediaList) {
  const list = Array.isArray(mediaList) ? mediaList : []
  const byId = new Map(list.map((item) => [item.id, item]))
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
    if (!seen.has(item.id)) {
      seen.add(item.id)
      ordered.push(item)
    }
  }

  return ordered
}

export function serializePrompt(doc, mediaList) {
  const canonicalMedia = collectCanonicalMedia(doc, mediaList)
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
  const missingMediaIds = new Set()
  let paragraphCount = 0

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

    const media = mediaById.get(node.attrs?.mediaId)
    const canonicalIndex = canonicalIndexById.get(node.attrs?.mediaId)
    if (!media || !canonicalIndex) {
      const attrs = node.attrs || {}
      const token = TOKEN_BY_KIND[attrs.kind] || attrs.kind || '素材'
      const sourceLabel = attrs.sourceLabel || `${token}${attrs.realIndex ?? ''}`
      appendToPrompts(`@${sourceLabel}`)

      if (!missingMediaIds.has(attrs.mediaId)) {
        missingMediaIds.add(attrs.mediaId)
        missingMedia.push({
          mediaId: attrs.mediaId,
          kind: attrs.kind,
          sourceLabel,
          realIndex: attrs.realIndex,
        })
      }
      return
    }

    const kind = media.kind || node.attrs?.kind
    const token = TOKEN_BY_KIND[kind] || kind
    const realIndex = media.realIndex ?? node.attrs?.realIndex
    const sourceLabel = node.attrs?.sourceLabel || `${token}${realIndex}`

    prompts.readablePrompt += `@${sourceLabel}`
    prompts.templatePrompt += `<<<${kind}_${canonicalIndex}_${realIndex}>>>`
    prompts.modelPrompt += `【${token} ${canonicalIndex}】`
  })

  return {
    ...prompts,
    media: canonicalMedia.map(serializeMedia),
    missingMedia,
    errors: missingMedia.map((item) => ({
      code: 'MISSING_MEDIA',
      mediaId: item.mediaId,
      message: `引用的素材不存在：${item.sourceLabel}`,
    })),
  }
}

export function buildArkRequest({ doc, mediaList, config, model }) {
  const serialization = serializePrompt(doc, mediaList)

  return {
    model,
    content: [
      { type: 'text', text: serialization.modelPrompt },
      ...serialization.media.map((item) => ({
        type: 'image_url',
        role: 'reference_image',
        image_url: { url: item.url },
      })),
    ],
    ratio: config.ratio,
    resolution: config.resolution,
    duration: config.duration,
    generate_audio: config.generateAudio,
  }
}

export function validateRealSubmission({ serialization, runtime }) {
  const blockers = []

  if (!runtime?.realGenerationEnabled) {
    blockers.push({
      code: 'REAL_GENERATION_DISABLED',
      message: '真实生成未启用',
    })
  }

  if (!runtime?.arkApiKey) {
    blockers.push({
      code: 'ARK_API_KEY_MISSING',
      message: '服务端未配置 ARK_API_KEY',
    })
  }

  if (!serialization?.modelPrompt?.trim() && !(serialization?.media?.length > 0)) {
    blockers.push({
      code: 'EMPTY_CONTENT',
      message: '请填写提示词或添加参考内容',
    })
  }

  blockers.push(...(serialization?.errors || []))

  for (const item of serialization?.media || []) {
    if (item.notPublic || !isPublicMediaUrl(item.url)) {
      blockers.push({
        code: 'MEDIA_NOT_PUBLIC',
        mediaId: item.id,
        message: `参考素材不是可公开访问的 HTTPS URL 或 Ark 资产：${item.name || item.id}`,
      })
    }
  }

  return blockers
}

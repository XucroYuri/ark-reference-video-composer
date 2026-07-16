import { Extension, mergeAttributes, Node } from '@tiptap/core'
import { Fragment, Slice } from '@tiptap/pm/model'
import { Plugin } from '@tiptap/pm/state'

export function isValidMediaMentionAttrs(attrs) {
  return Boolean(
    attrs
    && typeof attrs.mediaId === 'string'
    && attrs.mediaId.trim()
    && attrs.kind === 'image'
    && typeof attrs.sourceLabel === 'string'
    && attrs.sourceLabel.trim()
    && Number.isInteger(attrs.realIndex)
    && attrs.realIndex > 0,
  )
}

function readMentionAttributes(element) {
  const attrs = {
    mediaId: element.getAttribute('data-media-id'),
    kind: element.getAttribute('data-kind'),
    sourceLabel: element.getAttribute('data-source-label'),
    realIndex: Number(element.getAttribute('data-real-index')),
  }

  return isValidMediaMentionAttrs(attrs) ? attrs : false
}

function createCanonicalMediaMap(mediaList) {
  const candidates = (Array.isArray(mediaList) ? mediaList : [])
    .filter((media) => (
      typeof media?.id === 'string'
      && media.id.trim()
      && media.kind === 'image'
      && media.status === 'ready'
      && Number.isInteger(media.realIndex)
      && media.realIndex > 0
    ))
  const identityCounts = new Map()
  const indexCounts = new Map()
  for (const media of candidates) {
    const id = media.id.trim()
    identityCounts.set(id, (identityCounts.get(id) || 0) + 1)
    indexCounts.set(media.realIndex, (indexCounts.get(media.realIndex) || 0) + 1)
  }

  return new Map(candidates
    .filter((media) => identityCounts.get(media.id.trim()) === 1)
    .filter((media) => indexCounts.get(media.realIndex) === 1)
    .map((media) => [media.id.trim(), media]))
}

function isCanonicalMention(attrs, mediaById) {
  if (!isValidMediaMentionAttrs(attrs)) return false
  const media = mediaById.get(attrs.mediaId.trim())
  return Boolean(
    media
    && attrs.mediaId === media.id.trim()
    && attrs.kind === media.kind
    && attrs.realIndex === media.realIndex
    && attrs.sourceLabel === `图片${media.realIndex}`,
  )
}

export function isCurrentMediaMention(attrs, mediaList) {
  return isCanonicalMention(attrs, createCanonicalMediaMap(mediaList))
}

export function pruneMediaMentionDoc(doc, mediaList) {
  const mediaById = createCanonicalMediaMap(mediaList)
  const visit = (node) => {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return node
    if (node.type === 'mediaMention') {
      return isCanonicalMention(node.attrs, mediaById) ? { ...node, attrs: { ...node.attrs } } : null
    }

    const copy = { ...node }
    if (Array.isArray(node.content)) {
      copy.content = node.content.map(visit).filter((child) => child !== null)
      if (!copy.content.length) delete copy.content
    }
    return copy
  }

  return visit(doc)
}

function sanitizePastedNode(node, schema, mediaById) {
  if (node.type.name === 'mediaMention') {
    if (isCanonicalMention(node.attrs, mediaById)) return node
    const label = typeof node.attrs?.sourceLabel === 'string' ? node.attrs.sourceLabel.trim() : ''
    return label ? schema.text(`@${label}`) : null
  }
  if (!node.content.size) return node

  const children = []
  node.content.forEach((child) => {
    const sanitized = sanitizePastedNode(child, schema, mediaById)
    if (sanitized) children.push(sanitized)
  })
  return node.copy(Fragment.fromArray(children))
}

export function sanitizeMediaMentionSlice(slice, mediaList) {
  if (!(slice instanceof Slice)) return slice
  const mediaById = createCanonicalMediaMap(mediaList)
  const children = []
  slice.content.forEach((node) => {
    const sanitized = sanitizePastedNode(node, node.type.schema, mediaById)
    if (sanitized) children.push(sanitized)
  })
  return new Slice(Fragment.fromArray(children), slice.openStart, slice.openEnd)
}

export function createMediaPasteGuard({ getMediaList } = {}) {
  const readMediaList = typeof getMediaList === 'function' ? getMediaList : () => []
  return Extension.create({
    name: 'mediaPasteGuard',
    addProseMirrorPlugins() {
      return [new Plugin({
        props: {
          transformPasted: (slice) => sanitizeMediaMentionSlice(slice, readMediaList()),
        },
      })]
    },
  })
}

export const MediaMention = Node.create({
  name: 'mediaMention',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      mediaId: { default: null, rendered: false },
      kind: { default: null, rendered: false },
      sourceLabel: { default: null, rendered: false },
      realIndex: { default: null, rendered: false },
      previewUrl: { default: null, rendered: false },
    }
  },

  parseHTML() {
    return [{
      tag: 'span[data-type="media-mention"]',
      getAttrs: readMentionAttributes,
    }]
  },

  renderHTML({ HTMLAttributes, node }) {
    const attrs = {
      mediaId: node.attrs.mediaId,
      kind: node.attrs.kind,
      sourceLabel: node.attrs.sourceLabel,
      realIndex: node.attrs.realIndex,
    }
    const label = isValidMediaMentionAttrs(attrs) ? attrs.sourceLabel : ''
    const previewUrl = typeof node.attrs.previewUrl === 'string' ? node.attrs.previewUrl : ''

    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'media-mention',
        'data-media-id': attrs.mediaId || '',
        'data-kind': attrs.kind || '',
        'data-source-label': label,
        'data-real-index': Number.isInteger(attrs.realIndex) ? String(attrs.realIndex) : '',
        class: 'media-mention',
      }),
      [
        'span',
        { class: 'media-mention-pill' },
        previewUrl
          ? ['img', { class: 'media-mention-thumbnail', src: previewUrl, alt: '' }]
          : ['span', { class: 'media-mention-thumbnail is-empty' }],
        ['span', { class: 'media-mention-label' }, `@${label}`],
      ],
    ]
  },

  renderText({ node }) {
    return isValidMediaMentionAttrs(node.attrs) ? `@${node.attrs.sourceLabel}` : ''
  },
})

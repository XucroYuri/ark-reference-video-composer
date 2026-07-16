import { randomUUID } from 'node:crypto'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'

export const MAX_UPLOAD_BYTES = 30 * 1024 * 1024

const EXTENSION_BY_MIME = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export class MediaStoreError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'MediaStoreError'
    this.code = code
  }
}

function publicBaseUrl(value) {
  if (!value) return ''

  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:' ? parsed.href.replace(/\/$/, '') : ''
  } catch {
    return ''
  }
}

function safeOriginalName(value, fallback) {
  const portablePath = typeof value === 'string' ? value.replaceAll('\\', '/') : ''
  const name = basename(portablePath).trim()
  return name ? name.slice(0, 255) : fallback
}

function assertMediaId(id) {
  if (!UUID_PATTERN.test(id || '')) {
    throw new MediaStoreError('INVALID_MEDIA_ID', '素材 ID 格式无效')
  }
}

function detectMediaMime(buffer) {
  if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return 'image/png'
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg'
  }
  if (
    buffer.length >= 12
    && buffer.toString('ascii', 0, 4) === 'RIFF'
    && buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp'
  }
  return ''
}

function hasCompleteImageStructure(buffer, mimeType) {
  if (mimeType === 'image/png') {
    const iend = Buffer.from([0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130])
    return buffer.length >= 33
      && buffer.toString('ascii', 12, 16) === 'IHDR'
      && buffer.subarray(-iend.length).equals(iend)
  }

  if (mimeType === 'image/jpeg') {
    return buffer.length >= 4
      && buffer[buffer.length - 2] === 0xff
      && buffer[buffer.length - 1] === 0xd9
  }

  if (mimeType === 'image/webp') {
    const chunkType = buffer.toString('ascii', 12, 16)
    return buffer.length >= 20
      && ['VP8 ', 'VP8L', 'VP8X'].includes(chunkType)
      && buffer.readUInt32LE(4) + 8 === buffer.length
  }

  return false
}

export function createMediaStore({
  uploadDir,
  publicBaseUrl: configuredPublicBaseUrl = '',
  idFactory = randomUUID,
  maxBytes = MAX_UPLOAD_BYTES,
}) {
  if (!uploadDir) throw new TypeError('uploadDir is required')

  const mediaById = new Map()
  const remoteBaseUrl = publicBaseUrl(configuredPublicBaseUrl)

  async function save(file) {
    const mimeType = file?.mimetype
    const extension = EXTENSION_BY_MIME[mimeType]
    if (!extension) {
      throw new MediaStoreError('UNSUPPORTED_MEDIA_TYPE', '仅支持 PNG、JPEG 或 WebP 图片')
    }

    const buffer = file?.buffer
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      throw new MediaStoreError('EMPTY_MEDIA_FILE', '上传文件不能为空')
    }
    if (buffer.length > maxBytes) {
      throw new MediaStoreError('MEDIA_TOO_LARGE', '上传文件不能超过 30MB')
    }
    if (detectMediaMime(buffer) !== mimeType) {
      throw new MediaStoreError('MEDIA_SIGNATURE_MISMATCH', '文件内容与声明的图片类型不一致')
    }
    if (!hasCompleteImageStructure(buffer, mimeType)) {
      throw new MediaStoreError('TRUNCATED_MEDIA_FILE', '图片文件不完整或已截断')
    }

    const id = idFactory()
    assertMediaId(id)
    const filename = `${id}${extension}`
    const previewUrl = `/uploads/${filename}`
    const record = {
      id,
      kind: 'image',
      name: safeOriginalName(file.originalname, filename),
      mimeType,
      size: buffer.length,
      status: 'ready',
      previewUrl,
      ...(remoteBaseUrl ? { remoteUrl: `${remoteBaseUrl}${previewUrl}` } : {}),
    }

    await mkdir(uploadDir, { recursive: true })
    await writeFile(join(uploadDir, filename), buffer, { flag: 'wx' })
    mediaById.set(id, { ...record, filename })
    return record
  }

  function get(id) {
    assertMediaId(id)
    const record = mediaById.get(id)
    if (!record) return null
    const publicRecord = { ...record }
    delete publicRecord.filename
    return publicRecord
  }

  function list() {
    return [...mediaById.keys()].map(get)
  }

  async function remove(id) {
    assertMediaId(id)
    const record = mediaById.get(id)
    if (!record) return false

    await unlink(join(uploadDir, record.filename)).catch((error) => {
      if (error?.code !== 'ENOENT') throw error
    })
    mediaById.delete(id)
    return true
  }

  return { save, get, list, remove }
}

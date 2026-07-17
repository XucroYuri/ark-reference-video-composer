import { randomUUID } from 'node:crypto'
import {
  constants,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { lstat, open, rename, unlink, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { isIP } from 'node:net'

import sharp from 'sharp'

import { normalizeRemoteMediaUrl, RemoteMediaUrlError } from './remoteUrl.js'

export const MAX_UPLOAD_BYTES = 30 * 1024 * 1024

const EXTENSION_BY_MIME = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const INDEX_FILENAME = '.media-index.json'
const ORPHAN_PATTERN = /^([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.(png|jpg|webp)$/i
const MIN_DIMENSION = 300
const MAX_DIMENSION = 6000
const MIN_ASPECT_RATIO = 0.4
const MAX_ASPECT_RATIO = 2.5
const MAX_INPUT_PIXELS = 16_777_216
const SHARP_FORMAT_BY_MIME = {
  'image/png': 'png',
  'image/jpeg': 'jpeg',
  'image/webp': 'webp',
}

export class MediaStoreError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'MediaStoreError'
    this.code = code
  }
}

function isPublicHostname(hostname) {
  const normalized = hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase()
  if (!normalized || normalized === 'localhost' || normalized.endsWith('.localhost')) return false
  if (normalized.endsWith('.local')) return false

  return isIP(normalized) === 0
}

export function buildPublicMediaUrl(baseUrl, filename) {
  if (!baseUrl || !filename) return ''

  try {
    const parsed = new URL(baseUrl)
    if (
      parsed.protocol !== 'https:'
      || parsed.username
      || parsed.password
      || parsed.search
      || parsed.hash
      || !isPublicHostname(parsed.hostname)
    ) {
      return ''
    }

    const normalizedPath = parsed.pathname.replace(/\/{2,}/g, '/').replace(/\/$/, '')
    parsed.pathname = `${normalizedPath}/uploads/${encodeURIComponent(filename)}`
    return parsed.toString()
  } catch {
    return ''
  }
}

function decodeMultipartFilename(value) {
  if (typeof value !== 'string' || !value) return ''
  // Multer/busboy 在部分运行时会把 multipart 文件名按 latin1 暴露。
  // 这里只在 UTF-8 解码结果可靠时修正中文文件名，避免破坏正常 ASCII 名称。
  const decoded = Buffer.from(value, 'latin1').toString('utf8')
  return decoded && !decoded.includes('\uFFFD') ? decoded : value
}

function safeOriginalName(value, fallback) {
  const normalized = decodeMultipartFilename(value)
  const portablePath = normalized.replaceAll('\\', '/')
  const name = basename(portablePath).trim()
  return name ? name.slice(0, 255) : fallback
}

function assertMediaId(id) {
  if (!UUID_PATTERN.test(id || '')) {
    throw new MediaStoreError('INVALID_MEDIA_ID', '素材 ID 格式无效')
  }
}

function toPublicRecord(record, configuredPublicBaseUrl) {
  const publicRecord = { ...record }
  delete publicRecord.filename
  if (record.source === 'upload') {
    const remoteUrl = buildPublicMediaUrl(configuredPublicBaseUrl, record.filename)
    if (remoteUrl) publicRecord.remoteUrl = remoteUrl
  }
  return publicRecord
}

function normalizeStoredRecord(record, uploadDir) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return false
  if (!UUID_PATTERN.test(record.id || '')) return false
  if (record.kind !== 'image' || record.status !== 'ready') return false
  if (typeof record.name !== 'string' || !record.name) return false

  if (record.source === 'remote_url') {
    if (record.filename !== undefined) return false
    if (typeof record.remoteUrl !== 'string' || record.previewUrl !== record.remoteUrl) return false
    try {
      if (normalizeRemoteMediaUrl(record.remoteUrl) !== record.remoteUrl) return false
    } catch {
      return false
    }
    return { record, migrated: false }
  }

  const isLegacyUpload = record.source === undefined
  if (!isLegacyUpload && record.source !== 'upload') return false
  const extension = EXTENSION_BY_MIME[record.mimeType]
  if (!extension || record.filename !== `${record.id}${extension}`) return false
  if (record.previewUrl !== `/uploads/${record.filename}`) return false
  if (!Number.isInteger(record.size) || record.size <= 0) return false

  try {
    if (!statSync(join(uploadDir, record.filename)).isFile()) return false
  } catch {
    return false
  }
  return {
    record: isLegacyUpload ? { ...record, source: 'upload' } : record,
    migrated: isLegacyUpload,
  }
}

function serializeIndex(mediaById) {
  return `${JSON.stringify({ version: 1, media: [...mediaById.values()] }, null, 2)}\n`
}

function writeIndexSync(indexPath, mediaById) {
  const temporaryPath = `${indexPath}.${randomUUID()}.tmp`
  writeFileSync(temporaryPath, serializeIndex(mediaById), { flag: 'wx', mode: 0o600 })
  renameSync(temporaryPath, indexPath)
}

function hydrateIndex(uploadDir, indexPath) {
  const mediaById = new Map()
  let needsRewrite = false
  if (existsSync(indexPath)) {
    let parsed
    try {
      parsed = JSON.parse(readFileSync(indexPath, 'utf8'))
    } catch {
      throw new MediaStoreError('MEDIA_INDEX_CORRUPT', '本地素材索引已损坏')
    }
    if (parsed?.version !== 1 || !Array.isArray(parsed.media)) {
      throw new MediaStoreError('MEDIA_INDEX_CORRUPT', '本地素材索引格式无效')
    }
    for (const record of parsed.media) {
      const normalized = normalizeStoredRecord(record, uploadDir)
      if (!normalized || mediaById.has(record.id)) {
        needsRewrite = true
        continue
      }
      mediaById.set(record.id, normalized.record)
      if (normalized.migrated) needsRewrite = true
    }
  }

  const knownFilenames = new Set(
    [...mediaById.values()]
      .filter((record) => record.source === 'upload')
      .map((record) => record.filename),
  )
  for (const filename of readdirSync(uploadDir)) {
    const isTemporaryIndex = filename.startsWith(`${INDEX_FILENAME}.`) && filename.endsWith('.tmp')
    const isOrphan = ORPHAN_PATTERN.test(filename) && !knownFilenames.has(filename)
    if (isTemporaryIndex || isOrphan) {
      unlinkSync(join(uploadDir, filename))
      needsRewrite = true
    }
  }

  if (needsRewrite || !existsSync(indexPath)) writeIndexSync(indexPath, mediaById)
  return mediaById
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

async function validateDecodableImage(buffer, mimeType) {
  try {
    const image = sharp(buffer, {
      failOn: 'error',
      limitInputPixels: MAX_INPUT_PIXELS,
      sequentialRead: true,
    })
    const metadata = await image.metadata()
    if (metadata.format !== SHARP_FORMAT_BY_MIME[mimeType]) {
      throw new MediaStoreError('MEDIA_SIGNATURE_MISMATCH', '文件内容与声明的图片类型不一致')
    }
    if (
      !Number.isInteger(metadata.width)
      || !Number.isInteger(metadata.height)
      || metadata.width < MIN_DIMENSION
      || metadata.height < MIN_DIMENSION
      || metadata.width > MAX_DIMENSION
      || metadata.height > MAX_DIMENSION
      || metadata.width * metadata.height > MAX_INPUT_PIXELS
      || metadata.width / metadata.height < MIN_ASPECT_RATIO
      || metadata.width / metadata.height > MAX_ASPECT_RATIO
    ) {
      throw new MediaStoreError('IMAGE_DIMENSIONS_EXCEEDED', '图片尺寸或像素数量超过安全上限')
    }
    if ((metadata.pages || 1) !== 1) {
      throw new MediaStoreError('UNSUPPORTED_ANIMATED_IMAGE', '暂不支持动画图片')
    }

    await image.clone().raw().toBuffer()
    return { width: metadata.width, height: metadata.height }
  } catch (error) {
    if (error instanceof MediaStoreError) throw error
    const message = String(error?.message || '')
    if (/pixel limit|input image exceeds/i.test(message)) {
      throw new MediaStoreError('IMAGE_DIMENSIONS_EXCEEDED', '图片尺寸或像素数量超过安全上限')
    }
    throw new MediaStoreError('IMAGE_DECODE_FAILED', '图片无法完整解码')
  }
}

export function createMediaStore({
  uploadDir,
  publicBaseUrl: configuredPublicBaseUrl = '',
  idFactory = randomUUID,
  maxBytes = MAX_UPLOAD_BYTES,
}) {
  if (!uploadDir) throw new TypeError('uploadDir is required')

  mkdirSync(uploadDir, { recursive: true })
  const indexPath = join(uploadDir, INDEX_FILENAME)
  const mediaById = hydrateIndex(uploadDir, indexPath)
  let mutationQueue = Promise.resolve()

  const enqueueMutation = (operation) => {
    const result = mutationQueue.then(operation)
    mutationQueue = result.catch(() => {})
    return result
  }

  const persistIndex = async () => {
    const temporaryPath = `${indexPath}.${randomUUID()}.tmp`
    await writeFile(temporaryPath, serializeIndex(mediaById), { flag: 'wx', mode: 0o600 })
    await rename(temporaryPath, indexPath)
  }

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
    if (buffer.length >= maxBytes) {
      throw new MediaStoreError('MEDIA_TOO_LARGE', '上传文件不能超过 30MB')
    }
    if (detectMediaMime(buffer) !== mimeType) {
      throw new MediaStoreError('MEDIA_SIGNATURE_MISMATCH', '文件内容与声明的图片类型不一致')
    }
    if (!hasCompleteImageStructure(buffer, mimeType)) {
      throw new MediaStoreError('TRUNCATED_MEDIA_FILE', '图片文件不完整或已截断')
    }
    const { width, height } = await validateDecodableImage(buffer, mimeType)

    return enqueueMutation(async () => {
      const id = idFactory()
      assertMediaId(id)
      const filename = `${id}${extension}`
      const previewUrl = `/uploads/${filename}`
      const record = {
        id,
        source: 'upload',
        kind: 'image',
        name: safeOriginalName(file.originalname, filename),
        mimeType,
        size: buffer.length,
        width,
        height,
        status: 'ready',
        previewUrl,
        filename,
      }

      await writeFile(join(uploadDir, filename), buffer, { flag: 'wx' })
      mediaById.set(id, record)
      try {
        await persistIndex()
      } catch (error) {
        mediaById.delete(id)
        await unlink(join(uploadDir, filename)).catch(() => {})
        throw error
      }
      return toPublicRecord(record, configuredPublicBaseUrl)
    })
  }

  async function registerRemote({ url, name }) {
    let remoteUrl
    try {
      remoteUrl = normalizeRemoteMediaUrl(url)
    } catch (error) {
      if (error instanceof RemoteMediaUrlError) {
        throw new MediaStoreError(error.code, error.message)
      }
      throw error
    }

    return enqueueMutation(async () => {
      const id = idFactory()
      assertMediaId(id)
      const record = {
        id,
        source: 'remote_url',
        kind: 'image',
        name: safeOriginalName(name || new URL(remoteUrl).pathname, `remote-${id}`),
        previewUrl: remoteUrl,
        remoteUrl,
        status: 'ready',
      }
      mediaById.set(id, record)
      try {
        await persistIndex()
      } catch (error) {
        mediaById.delete(id)
        throw error
      }
      return { ...record }
    })
  }

  function get(id) {
    assertMediaId(id)
    const record = mediaById.get(id)
    if (!record) return null
    return toPublicRecord(record, configuredPublicBaseUrl)
  }

  function list() {
    return [...mediaById.keys()].map(get)
  }

  async function remove(id) {
    assertMediaId(id)
    return enqueueMutation(async () => {
      const record = mediaById.get(id)
      if (!record) return false

      mediaById.delete(id)
      try {
        await persistIndex()
      } catch (error) {
        mediaById.set(id, record)
        throw error
      }
      if (record.source === 'upload') {
        await unlink(join(uploadDir, record.filename)).catch((error) => {
          if (error?.code !== 'ENOENT') throw error
        })
      }
      return true
    })
  }

  async function read(filename) {
    const match = ORPHAN_PATTERN.exec(filename || '')
    const record = match ? mediaById.get(match[1]) : null
    if (!record || record.source !== 'upload' || record.filename !== filename) {
      throw new MediaStoreError('MEDIA_NOT_FOUND', '素材不存在')
    }

    const path = join(uploadDir, record.filename)
    let handle
    try {
      const before = await lstat(path)
      if (!before.isFile() || before.isSymbolicLink() || before.size !== record.size) {
        throw new MediaStoreError('MEDIA_NOT_FOUND', '素材不存在')
      }
      handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW || 0))
      const opened = await handle.stat()
      if (
        !opened.isFile()
        || opened.dev !== before.dev
        || opened.ino !== before.ino
        || opened.size !== record.size
      ) {
        throw new MediaStoreError('MEDIA_NOT_FOUND', '素材不存在')
      }

      const buffer = Buffer.alloc(record.size)
      let offset = 0
      while (offset < record.size) {
        const { bytesRead } = await handle.read(buffer, offset, record.size - offset, offset)
        if (bytesRead === 0) throw new MediaStoreError('MEDIA_NOT_FOUND', '素材不存在')
        offset += bytesRead
      }
      const after = await handle.stat()
      if (after.dev !== opened.dev || after.ino !== opened.ino || after.size !== record.size) {
        throw new MediaStoreError('MEDIA_NOT_FOUND', '素材不存在')
      }
      return { buffer, mimeType: record.mimeType }
    } catch (error) {
      if (error instanceof MediaStoreError) throw error
      if (['ENOENT', 'ELOOP', 'ENOTDIR'].includes(error?.code)) {
        throw new MediaStoreError('MEDIA_NOT_FOUND', '素材不存在')
      }
      throw error
    } finally {
      await handle?.close()
    }
  }

  return { save, registerRemote, get, list, remove, read }
}

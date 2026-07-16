// @vitest-environment node

import { access, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import sharp from 'sharp'

import { createApp } from '../app.js'
import { buildPublicMediaUrl, createMediaStore } from '../media/store.js'

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)

async function upload(baseUrl, buffer = PNG_1X1, { name = 'reference.png', type = 'image/png' } = {}) {
  const body = new FormData()
  body.append('file', new Blob([buffer], { type }), name)
  const response = await fetch(`${baseUrl}/api/videoGeneration/uploadReference`, {
    method: 'POST',
    body,
  })
  return { response, json: await response.json() }
}

describe('videoGeneration local media', () => {
  let server
  let baseUrl
  let uploadDir
  let mediaStore

  beforeEach(async () => {
    uploadDir = await mkdtemp(join(tmpdir(), 'ark-media-'))
    mediaStore = createMediaStore({ uploadDir, publicBaseUrl: '' })
    const app = createApp({
      config: {
        arkModel: 'doubao-seedance-2-0-260128',
        arkApiKey: '',
        realGenerationEnabled: false,
        uploadDir,
        maxUploadBytes: 100,
      },
      arkClient: { createTask: vi.fn(), getTask: vi.fn() },
      mediaStore,
      confirmationStore: { issue: vi.fn(), consume: vi.fn() },
    })
    server = createServer(app)
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    baseUrl = `http://127.0.0.1:${server.address().port}`
  })

  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve))
    await rm(uploadDir, { recursive: true, force: true })
  })

  it('accepts a genuine PNG and returns the hc-gpt-web media envelope', async () => {
    const { response, json } = await upload(baseUrl)

    expect(response.status).toBe(200)
    expect(json).toMatchObject({
      code: 0,
      data: {
        kind: 'image',
        mimeType: 'image/png',
        status: 'ready',
      },
      msg: '参考素材上传成功',
    })
    expect(json.data.previewUrl).toMatch(/^\/uploads\//)
    expect(await readFile(join(uploadDir, basename(json.data.previewUrl)))).toEqual(PNG_1X1)

    const readResponse = await fetch(`${baseUrl}${json.data.previewUrl}`)
    expect(readResponse.status).toBe(200)
    expect(readResponse.headers.get('content-type')).toMatch(/^image\/png\b/)
    expect(readResponse.headers.get('x-content-type-options')).toBe('nosniff')
    expect(Buffer.from(await readResponse.arrayBuffer())).toEqual(PNG_1X1)
  })

  it('rejects a spoofed MIME type before writing to disk', async () => {
    const { response, json } = await upload(baseUrl, PNG_1X1, {
      name: 'spoof.jpg',
      type: 'image/jpeg',
    })

    expect(response.status).toBe(400)
    expect(json).toMatchObject({
      code: 40003,
      data: { reason: 'MEDIA_SIGNATURE_MISMATCH' },
    })
    expect(mediaStore.list()).toEqual([])
  })

  it('rejects empty, oversized, and truncated image buffers before disk write', async () => {
    const constrainedStore = createMediaStore({
      uploadDir,
      publicBaseUrl: '',
      maxBytes: 64,
    })
    const savePng = (buffer) => constrainedStore.save({
      buffer,
      mimetype: 'image/png',
      originalname: 'reference.png',
    })

    await expect(savePng(Buffer.alloc(0))).rejects.toMatchObject({
      code: 'EMPTY_MEDIA_FILE',
    })
    await expect(savePng(Buffer.alloc(65))).rejects.toMatchObject({
      code: 'MEDIA_TOO_LARGE',
    })
    await expect(savePng(PNG_1X1.subarray(0, 8))).rejects.toMatchObject({
      code: 'TRUNCATED_MEDIA_FILE',
    })
    expect(constrainedStore.list()).toEqual([])
  })

  it('emits a remote URL only for an HTTPS public media base URL', async () => {
    const httpsStore = createMediaStore({
      uploadDir,
      publicBaseUrl: 'https://cdn.example.test/reference-media/',
    })
    const httpStore = createMediaStore({
      uploadDir,
      publicBaseUrl: 'http://127.0.0.1:8888',
    })
    const localStore = createMediaStore({ uploadDir, publicBaseUrl: '' })
    const file = {
      buffer: PNG_1X1,
      mimetype: 'image/png',
      originalname: 'reference.png',
    }

    const httpsMedia = await httpsStore.save(file)
    const httpMedia = await httpStore.save(file)
    const localMedia = await localStore.save(file)

    expect(httpsMedia.remoteUrl).toMatch(
      /^https:\/\/cdn\.example\.test\/reference-media\/uploads\/[0-9a-f-]+\.png$/,
    )
    expect(httpMedia).not.toHaveProperty('remoteUrl')
    expect(localMedia).not.toHaveProperty('remoteUrl')
    expect(httpMedia.previewUrl).toMatch(/^\/uploads\//)
    expect(localMedia.previewUrl).toMatch(/^\/uploads\//)
  })

  it('uses UUID identities and supports safe get, list, and idempotent removal', async () => {
    const media = await mediaStore.save({
      buffer: PNG_1X1,
      mimetype: 'image/png',
      originalname: '..\\..\\escape.png',
    })
    const storedPath = join(uploadDir, basename(media.previewUrl))

    expect(media.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    )
    expect(media.name).toBe('escape.png')
    expect(basename(media.previewUrl)).toBe(`${media.id}.png`)
    expect(mediaStore.get(media.id)).toEqual(media)
    expect(mediaStore.list()).toEqual([media])
    expect(await mediaStore.remove(media.id)).toBe(true)
    expect(mediaStore.get(media.id)).toBeNull()
    await expect(access(storedPath)).rejects.toMatchObject({ code: 'ENOENT' })
    expect(await mediaStore.remove(media.id)).toBe(false)
    await expect(mediaStore.remove('../escape.png')).rejects.toMatchObject({
      code: 'INVALID_MEDIA_ID',
    })
  })

  it('deletes only by validated mediaId and is idempotent for unknown UUIDs', async () => {
    const uploaded = await upload(baseUrl)
    const mediaId = uploaded.json.data.id
    const remove = (value) => fetch(`${baseUrl}/api/videoGeneration/deleteReference`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mediaId: value }),
    })

    const first = await remove(mediaId)
    expect(await first.json()).toEqual({
      code: 0,
      data: { mediaId, removed: true },
      msg: '参考素材已删除',
    })

    const second = await remove(mediaId)
    expect(await second.json()).toEqual({
      code: 0,
      data: { mediaId, removed: false },
      msg: '参考素材已不存在',
    })

    const traversal = await remove('../../etc/passwd')
    expect(traversal.status).toBe(400)
    expect(await traversal.json()).toMatchObject({
      code: 40005,
      data: { reason: 'INVALID_MEDIA_ID' },
    })
  })

  it('keeps Multer upload-limit errors in the response envelope before disk write', async () => {
    const oversizedPng = Buffer.concat([
      PNG_1X1.subarray(0, -12),
      Buffer.alloc(40),
      PNG_1X1.subarray(-12),
    ])

    const { response, json } = await upload(baseUrl, oversizedPng)

    expect(response.status).toBe(400)
    expect(json).toEqual({
      code: 40004,
      data: { reason: 'LIMIT_FILE_SIZE' },
      msg: '上传文件不能超过 30MB',
    })
    expect(mediaStore.list()).toEqual([])
  })

  it('rehydrates persisted metadata after restart and can remove the restored media', async () => {
    const saved = await mediaStore.save({
      buffer: PNG_1X1,
      mimetype: 'image/png',
      originalname: 'persisted.png',
    })
    const restartedStore = createMediaStore({ uploadDir, publicBaseUrl: '' })

    expect(restartedStore.get(saved.id)).toEqual(saved)
    expect(restartedStore.list()).toEqual([saved])
    expect(await restartedStore.remove(saved.id)).toBe(true)
    expect(restartedStore.get(saved.id)).toBeNull()
    expect(createMediaStore({ uploadDir, publicBaseUrl: '' }).list()).toEqual([])
    expect(await readdir(uploadDir)).toEqual(['.media-index.json'])
  })

  it('serializes concurrent removal so only one caller reports a deletion', async () => {
    const saved = await mediaStore.save({
      buffer: PNG_1X1,
      mimetype: 'image/png',
      originalname: 'concurrent.png',
    })

    const results = await Promise.all([
      mediaStore.remove(saved.id),
      mediaStore.remove(saved.id),
    ])

    expect(results.sort()).toEqual([false, true])
    expect(mediaStore.list()).toEqual([])
  })

  it('deterministically removes a UUID-named image orphan on restart', async () => {
    const orphanName = 'f25555d3-70f3-4dd0-8929-65de0ec86ee8.png'
    const orphanPath = join(uploadDir, orphanName)
    await writeFile(orphanPath, PNG_1X1)

    const restartedStore = createMediaStore({ uploadDir, publicBaseUrl: '' })

    expect(restartedStore.list()).toEqual([])
    await expect(access(orphanPath)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('rejects a fabricated image container whose pixels cannot be decoded', async () => {
    const fabricated = Buffer.from(PNG_1X1)
    const idatOffset = fabricated.indexOf(Buffer.from('IDAT'))
    fabricated[idatOffset + 6] ^= 0xff

    await expect(mediaStore.save({
      buffer: fabricated,
      mimetype: 'image/png',
      originalname: 'fabricated.png',
    })).rejects.toMatchObject({ code: 'IMAGE_DECODE_FAILED' })
    expect(mediaStore.list()).toEqual([])
  })

  it('fully decodes genuine PNG, JPEG, and WebP images before accepting them', async () => {
    const jpeg = await sharp(PNG_1X1).jpeg().toBuffer()
    const webp = await sharp(PNG_1X1).webp().toBuffer()
    const fixtures = [
      { buffer: PNG_1X1, mimetype: 'image/png', originalname: 'valid.png' },
      { buffer: jpeg, mimetype: 'image/jpeg', originalname: 'valid.jpg' },
      { buffer: webp, mimetype: 'image/webp', originalname: 'valid.webp' },
    ]

    const accepted = await Promise.all(fixtures.map((file) => mediaStore.save(file)))

    expect(accepted.map((item) => item.mimeType)).toEqual([
      'image/png',
      'image/jpeg',
      'image/webp',
    ])
  })

  it('rejects excessive dimensions even when the encoded file is small', async () => {
    const oversizedDimensions = await sharp({
      create: {
        width: 8193,
        height: 1,
        channels: 3,
        background: '#ffffff',
      },
    }).png().toBuffer()

    await expect(mediaStore.save({
      buffer: oversizedDimensions,
      mimetype: 'image/png',
      originalname: 'too-wide.png',
    })).rejects.toMatchObject({ code: 'IMAGE_DIMENSIONS_EXCEEDED' })
  })

  it('builds remote media URLs only from a safe public HTTPS base', () => {
    expect(buildPublicMediaUrl(
      'https://cdn.example.com/reference-media///',
      'safe image.png',
    )).toBe('https://cdn.example.com/reference-media/uploads/safe%20image.png')

    const invalidBases = [
      'http://cdn.example.com/base',
      'https://user:pass@cdn.example.com/base',
      'https://cdn.example.com/base?token=secret',
      'https://cdn.example.com/base#fragment',
      'https://localhost/base',
      'https://assets.local/base',
      'https://127.0.0.1/base',
      'https://10.0.0.1/base',
      'https://172.16.0.1/base',
      'https://192.168.1.1/base',
      'https://169.254.1.1/base',
      'https://0.0.0.0/base',
      'https://8.8.8.8/base',
      'https://192.88.99.1/base',
      'https://[::1]/base',
      'https://[fc00::1]/base',
      'https://[fe80::1]/base',
      'https://[::]/base',
      'https://[2606:4700:4700::1111]/base',
    ]
    for (const base of invalidBases) {
      expect(buildPublicMediaUrl(base, 'safe.png')).toBe('')
    }
  })

  it('returns a 404 envelope for a missing file inside the controlled static mount', async () => {
    const response = await fetch(`${baseUrl}/uploads/missing.png`)

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({
      code: 40400,
      data: { path: '/uploads/missing.png' },
      msg: '请求路径不存在',
    })
  })

  it('serves only indexed ID/extension pairs and hides loose files and the index', async () => {
    const uploaded = await upload(baseUrl)
    const media = uploaded.json.data
    await writeFile(join(uploadDir, 'loose.png'), PNG_1X1)
    const unindexedUuid = '8216e288-cd04-412e-9b4c-f0067d11ec5e.png'
    await writeFile(join(uploadDir, unindexedUuid), PNG_1X1)
    const paths = [
      '/uploads/loose.png',
      `/uploads/${unindexedUuid}`,
      `/uploads/${media.id}.jpg`,
      '/uploads/.media-index.json',
    ]

    for (const path of paths) {
      const response = await fetch(`${baseUrl}${path}`)
      expect(response.status).toBe(404)
      expect(await response.json()).toMatchObject({ code: 40400 })
    }
  })

  it('rejects an indexed filename replaced by an outside symlink', async () => {
    const outsideDir = await mkdtemp(join(tmpdir(), 'ark-outside-'))
    try {
      const media = await mediaStore.save({
        buffer: PNG_1X1,
        mimetype: 'image/png',
        originalname: 'symlink.png',
      })
      const storedPath = join(uploadDir, basename(media.previewUrl))
      const outsidePath = join(outsideDir, 'outside.png')
      await writeFile(outsidePath, PNG_1X1)
      await rm(storedPath)
      await symlink(outsidePath, storedPath)

      const response = await fetch(`${baseUrl}${media.previewUrl}`)
      expect(response.status).toBe(404)
      expect(await response.json()).toMatchObject({ code: 40400 })
    } finally {
      await rm(outsideDir, { recursive: true, force: true })
    }
  })
})

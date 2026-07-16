// @vitest-environment node

import { access, mkdtemp, readFile, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createApp } from '../app.js'
import { createMediaStore } from '../media/store.js'

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
})

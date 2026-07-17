// @vitest-environment node
/* eslint-disable vue/one-component-per-file */

import { createServer } from 'node:http'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createApp } from '../app.js'

const validBody = {
  doc: {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: '小豆挥手' }],
      },
    ],
  },
  mediaList: [],
  config: {
    mode: 'reference_media',
    ratio: 'adaptive',
    resolution: '720p',
    duration: 5,
    count: 1,
    generateAudio: false,
    returnLastFrame: false,
    watermark: false,
    executionExpiresAfter: 172800,
    priority: 0,
  },
}

describe('videoGeneration dryRun', () => {
  let arkClient
  let mediaStore
  let server
  let baseUrl

  beforeEach(async () => {
    arkClient = { createTask: vi.fn(), getTask: vi.fn() }
    mediaStore = {
      get: vi.fn(),
      save: vi.fn(),
      remove: vi.fn(),
      list: vi.fn(),
    }
    const app = createApp({
      config: {
        arkModel: 'doubao-seedance-2-0-260128',
        arkApiKey: '',
        realGenerationEnabled: false,
      },
      arkClient,
      mediaStore,
      confirmationStore: { issue: vi.fn(), consume: vi.fn() },
    })
    server = createServer(app)
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    baseUrl = `http://127.0.0.1:${server.address().port}`
  })

  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve))
  })

  it('returns the hc-gpt-web envelope and never calls Ark', async () => {
    const response = await fetch(`${baseUrl}/api/videoGeneration/dryRun`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(validBody),
    })

    const json = await response.json()
    expect(json).toMatchObject({
      code: 0,
      data: {
        realReady: false,
        confirmationToken: '',
        serialization: {
          readablePrompt: '小豆挥手',
          modelPrompt: '小豆挥手',
          media: [],
        },
        request: {
          model: 'doubao-seedance-2-0-260128',
          ratio: 'adaptive',
          resolution: '720p',
          duration: 5,
          generate_audio: false,
          return_last_frame: false,
          watermark: false,
          execution_expires_after: 172800,
          priority: 0,
          content: [{ type: 'text', text: '小豆挥手' }],
        },
      },
      msg: 'Dry-run 校验成功',
    })
    expect(json.data.blockers.map((item) => item.code)).toEqual([
      'REAL_GENERATION_DISABLED',
      'ARK_API_KEY_MISSING',
    ])
    expect(arkClient.createTask).not.toHaveBeenCalled()
    expect(arkClient.getTask).not.toHaveBeenCalled()
  })

  it('applies the shared advanced defaults to legacy config payloads', async () => {
    const {
      returnLastFrame,
      watermark,
      executionExpiresAfter,
      priority,
      ...legacyConfig
    } = validBody.config
    void returnLastFrame
    void watermark
    void executionExpiresAfter
    void priority

    const response = await fetch(`${baseUrl}/api/videoGeneration/dryRun`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...validBody, config: legacyConfig }),
    })
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.data.request).toMatchObject({
      return_last_frame: false,
      watermark: false,
      execution_expires_after: 172800,
      priority: 0,
    })
    expect(arkClient.createTask).not.toHaveBeenCalled()
  })

  it('reports realReady only when the pure validation has no blockers', async () => {
    await new Promise((resolve) => server.close(resolve))
    const readyArkClient = { createTask: vi.fn(), getTask: vi.fn() }
    const app = createApp({
      config: {
        arkModel: 'doubao-seedance-2-0-260128',
        arkApiKey: 'server-only-test-key',
        realGenerationEnabled: true,
      },
      arkClient: readyArkClient,
      mediaStore: {
        get: vi.fn(),
        save: vi.fn(),
        remove: vi.fn(),
        list: vi.fn(),
      },
      confirmationStore: { issue: vi.fn(), consume: vi.fn() },
    })
    server = createServer(app)
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    baseUrl = `http://127.0.0.1:${server.address().port}`

    const response = await fetch(`${baseUrl}/api/videoGeneration/dryRun`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(validBody),
    })
    const json = await response.json()

    expect(json).toMatchObject({
      code: 0,
      data: {
        blockers: [],
        realReady: true,
        confirmationToken: '',
      },
      msg: 'Dry-run 校验成功',
    })
    expect(readyArkClient.createTask).not.toHaveBeenCalled()
    expect(readyArkClient.getTask).not.toHaveBeenCalled()
  })

  it('keeps malformed JSON errors in the response envelope without calling Ark', async () => {
    const response = await fetch(`${baseUrl}/api/videoGeneration/dryRun`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"doc":',
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      code: 40001,
      data: {},
      msg: '请求 JSON 格式错误',
    })
    expect(arkClient.createTask).not.toHaveBeenCalled()
    expect(arkClient.getTask).not.toHaveBeenCalled()
  })

  it('returns the deterministic health envelope', async () => {
    const response = await fetch(`${baseUrl}/api/health`)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      code: 0,
      data: { status: 'ok' },
      msg: '服务正常',
    })
  })

  it('resolves authoritative media and cannot be fooled by forged client readiness or URLs', async () => {
    const mediaId = '6bd7a6ea-3b94-43fb-99ad-f91f3f73f673'
    mediaStore.get.mockResolvedValue({
      id: mediaId,
      kind: 'image',
      name: 'server.png',
      mimeType: 'image/png',
      size: 68,
      status: 'ready',
      previewUrl: `/uploads/${mediaId}.png`,
    })
    const forgedBody = {
      ...validBody,
      doc: {
        type: 'doc',
        content: [{
          type: 'paragraph',
          content: [{
            type: 'mediaMention',
            attrs: { mediaId, kind: 'image', sourceLabel: '图片1', realIndex: 1 },
          }],
        }],
      },
      mediaList: [{
        id: mediaId,
        realIndex: 1,
        kind: 'image',
        status: 'ready',
        remoteUrl: 'https://attacker.example/forged.png',
      }],
    }

    const response = await fetch(`${baseUrl}/api/videoGeneration/dryRun`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(forgedBody),
    })
    const json = await response.json()

    expect(mediaStore.get).toHaveBeenCalledWith(mediaId)
    expect(json.data.realReady).toBe(false)
    expect(json.data.blockers).toContainEqual(expect.objectContaining({
      code: 'MEDIA_NOT_PUBLIC',
      mediaId,
    }))
    expect(json.data.serialization.media[0]).not.toHaveProperty('remoteUrl')
    expect(json.data.request.content[1].image_url.url).toBe(`local://${mediaId}`)
    expect(arkClient.createTask).not.toHaveBeenCalled()
    expect(arkClient.getTask).not.toHaveBeenCalled()
  })

  it('rejects config outside the server-side allowlist before serialization', async () => {
    const response = await fetch(`${baseUrl}/api/videoGeneration/dryRun`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...validBody,
        config: {
          mode: 'text_only',
          ratio: 'free',
          resolution: '16k',
          duration: '5',
          count: 0,
          generateAudio: 'false',
          returnLastFrame: false,
          watermark: false,
          executionExpiresAfter: 172800,
          priority: 0,
        },
      }),
    })
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json).toMatchObject({
      code: 40006,
      data: { reason: 'INVALID_CONFIG' },
      msg: 'Dry-run 请求参数无效',
    })
    expect(json.data.errors.map((item) => item.path)).toEqual([
      'config.mode',
      'config.ratio',
      'config.resolution',
      'config.duration',
      'config.count',
      'config.generateAudio',
    ])
    expect(arkClient.createTask).not.toHaveBeenCalled()
  })

  it.each([
    ['generateAudio', 'true'],
    ['returnLastFrame', 1],
    ['watermark', null],
    ['executionExpiresAfter', 3599],
    ['executionExpiresAfter', 259201],
    ['executionExpiresAfter', 3600.5],
    ['priority', -1],
    ['priority', 10],
    ['priority', 0.5],
  ])('rejects malformed advanced config %s=%j before an Ark call', async (field, value) => {
    const response = await fetch(`${baseUrl}/api/videoGeneration/dryRun`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...validBody,
        config: { ...validBody.config, [field]: value },
      }),
    })
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json).toMatchObject({
      code: 40006,
      data: { reason: 'INVALID_CONFIG' },
    })
    expect(json.data.errors).toContainEqual(expect.objectContaining({ path: `config.${field}` }))
    expect(arkClient.createTask).not.toHaveBeenCalled()
    expect(arkClient.getTask).not.toHaveBeenCalled()
  })

  it.each([
    ['frames', 57],
    ['seed', 1],
    ['serviceTier', 'flex'],
    ['callback', { url: 'https://attacker.example/callback' }],
  ])('rejects unsupported config key %s before an Ark call', async (field, value) => {
    const response = await fetch(`${baseUrl}/api/videoGeneration/dryRun`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...validBody,
        config: { ...validBody.config, [field]: value },
      }),
    })
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json).toMatchObject({
      code: 40006,
      data: { reason: 'INVALID_CONFIG' },
    })
    expect(json.data.errors).toContainEqual(expect.objectContaining({ path: `config.${field}` }))
    expect(arkClient.createTask).not.toHaveBeenCalled()
    expect(arkClient.getTask).not.toHaveBeenCalled()
  })

  it('rejects malformed editor document shapes before serialization', async () => {
    const response = await fetch(`${baseUrl}/api/videoGeneration/dryRun`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...validBody, doc: { type: 'doc', content: 'not-an-array' } }),
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({
      code: 40006,
      data: { reason: 'INVALID_DOC', path: 'doc.content' },
      msg: 'Dry-run 请求参数无效',
    })
    expect(arkClient.createTask).not.toHaveBeenCalled()
  })

  it('returns hc-gpt-web 404 envelopes for unknown API and static paths', async () => {
    for (const path of ['/api/not-found', '/uploads/not-found.png']) {
      const response = await fetch(`${baseUrl}${path}`)

      expect(response.status).toBe(404)
      expect(await response.json()).toEqual({
        code: 40400,
        data: { path },
        msg: '请求路径不存在',
      })
    }
  })

  it('rejects unknown and duplicate media IDs instead of producing readiness data', async () => {
    const mediaId = 'c497e052-7e03-41f6-a06d-77a92959e111'
    const post = (mediaList) => fetch(`${baseUrl}/api/videoGeneration/dryRun`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...validBody, mediaList }),
    })

    mediaStore.get.mockResolvedValueOnce(null)
    const unknown = await post([{ id: mediaId, realIndex: 1 }])
    const unknownJson = await unknown.json()
    expect(unknown.status).toBe(400)
    expect(unknownJson).toMatchObject({
      code: 40006,
      data: { reason: 'UNKNOWN_MEDIA_ID' },
    })
    expect(unknownJson.data).not.toHaveProperty('realReady')
    expect(unknownJson.data).not.toHaveProperty('confirmationToken')

    mediaStore.get.mockResolvedValueOnce({
      id: mediaId,
      kind: 'image',
      status: 'ready',
      previewUrl: `/uploads/${mediaId}.png`,
    })
    const duplicate = await post([
      { id: mediaId, realIndex: 1 },
      { id: mediaId, realIndex: 2 },
    ])
    expect(duplicate.status).toBe(400)
    expect(await duplicate.json()).toMatchObject({
      code: 40006,
      data: { reason: 'DUPLICATE_MEDIA_ID' },
    })
    expect(arkClient.createTask).not.toHaveBeenCalled()
  })

  it('returns a 500 envelope for unexpected server failures', async () => {
    const mediaId = 'b508bb6f-c669-4aa5-a3e4-2b7239004da3'
    mediaStore.get.mockRejectedValue(new Error('disk unavailable'))
    const response = await fetch(`${baseUrl}/api/videoGeneration/dryRun`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...validBody,
        mediaList: [{ id: mediaId, realIndex: 1 }],
      }),
    })

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      code: 50000,
      data: {},
      msg: '服务内部错误',
    })
    expect(arkClient.createTask).not.toHaveBeenCalled()
  })

  it.each([
    ['ratio', 'adaptive'],
    ['ratio', '16:9'],
    ['ratio', '9:16'],
    ['ratio', '1:1'],
    ['ratio', '4:3'],
    ['ratio', '3:4'],
    ['ratio', '21:9'],
    ['resolution', '480p'],
    ['resolution', '720p'],
    ['resolution', '1080p'],
    ['resolution', '4k'],
    ['duration', -1],
    ['duration', 4],
    ['duration', 5],
    ['duration', 10],
    ['duration', 15],
    ['count', 1],
    ['count', 2],
    ['count', 3],
    ['count', 4],
  ])('accepts Seedance 2.0 boundary %s=%s', async (field, value) => {
    const response = await fetch(`${baseUrl}/api/videoGeneration/dryRun`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...validBody,
        config: { ...validBody.config, [field]: value },
      }),
    })

    expect(response.status).toBe(200)
  })

  it.each([
    ['duration', 3],
    ['duration', 16],
    ['count', 5],
    ['count', 8],
  ])('rejects unsupported Seedance boundary %s=%s', async (field, value) => {
    const response = await fetch(`${baseUrl}/api/videoGeneration/dryRun`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...validBody,
        config: { ...validBody.config, [field]: value },
      }),
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({
      code: 40006,
      data: { reason: 'INVALID_CONFIG' },
    })
    expect(arkClient.createTask).not.toHaveBeenCalled()
  })

  it('preserves a 413 envelope for an oversized JSON body', async () => {
    const response = await fetch(`${baseUrl}/api/videoGeneration/dryRun`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ padding: 'x'.repeat(2 * 1024 * 1024) }),
    })

    expect(response.status).toBe(413)
    expect(await response.json()).toEqual({
      code: 41300,
      data: {},
      msg: '请求体过大',
    })
    expect(arkClient.createTask).not.toHaveBeenCalled()
  })
})

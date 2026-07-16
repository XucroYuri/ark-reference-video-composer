// @vitest-environment node

import { createServer } from 'node:http'

import { describe, expect, it, vi } from 'vitest'

import { createArkClient } from '../ark/client.js'
import { createApp } from '../app.js'
import { createConfirmationStore } from '../security/confirmationStore.js'

const validBody = {
  doc: {
    type: 'doc',
    content: [{
      type: 'paragraph',
      content: [{ type: 'text', text: '小豆挥手' }],
    }],
  },
  mediaList: [],
  config: {
    mode: 'reference_media',
    ratio: 'adaptive',
    resolution: '720p',
    duration: 5,
    count: 1,
    generateAudio: false,
  },
}

async function startApp(overrides = {}) {
  const arkClient = overrides.arkClient || {
    createTask: vi.fn(),
    getTask: vi.fn(),
    deleteTask: vi.fn(),
  }
  const mediaStore = overrides.mediaStore || {
    get: vi.fn(),
    save: vi.fn(),
    remove: vi.fn(),
    list: vi.fn(),
  }
  const confirmationStore = overrides.confirmationStore || createConfirmationStore()
  const config = {
    arkModel: 'doubao-seedance-2-0-260128',
    arkApiKey: 'secret-test-key',
    realGenerationEnabled: true,
    ...overrides.config,
  }
  const server = createServer(createApp({ config, arkClient, mediaStore, confirmationStore }))
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  return {
    arkClient,
    baseUrl: `http://127.0.0.1:${server.address().port}`,
    confirmationStore,
    mediaStore,
    close: () => new Promise((resolve) => server.close(resolve)),
  }
}

async function postJson(baseUrl, path, body) {
  const response = await fetch(`${baseUrl}/api/videoGeneration/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { response, json: await response.json() }
}

describe('real generation confirmation', () => {
  it('issues a confirmation token that can be consumed once', () => {
    const store = createConfirmationStore()
    const token = store.issue('payload-hash')

    expect(token).toEqual(expect.any(String))
    expect(store.consume(token, 'payload-hash')).toBe(true)
    expect(store.consume(token, 'payload-hash')).toBe(false)
  })

  it('expires confirmation tokens after five minutes with an injected clock', () => {
    let now = 1_000
    const store = createConfirmationStore({
      clock: () => now,
      idFactory: () => 'deterministic-token',
    })
    const token = store.issue('payload-hash')

    expect(token).toBe('deterministic-token')
    now += 300_000
    expect(store.consume(token, 'payload-hash')).toBe(false)
  })

  it('consumes a token even when its payload hash does not match', () => {
    const store = createConfirmationStore({ idFactory: () => 'mismatch-token' })
    const token = store.issue('approved-hash')

    expect(store.consume(token, 'changed-hash')).toBe(false)
    expect(store.consume(token, 'approved-hash')).toBe(false)
  })

  it('bounds stored confirmations and evicts the oldest token', () => {
    const ids = ['token-1', 'token-2', 'token-3']
    const store = createConfirmationStore({
      maxEntries: 2,
      idFactory: () => ids.shift(),
    })
    const first = store.issue('hash-1')
    const second = store.issue('hash-2')
    const third = store.issue('hash-3')

    expect(store.consume(first, 'hash-1')).toBe(false)
    expect(store.consume(second, 'hash-2')).toBe(true)
    expect(store.consume(third, 'hash-3')).toBe(true)
  })

  it('rejects a non-positive confirmation capacity', () => {
    expect(() => createConfirmationStore({ maxEntries: 0 })).toThrow(
      'maxEntries must be a positive integer',
    )
  })
})

describe('Ark client', () => {
  it('rejects every Ark base except the exact approved HTTPS API boundary', () => {
    const fetchImpl = vi.fn()
    const invalidBases = [
      'http://ark.cn-beijing.volces.com/api/v3',
      'https://localhost/api/v3',
      'https://evil.example/api/v3',
      'https://ark.cn-beijing.volces.com:444/api/v3',
      'https://user:pass@ark.cn-beijing.volces.com/api/v3',
      'https://ark.cn-beijing.volces.com/api/v3?next=evil',
      'https://ark.cn-beijing.volces.com/api/v3#fragment',
      'https://ark.cn-beijing.volces.com/api/v3/contents',
      'https://ark.cn-beijing.volces.com//api/v3',
      ' https://ark.cn-beijing.volces.com/api/v3',
    ]

    for (const baseUrl of invalidBases) {
      expect(() => createArkClient({
        baseUrl,
        apiKey: 'secret-test-key',
        fetchImpl,
      })).toThrow(expect.objectContaining({
        status: 500,
        code: 'INVALID_ARK_BASE_URL',
      }))
    }
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('creates one task with the fixed Ark API path and server authorization', async () => {
    const payload = { model: 'doubao-seedance-2-0-260128', content: [] }
    const fetchImpl = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ id: 'task-1' }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ))
    const client = createArkClient({
      baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
      apiKey: 'secret-test-key',
      fetchImpl,
    })

    await expect(client.createTask(payload)).resolves.toEqual({ id: 'task-1' })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer secret-test-key' }),
        body: JSON.stringify(payload),
      }),
    )
  })

  it('gets a validated task ID through an encoded fixed path', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ id: 'task:1', status: 'running' }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ))
    const client = createArkClient({
      baseUrl: 'https://ark.cn-beijing.volces.com/api/v3/',
      apiKey: 'secret-test-key',
      fetchImpl,
    })

    await expect(client.getTask('task:1')).resolves.toMatchObject({ status: 'running' })
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks/task%3A1',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('deletes a task through the fixed encoded task path', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    const client = createArkClient({
      baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
      apiKey: 'secret-test-key',
      fetchImpl,
    })

    await expect(client.deleteTask('task:1')).resolves.toEqual({})
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks/task%3A1',
      expect.objectContaining({ method: 'DELETE' }),
    )
  })

  it('rejects invalid task IDs before any Ark request', async () => {
    const fetchImpl = vi.fn()
    const client = createArkClient({
      baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
      apiKey: 'secret-test-key',
      fetchImpl,
    })

    for (const id of ['', '../task', 'task/child', ' task ', 'x'.repeat(257)]) {
      await expect(client.getTask(id)).rejects.toMatchObject({
        status: 400,
        code: 'INVALID_TASK_ID',
      })
      await expect(client.deleteTask(id)).rejects.toMatchObject({
        status: 400,
        code: 'INVALID_TASK_ID',
      })
    }
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('normalizes Ark JSON failures without retrying', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { code: 'RateLimitExceeded', message: 'request rate exceeded' },
    }), {
      status: 429,
      headers: {
        'content-type': 'application/json',
        'x-request-id': 'request-429',
      },
    }))
    const client = createArkClient({
      baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
      apiKey: 'secret-test-key',
      fetchImpl,
    })

    await expect(client.createTask({ content: [] })).rejects.toMatchObject({
      status: 429,
      code: 'RateLimitExceeded',
      message: 'request rate exceeded',
      requestId: 'request-429',
    })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('rejects non-JSON Ark responses without exposing response text', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(
      '<html>secret upstream details</html>',
      { status: 502, headers: { 'content-type': 'text/html' } },
    ))
    const client = createArkClient({
      baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
      apiKey: 'secret-test-key',
      fetchImpl,
    })

    let error
    try {
      await client.createTask({ content: [] })
    } catch (caught) {
      error = caught
    }
    expect(error).toMatchObject({
      status: 502,
      code: 'ARK_INVALID_RESPONSE',
      message: 'Ark 返回了无效响应',
      requestId: '',
    })
    expect(JSON.stringify(error)).not.toContain('secret upstream details')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('normalizes malformed Ark JSON as an invalid response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{"broken":', {
      status: 502,
      headers: { 'content-type': 'application/json' },
    }))
    const client = createArkClient({
      baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
      apiKey: 'secret-test-key',
      fetchImpl,
    })

    await expect(client.createTask({ content: [] })).rejects.toMatchObject({
      status: 502,
      code: 'ARK_INVALID_RESPONSE',
      message: 'Ark 返回了无效响应',
    })
  })

  it('rejects oversized Ark JSON before exposing or parsing it', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      message: 'x'.repeat(256),
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))
    const client = createArkClient({
      baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
      apiKey: 'secret-test-key',
      fetchImpl,
      maxResponseBytes: 64,
    })

    await expect(client.createTask({ content: [] })).rejects.toMatchObject({
      status: 502,
      code: 'ARK_RESPONSE_TOO_LARGE',
      message: 'Ark 响应体过大',
    })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('cancels unread response bodies for oversized headers and non-JSON content', async () => {
    const oversizedCancel = vi.fn()
    const nonJsonCancel = vi.fn()
    const responseWithBody = (cancel, headers) => new Response(new ReadableStream({
      pull() {},
      cancel,
    }), { status: 502, headers })
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(responseWithBody(oversizedCancel, {
        'content-type': 'application/json',
        'content-length': '1024',
      }))
      .mockResolvedValueOnce(responseWithBody(nonJsonCancel, {
        'content-type': 'text/html',
      }))
    const client = createArkClient({
      baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
      apiKey: 'secret-test-key',
      fetchImpl,
      maxResponseBytes: 64,
    })

    await expect(client.getTask('task-1')).rejects.toMatchObject({
      code: 'ARK_RESPONSE_TOO_LARGE',
    })
    await expect(client.getTask('task-1')).rejects.toMatchObject({
      code: 'ARK_INVALID_RESPONSE',
    })
    expect(oversizedCancel).toHaveBeenCalledTimes(1)
    expect(nonJsonCancel).toHaveBeenCalledTimes(1)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('aborts a stalled Ark request at the bounded timeout', async () => {
    vi.useFakeTimers()
    try {
      const fetchImpl = vi.fn((_url, options) => {
        if (!options.signal) return Promise.reject(new Error('missing abort signal'))
        return new Promise((resolve, reject) => {
          void resolve
          options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true })
        })
      })
      const client = createArkClient({
        baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
        apiKey: 'secret-test-key',
        fetchImpl,
        timeoutMs: 100,
      })

      const request = client.getTask('task-1')
      const assertion = expect(request).rejects.toMatchObject({
        status: 504,
        code: 'ARK_TIMEOUT',
        message: 'Ark 请求超时',
      })
      await Promise.all([vi.advanceTimersByTimeAsync(100), assertion])
      expect(fetchImpl).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps the timeout active while reading the Ark response body', async () => {
    vi.useFakeTimers()
    try {
      const fetchImpl = vi.fn((_url, options) => Promise.resolve(new Response(
        new ReadableStream({
          start(controller) {
            options.signal.addEventListener(
              'abort',
              () => controller.error(options.signal.reason),
              { once: true },
            )
            setTimeout(() => {
              if (!options.signal.aborted) controller.error(new Error('body did not abort'))
            }, 101)
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )))
      const client = createArkClient({
        baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
        apiKey: 'secret-test-key',
        fetchImpl,
        timeoutMs: 100,
      })

      const request = client.getTask('task-1')
      const assertion = expect(request).rejects.toMatchObject({
        status: 504,
        code: 'ARK_TIMEOUT',
      })
      await Promise.all([vi.advanceTimersByTimeAsync(101), assertion])
      expect(fetchImpl).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('redacts the API key and bearer credentials echoed by Ark', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: {
        code: 'Unauthorized',
        message: 'rejected secret-test-key and Bearer another-sensitive-token',
      },
    }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    }))
    const client = createArkClient({
      baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
      apiKey: 'secret-test-key',
      fetchImpl,
    })

    let error
    try {
      await client.createTask({ content: [] })
    } catch (caught) {
      error = caught
    }
    expect(error).toMatchObject({ status: 401, code: 'Unauthorized' })
    const exposed = JSON.stringify({
      message: error.message,
      code: error.code,
      requestId: error.requestId,
    })
    expect(exposed).not.toContain('secret-test-key')
    expect(exposed).not.toContain('another-sensitive-token')
    expect(exposed).toContain('[REDACTED]')
  })

  it('recursively sanitizes successful create, get, and delete responses', async () => {
    const signedUrl = 'https://cdn.example.test/video.mp4?X-Signature=keep-me&Expires=999'
    const success = (extra) => new Response(JSON.stringify({
      ...extra,
      status: 'running',
      output_url: signedUrl,
      authorization: 'Bearer response-private-token',
      nested: {
        apiKey: 'secret-test-key',
        api_key: 'another-private-value',
        secret: 'private-secret-value',
        note: 'echo secret-test-key and Bearer nested-private-token',
      },
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(success({ id: 'task-1' }))
      .mockResolvedValueOnce(success({ id: 'task-1' }))
      .mockResolvedValueOnce(success({ id: 'task-1', deleted: true }))
    const client = createArkClient({
      baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
      apiKey: 'secret-test-key',
      fetchImpl,
    })

    const results = [
      await client.createTask({ content: [] }),
      await client.getTask('task-1'),
      await client.deleteTask('task-1'),
    ]

    for (const result of results) {
      expect(result).toMatchObject({
        id: 'task-1',
        status: 'running',
        output_url: signedUrl,
        authorization: '[REDACTED]',
        nested: {
          apiKey: '[REDACTED]',
          api_key: '[REDACTED]',
          secret: '[REDACTED]',
          note: 'echo [REDACTED] and Bearer [REDACTED]',
        },
      })
      expect(JSON.stringify(result)).not.toContain('secret-test-key')
      expect(JSON.stringify(result)).not.toContain('nested-private-token')
    }
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })

  it('rejects an invalid task ID returned by Ark create', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ id: '../unsafe-task' }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ))
    const client = createArkClient({
      baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
      apiKey: 'secret-test-key',
      fetchImpl,
    })

    await expect(client.createTask({ content: [] })).rejects.toMatchObject({
      status: 502,
      code: 'ARK_INVALID_RESPONSE',
      message: 'Ark 创建任务响应中的任务 ID 无效',
    })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})

describe('guarded real-generation routes', () => {
  it('blocks real generation when the feature flag is false', async () => {
    const context = await startApp({ config: { realGenerationEnabled: false } })
    try {
      const { response, json } = await postJson(context.baseUrl, 'createTask', {
        ...validBody,
        confirmationToken: 'untrusted-token',
      })

      expect(response.status).toBe(403)
      expect(json).toMatchObject({
        code: 40301,
        data: { blockers: [{ code: 'REAL_GENERATION_DISABLED' }] },
        msg: '真实生成条件不满足',
      })
      expect(context.arkClient.createTask).not.toHaveBeenCalled()
    } finally {
      await context.close()
    }
  })

  it('blocks real generation when ARK_API_KEY is empty after trimming', async () => {
    const context = await startApp({ config: { arkApiKey: '   ' } })
    try {
      const { response, json } = await postJson(context.baseUrl, 'createTask', {
        ...validBody,
        confirmationToken: 'untrusted-token',
      })

      expect(response.status).toBe(403)
      expect(json.data.blockers).toContainEqual(expect.objectContaining({
        code: 'ARK_API_KEY_MISSING',
      }))
      expect(context.arkClient.createTask).not.toHaveBeenCalled()
    } finally {
      await context.close()
    }
  })

  it('blocks local-only media URLs resolved from authoritative storage', async () => {
    const mediaId = '15c796d2-a11f-4078-8d9c-e8337f1cc52e'
    const mediaStore = {
      get: vi.fn().mockResolvedValue({
        id: mediaId,
        kind: 'image',
        name: 'local.png',
        status: 'ready',
        previewUrl: `/uploads/${mediaId}.png`,
      }),
      save: vi.fn(),
      remove: vi.fn(),
      list: vi.fn(),
    }
    const context = await startApp({ mediaStore })
    try {
      const { response, json } = await postJson(context.baseUrl, 'createTask', {
        ...validBody,
        mediaList: [{ id: mediaId, realIndex: 1 }],
        confirmationToken: 'untrusted-token',
      })

      expect(response.status).toBe(403)
      expect(json.data.blockers).toContainEqual(expect.objectContaining({
        code: 'MEDIA_NOT_PUBLIC',
        mediaId,
      }))
      expect(context.arkClient.createTask).not.toHaveBeenCalled()
    } finally {
      await context.close()
    }
  })

  it('does not issue a confirmation token when dry-run is blocked', async () => {
    const confirmationStore = { issue: vi.fn(), consume: vi.fn() }
    const context = await startApp({
      config: { realGenerationEnabled: false },
      confirmationStore,
    })
    try {
      const { json } = await postJson(context.baseUrl, 'dryRun', validBody)

      expect(json.data.realReady).toBe(false)
      expect(json.data.confirmationToken).toBe('')
      expect(confirmationStore.issue).not.toHaveBeenCalled()
      expect(context.arkClient.createTask).not.toHaveBeenCalled()
    } finally {
      await context.close()
    }
  })

  it('issues a five-minute single-use confirmation token after valid dry-run', async () => {
    let now = 10_000
    const confirmationStore = createConfirmationStore({
      clock: () => now,
      idFactory: () => 'five-minute-token',
    })
    const context = await startApp({ confirmationStore })
    try {
      const { response, json } = await postJson(context.baseUrl, 'dryRun', validBody)

      expect(response.status).toBe(200)
      expect(json).toMatchObject({
        code: 0,
        data: {
          blockers: [],
          realReady: true,
          confirmationToken: 'five-minute-token',
        },
        msg: 'Dry-run 校验成功',
      })
      expect(context.arkClient.createTask).not.toHaveBeenCalled()
      now += 300_000
    } finally {
      await context.close()
    }
  })

  it('creates one task for count=1 and consumes the token', async () => {
    const arkClient = {
      createTask: vi.fn().mockResolvedValue({ id: 'task-1' }),
      getTask: vi.fn(),
      deleteTask: vi.fn(),
    }
    const context = await startApp({ arkClient })
    try {
      const dryRun = await postJson(context.baseUrl, 'dryRun', validBody)
      const confirmationToken = dryRun.json.data.confirmationToken
      const { response, json } = await postJson(context.baseUrl, 'createTask', {
        ...validBody,
        confirmationToken,
      })

      expect(response.status).toBe(200)
      expect(json).toEqual({
        code: 0,
        data: { taskIds: ['task-1'], count: 1 },
        msg: '视频生成任务已创建',
      })
      expect(arkClient.createTask).toHaveBeenCalledTimes(1)
      expect(arkClient.createTask).toHaveBeenCalledWith({
        model: 'doubao-seedance-2-0-260128',
        content: [{ type: 'text', text: '小豆挥手' }],
        ratio: 'adaptive',
        resolution: '720p',
        duration: 5,
        generate_audio: false,
      })
    } finally {
      await context.close()
    }
  })

  it('rejects a reused confirmation token without a second Ark request', async () => {
    const arkClient = {
      createTask: vi.fn().mockResolvedValue({ id: 'task-1' }),
      getTask: vi.fn(),
      deleteTask: vi.fn(),
    }
    const context = await startApp({ arkClient })
    try {
      const dryRun = await postJson(context.baseUrl, 'dryRun', validBody)
      const body = {
        ...validBody,
        confirmationToken: dryRun.json.data.confirmationToken,
      }

      expect((await postJson(context.baseUrl, 'createTask', body)).response.status).toBe(200)
      const reused = await postJson(context.baseUrl, 'createTask', body)

      expect(reused.response.status).toBe(409)
      expect(reused.json).toEqual({
        code: 40901,
        data: {},
        msg: '确认凭证无效或已过期',
      })
      expect(arkClient.createTask).toHaveBeenCalledTimes(1)
    } finally {
      await context.close()
    }
  })

  it('creates tasks sequentially and stops when count=2 second creation fails', async () => {
    const events = []
    const arkClient = {
      createTask: vi.fn()
        .mockImplementationOnce(async () => {
          events.push('first:start')
          await Promise.resolve()
          events.push('first:end')
          return { id: 'task-1' }
        })
        .mockImplementationOnce(async () => {
          events.push('second:start')
          throw {
            status: 429,
            code: 'RateLimitExceeded',
            message: 'request rate exceeded',
            requestId: 'request-2',
          }
        }),
      getTask: vi.fn(),
      deleteTask: vi.fn(),
    }
    const context = await startApp({ arkClient })
    const body = {
      ...validBody,
      config: { ...validBody.config, count: 2 },
    }
    try {
      const dryRun = await postJson(context.baseUrl, 'dryRun', body)
      const result = await postJson(context.baseUrl, 'createTask', {
        ...body,
        confirmationToken: dryRun.json.data.confirmationToken,
      })

      expect(result.response.status).toBe(502)
      expect(result.json).toEqual({
        code: 50201,
        data: {
          taskIds: ['task-1'],
          error: {
            status: 429,
            code: 'RateLimitExceeded',
            message: 'request rate exceeded',
            requestId: 'request-2',
          },
        },
        msg: 'Ark 创建任务失败',
      })
      expect(events).toEqual(['first:start', 'first:end', 'second:start'])
      expect(arkClient.createTask).toHaveBeenCalledTimes(2)
    } finally {
      await context.close()
    }
  })

  it('rejects a confirmation when authoritative media changes after dry-run', async () => {
    const mediaId = '0e8df744-c610-4cff-8f5a-a4fd87b49019'
    const record = (remoteUrl) => ({
      id: mediaId,
      kind: 'image',
      name: 'server.png',
      status: 'ready',
      remoteUrl,
    })
    const mediaStore = {
      get: vi.fn()
        .mockResolvedValueOnce(record('https://cdn.example.test/original.png'))
        .mockResolvedValueOnce(record('https://cdn.example.test/replaced.png')),
      save: vi.fn(),
      remove: vi.fn(),
      list: vi.fn(),
    }
    const context = await startApp({ mediaStore })
    const body = {
      ...validBody,
      mediaList: [{
        id: mediaId,
        realIndex: 1,
        remoteUrl: 'https://attacker.example/forged.png',
      }],
    }
    try {
      const dryRun = await postJson(context.baseUrl, 'dryRun', body)
      const result = await postJson(context.baseUrl, 'createTask', {
        ...body,
        confirmationToken: dryRun.json.data.confirmationToken,
      })

      expect(result.response.status).toBe(409)
      expect(mediaStore.get).toHaveBeenCalledTimes(2)
      expect(context.arkClient.createTask).not.toHaveBeenCalled()
    } finally {
      await context.close()
    }
  })

  it('rebuilds the create request from authoritative media instead of client URLs', async () => {
    const mediaId = 'b74fe230-e98a-42fa-9747-1a009123a57e'
    const authoritativeUrl = 'https://cdn.example.test/authoritative.png'
    const mediaStore = {
      get: vi.fn().mockResolvedValue({
        id: mediaId,
        kind: 'image',
        name: 'server.png',
        status: 'ready',
        remoteUrl: authoritativeUrl,
      }),
      save: vi.fn(),
      remove: vi.fn(),
      list: vi.fn(),
    }
    const arkClient = {
      createTask: vi.fn().mockResolvedValue({ id: 'task-authoritative' }),
      getTask: vi.fn(),
      deleteTask: vi.fn(),
    }
    const context = await startApp({ arkClient, mediaStore })
    const body = {
      ...validBody,
      doc: {
        type: 'doc',
        content: [{
          type: 'paragraph',
          content: [{ type: 'mediaMention', attrs: { mediaId } }],
        }],
      },
      mediaList: [{
        id: mediaId,
        realIndex: 1,
        remoteUrl: 'https://attacker.example/forged.png',
      }],
    }
    try {
      const dryRun = await postJson(context.baseUrl, 'dryRun', body)
      const result = await postJson(context.baseUrl, 'createTask', {
        ...body,
        confirmationToken: dryRun.json.data.confirmationToken,
      })

      expect(result.response.status).toBe(200)
      expect(mediaStore.get).toHaveBeenCalledTimes(2)
      expect(arkClient.createTask).toHaveBeenCalledWith({
        model: 'doubao-seedance-2-0-260128',
        content: [
          { type: 'text', text: '【图片 1】' },
          {
            type: 'image_url',
            role: 'reference_image',
            image_url: { url: authoritativeUrl },
          },
        ],
        ratio: 'adaptive',
        resolution: '720p',
        duration: 5,
        generate_audio: false,
      })
      expect(JSON.stringify(arkClient.createTask.mock.calls)).not.toContain('attacker.example')
    } finally {
      await context.close()
    }
  })

  it('rejects an expired confirmation before any Ark request', async () => {
    let now = 1_000
    const confirmationStore = createConfirmationStore({
      clock: () => now,
      idFactory: () => 'expiring-route-token',
    })
    const context = await startApp({ confirmationStore })
    try {
      const dryRun = await postJson(context.baseUrl, 'dryRun', validBody)
      now += 300_000
      const result = await postJson(context.baseUrl, 'createTask', {
        ...validBody,
        confirmationToken: dryRun.json.data.confirmationToken,
      })

      expect(result.response.status).toBe(409)
      expect(context.arkClient.createTask).not.toHaveBeenCalled()
    } finally {
      await context.close()
    }
  })

  it('never includes the API key in a route response or error message', async () => {
    const arkClient = {
      createTask: vi.fn().mockRejectedValue({
        status: 401,
        code: 'Unauthorized',
        message: 'key secret-test-key was rejected; Bearer other-private-token',
        requestId: 'secret-test-key',
      }),
      getTask: vi.fn(),
      deleteTask: vi.fn(),
    }
    const context = await startApp({ arkClient })
    try {
      const dryRun = await postJson(context.baseUrl, 'dryRun', validBody)
      const result = await postJson(context.baseUrl, 'createTask', {
        ...validBody,
        confirmationToken: dryRun.json.data.confirmationToken,
      })

      const exposed = JSON.stringify(result.json)
      expect(result.response.status).toBe(502)
      expect(exposed).not.toContain('secret-test-key')
      expect(exposed).not.toContain('other-private-token')
      expect(exposed).toContain('[REDACTED]')
      expect(arkClient.createTask).toHaveBeenCalledTimes(1)
    } finally {
      await context.close()
    }
  })

  it('gets a task through the guarded route', async () => {
    const arkClient = {
      createTask: vi.fn(),
      getTask: vi.fn().mockResolvedValue({ id: 'task:1', status: 'running' }),
      deleteTask: vi.fn(),
    }
    const context = await startApp({ arkClient })
    try {
      const response = await fetch(
        `${context.baseUrl}/api/videoGeneration/getTask?taskId=${encodeURIComponent('task:1')}`,
      )
      const json = await response.json()

      expect(response.status).toBe(200)
      expect(json).toEqual({
        code: 0,
        data: { id: 'task:1', status: 'running' },
        msg: '任务状态查询成功',
      })
      expect(arkClient.getTask).toHaveBeenCalledWith('task:1')
    } finally {
      await context.close()
    }
  })

  it('deletes a task through the guarded route', async () => {
    const arkClient = {
      createTask: vi.fn(),
      getTask: vi.fn(),
      deleteTask: vi.fn().mockResolvedValue({ id: 'task:1', deleted: true }),
    }
    const context = await startApp({ arkClient })
    try {
      const { response, json } = await postJson(context.baseUrl, 'deleteTask', {
        taskId: 'task:1',
      })

      expect(response.status).toBe(200)
      expect(json).toEqual({
        code: 0,
        data: { id: 'task:1', deleted: true },
        msg: '任务删除成功',
      })
      expect(arkClient.deleteTask).toHaveBeenCalledWith('task:1')
    } finally {
      await context.close()
    }
  })

  it('validates get and delete task IDs before invoking Ark', async () => {
    const context = await startApp()
    try {
      const getResponse = await fetch(
        `${context.baseUrl}/api/videoGeneration/getTask?taskId=${encodeURIComponent('../task')}`,
      )
      const deleteResult = await postJson(context.baseUrl, 'deleteTask', {
        taskId: 'task/child',
      })

      expect(getResponse.status).toBe(400)
      expect(await getResponse.json()).toEqual({
        code: 40008,
        data: { reason: 'INVALID_TASK_ID' },
        msg: '任务 ID 格式无效',
      })
      expect(deleteResult.response.status).toBe(400)
      expect(deleteResult.json).toEqual({
        code: 40008,
        data: { reason: 'INVALID_TASK_ID' },
        msg: '任务 ID 格式无效',
      })
      expect(context.arkClient.getTask).not.toHaveBeenCalled()
      expect(context.arkClient.deleteTask).not.toHaveBeenCalled()
    } finally {
      await context.close()
    }
  })

  it.each([
    [{ realGenerationEnabled: false }, 'REAL_GENERATION_DISABLED'],
    [{ arkApiKey: '   ' }, 'ARK_API_KEY_MISSING'],
  ])('guards get and delete routes when runtime is not ready: %s', async (config, blockerCode) => {
    const context = await startApp({ config })
    try {
      const getResponse = await fetch(
        `${context.baseUrl}/api/videoGeneration/getTask?taskId=task-1`,
      )
      const deleteResult = await postJson(context.baseUrl, 'deleteTask', {
        taskId: 'task-1',
      })

      expect(getResponse.status).toBe(403)
      expect(await getResponse.json()).toMatchObject({
        code: 40301,
        data: { blockers: [{ code: blockerCode }] },
        msg: '真实生成条件不满足',
      })
      expect(deleteResult.response.status).toBe(403)
      expect(deleteResult.json).toMatchObject({
        code: 40301,
        data: { blockers: [{ code: blockerCode }] },
        msg: '真实生成条件不满足',
      })
      expect(context.arkClient.getTask).not.toHaveBeenCalled()
      expect(context.arkClient.deleteTask).not.toHaveBeenCalled()
    } finally {
      await context.close()
    }
  })

  it('returns a redacted normalized Ark error from task queries', async () => {
    const arkClient = {
      createTask: vi.fn(),
      getTask: vi.fn().mockRejectedValue({
        status: 404,
        code: 'NotFound',
        message: 'missing secret-test-key',
        requestId: 'request-query',
      }),
      deleteTask: vi.fn(),
    }
    const context = await startApp({ arkClient })
    try {
      const response = await fetch(
        `${context.baseUrl}/api/videoGeneration/getTask?taskId=task-1`,
      )
      const json = await response.json()

      expect(response.status).toBe(502)
      expect(json).toEqual({
        code: 50202,
        data: {
          error: {
            status: 404,
            code: 'NotFound',
            message: 'missing [REDACTED]',
            requestId: 'request-query',
          },
        },
        msg: 'Ark 任务查询失败',
      })
      expect(JSON.stringify(json)).not.toContain('secret-test-key')
      expect(arkClient.getTask).toHaveBeenCalledTimes(1)
    } finally {
      await context.close()
    }
  })

  it('returns a normalized Ark error from task deletion', async () => {
    const arkClient = {
      createTask: vi.fn(),
      getTask: vi.fn(),
      deleteTask: vi.fn().mockRejectedValue({
        status: 409,
        code: 'TaskRunning',
        message: 'task cannot be deleted while running',
        requestId: 'request-delete',
      }),
    }
    const context = await startApp({ arkClient })
    try {
      const result = await postJson(context.baseUrl, 'deleteTask', { taskId: 'task-1' })

      expect(result.response.status).toBe(502)
      expect(result.json).toEqual({
        code: 50203,
        data: {
          error: {
            status: 409,
            code: 'TaskRunning',
            message: 'task cannot be deleted while running',
            requestId: 'request-delete',
          },
        },
        msg: 'Ark 任务删除失败',
      })
      expect(arkClient.deleteTask).toHaveBeenCalledTimes(1)
    } finally {
      await context.close()
    }
  })
})

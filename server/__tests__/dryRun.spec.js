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
  },
}

describe('videoGeneration dryRun', () => {
  let arkClient
  let server
  let baseUrl

  beforeEach(async () => {
    arkClient = { createTask: vi.fn(), getTask: vi.fn() }
    const app = createApp({
      config: {
        arkModel: 'doubao-seedance-2-0-260128',
        arkApiKey: '',
        realGenerationEnabled: false,
      },
      arkClient,
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
})

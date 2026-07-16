// @vitest-environment node

import { createServer } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { createRuntime } from '../index.js'

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

async function postJson(baseUrl, path, body) {
  const response = await fetch(`${baseUrl}/api/videoGeneration/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { response, json: await response.json() }
}

describe('server runtime composition', () => {
  let rootDir
  let server

  afterEach(async () => {
    if (server) await new Promise((resolve) => server.close(resolve))
    if (rootDir) await rm(rootDir, { recursive: true, force: true })
  })

  it('uses one injected Ark client through dry-run, confirmation, and create', async () => {
    rootDir = await mkdtemp(join(tmpdir(), 'ark-runtime-'))
    const fetchImpl = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ id: 'task-runtime-1' }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ))
    const runtime = createRuntime({
      rootDir,
      processEnv: {
        APP_REAL_GENERATION_ENABLED: 'true',
        ARK_API_KEY: 'runtime-test-key',
        ARK_BASE_URL: 'https://ark.cn-beijing.volces.com/api/v3',
      },
      fetchImpl,
      clock: () => 1_000,
      idFactory: () => 'runtime-confirmation-token',
    })
    server = createServer(runtime.app)
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const baseUrl = `http://127.0.0.1:${server.address().port}`

    const dryRun = await postJson(baseUrl, 'dryRun', validBody)
    expect(dryRun.json.data.confirmationToken).toBe('runtime-confirmation-token')
    expect(fetchImpl).not.toHaveBeenCalled()

    const created = await postJson(baseUrl, 'createTask', {
      ...validBody,
      confirmationToken: dryRun.json.data.confirmationToken,
    })

    expect(created.response.status).toBe(200)
    expect(created.json.data.taskIds).toEqual(['task-runtime-1'])
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks',
      expect.objectContaining({ method: 'POST', redirect: 'error' }),
    )
  })
})

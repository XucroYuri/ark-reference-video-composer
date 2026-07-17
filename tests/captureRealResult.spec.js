// @vitest-environment node

import { createHash } from 'node:crypto'
import { access, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as captureModule from '../scripts/capture-real-result.mjs'

const { captureRealResult } = captureModule

const TASK_ID = 'task-full-sensitive-id-1234567890'
const MEDIA_URL = 'https://media.example.test/results/final-video.mp4?token=sensitive'
const BASE_URL = 'http://127.0.0.1:43128'

function taskResponse({
  code = 0,
  status = 'succeeded',
  videoUrl = MEDIA_URL,
  httpStatus = 200,
} = {}) {
  return new Response(JSON.stringify({
    code,
    data: {
      id: TASK_ID,
      model: 'doubao-seedance-2-0-260128',
      status,
      content: { video_url: videoUrl },
      usage: { completion_tokens: 1, total_tokens: 1 },
    },
    msg: code === 0 ? '操作成功' : '操作失败',
  }), {
    status: httpStatus,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

function videoResponse(chunks, {
  contentType = 'video/mp4',
  contentLength,
  status = 200,
} = {}) {
  const headers = { 'content-type': contentType }
  if (contentLength !== undefined) headers['content-length'] = String(contentLength)

  return new Response(new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(Uint8Array.from(chunk))
      controller.close()
    },
  }), { status, headers })
}

function fetchSequence(task, media) {
  return vi.fn()
    .mockResolvedValueOnce(task)
    .mockResolvedValueOnce(media)
}

async function expectMissing(path) {
  await expect(access(path)).rejects.toMatchObject({ code: 'ENOENT' })
}

function createOutputSink() {
  const chunks = []
  return {
    output: { write: vi.fn((chunk) => chunks.push(String(chunk))) },
    text: () => chunks.join(''),
  }
}

describe('captureRealResult', () => {
  let tempDir
  let outputPath

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'capture-real-result-'))
    outputPath = join(tempDir, 'nested', 'result.mp4')
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it('streams a succeeded MP4 to the output and returns only its bytes and SHA-256', async () => {
    const chunks = [Buffer.from('seed'), Buffer.from('ance')]
    const expected = Buffer.concat(chunks)
    const fetchImpl = fetchSequence(
      taskResponse(),
      videoResponse(chunks, { contentType: 'Video/MP4; charset=binary' }),
    )

    const result = await captureRealResult({
      taskId: TASK_ID,
      baseUrl: BASE_URL,
      outputPath,
      fetchImpl,
    })

    expect(await readFile(outputPath)).toEqual(expected)
    expect(result).toEqual({
      bytes: expected.byteLength,
      sha256: createHash('sha256').update(expected).digest('hex'),
    })
    expect(Object.keys(result).sort()).toEqual(['bytes', 'sha256'])
    await expectMissing(`${outputPath}.partial`)
  })

  it('uses only the local task route and disables media redirects without logging secrets', async () => {
    const stdout = vi.spyOn(process.stdout, 'write')
    const stderr = vi.spyOn(process.stderr, 'write')
    const fetchImpl = fetchSequence(taskResponse(), videoResponse([Buffer.from('mp4')]))

    await captureRealResult({
      taskId: TASK_ID,
      baseUrl: BASE_URL,
      outputPath,
      fetchImpl,
    })

    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      `${BASE_URL}/api/videoGeneration/getTask?taskId=${encodeURIComponent(TASK_ID)}`,
    )
    expect(fetchImpl).toHaveBeenNthCalledWith(2, MEDIA_URL, { redirect: 'error' })
    const output = [...stdout.mock.calls, ...stderr.mock.calls]
      .map(([chunk]) => String(chunk))
      .join('')
    expect(output).not.toContain(TASK_ID)
    expect(output).not.toContain(MEDIA_URL)
  })

  it('rejects a non-success local task response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(taskResponse({ httpStatus: 502 }))

    await expect(captureRealResult({
      taskId: TASK_ID,
      baseUrl: BASE_URL,
      outputPath,
      fetchImpl,
    })).rejects.toThrow('Local task request failed')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    await expectMissing(`${outputPath}.partial`)
  })

  it('rejects a nonzero local task envelope', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(taskResponse({ code: 50001 }))

    await expect(captureRealResult({
      taskId: TASK_ID,
      baseUrl: BASE_URL,
      outputPath,
      fetchImpl,
    })).rejects.toThrow('Local task response was not successful')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('rejects a task that has not succeeded', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(taskResponse({ status: 'running' }))

    await expect(captureRealResult({
      taskId: TASK_ID,
      baseUrl: BASE_URL,
      outputPath,
      fetchImpl,
    })).rejects.toThrow('Task has not succeeded')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    await expectMissing(`${outputPath}.partial`)
  })

  it.each([
    'http://media.example.test/result.mp4',
    'https://localhost/result.mp4',
    'https://127.0.0.1/result.mp4',
  ])('rejects a non-public HTTPS media URL: %s', async (videoUrl) => {
    const fetchImpl = vi.fn().mockResolvedValue(taskResponse({ videoUrl }))

    await expect(captureRealResult({
      taskId: TASK_ID,
      baseUrl: BASE_URL,
      outputPath,
      fetchImpl,
    })).rejects.toThrow()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    await expectMissing(`${outputPath}.partial`)
  })

  it('rejects a redirect response from the media URL', async () => {
    const fetchImpl = fetchSequence(
      taskResponse(),
      new Response(null, {
        status: 302,
        headers: { location: 'https://redirected.example.test/result.mp4' },
      }),
    )

    await expect(captureRealResult({
      taskId: TASK_ID,
      baseUrl: BASE_URL,
      outputPath,
      fetchImpl,
    })).rejects.toThrow('Media request failed')
    expect(fetchImpl).toHaveBeenNthCalledWith(2, MEDIA_URL, { redirect: 'error' })
    await expectMissing(`${outputPath}.partial`)
  })

  it('rejects a media response that is not video/mp4', async () => {
    const fetchImpl = fetchSequence(
      taskResponse(),
      videoResponse([Buffer.from('not-mp4')], { contentType: 'application/octet-stream' }),
    )

    await expect(captureRealResult({
      taskId: TASK_ID,
      baseUrl: BASE_URL,
      outputPath,
      fetchImpl,
    })).rejects.toThrow('Media response is not video/mp4')
    await expectMissing(`${outputPath}.partial`)
  })

  it('rejects a declared body larger than maxBytes', async () => {
    const fetchImpl = fetchSequence(
      taskResponse(),
      videoResponse([Buffer.from('tiny')], { contentLength: 9 }),
    )

    await expect(captureRealResult({
      taskId: TASK_ID,
      baseUrl: BASE_URL,
      outputPath,
      fetchImpl,
      maxBytes: 8,
    })).rejects.toThrow('Media response exceeds the size limit')
    await expectMissing(outputPath)
    await expectMissing(`${outputPath}.partial`)
  })

  it('stops when streamed chunks cross maxBytes and removes the partial file', async () => {
    const fetchImpl = fetchSequence(
      taskResponse(),
      videoResponse([Buffer.from('12345'), Buffer.from('6789')]),
    )

    await expect(captureRealResult({
      taskId: TASK_ID,
      baseUrl: BASE_URL,
      outputPath,
      fetchImpl,
      maxBytes: 8,
    })).rejects.toThrow('Media response exceeds the size limit')
    await expectMissing(outputPath)
    await expectMissing(`${outputPath}.partial`)
  })

  it('removes the partial file when the media stream fails', async () => {
    let pullCount = 0
    const failingBody = new ReadableStream({
      pull(controller) {
        if (pullCount === 0) {
          pullCount += 1
          controller.enqueue(Uint8Array.from(Buffer.from('part')))
          return
        }
        controller.error(new Error('mock stream failure'))
      },
    })
    const fetchImpl = fetchSequence(
      taskResponse(),
      new Response(failingBody, { headers: { 'content-type': 'video/mp4' } }),
    )

    await expect(captureRealResult({
      taskId: TASK_ID,
      baseUrl: BASE_URL,
      outputPath,
      fetchImpl,
    })).rejects.toThrow('mock stream failure')
    await expectMissing(outputPath)
    await expectMissing(`${outputPath}.partial`)
  })

  it('acquires the media reader before creating or opening output files', async () => {
    const media = videoResponse([Buffer.from('locked')])
    const heldReader = media.body.getReader()
    const fetchImpl = fetchSequence(taskResponse(), media)

    try {
      await expect(captureRealResult({
        taskId: TASK_ID,
        baseUrl: BASE_URL,
        outputPath,
        fetchImpl,
      })).rejects.toThrow()
    } finally {
      heldReader.releaseLock()
    }

    await expectMissing(outputPath)
    await expectMissing(`${outputPath}.partial`)
    await expectMissing(dirname(outputPath))
  })
})

describe('runCli', () => {
  it('writes exactly the redacted result JSON with fixed production defaults', async () => {
    const sha256 = 'a'.repeat(64)
    const captureImpl = vi.fn().mockResolvedValue({
      bytes: 4,
      sha256,
      taskId: TASK_ID,
      videoUrl: MEDIA_URL,
      response: { content: { video_url: MEDIA_URL } },
    })
    const stdout = createOutputSink()
    const stderr = createOutputSink()

    const status = await captureModule.runCli({
      env: { ARK_TASK_ID: TASK_ID },
      captureImpl,
      stdout: stdout.output,
      stderr: stderr.output,
    })

    expect(status).toBe(0)
    expect(captureImpl).toHaveBeenCalledWith({
      taskId: TASK_ID,
      baseUrl: 'http://127.0.0.1:43128',
      outputPath: 'artifacts/real-generation/result.mp4',
      maxBytes: 512 * 1024 * 1024,
    })
    expect(stdout.output.write).toHaveBeenCalledTimes(1)
    expect(stdout.text()).toBe(`${JSON.stringify({ bytes: 4, sha256 })}\n`)
    expect(Object.keys(JSON.parse(stdout.text()))).toEqual(['bytes', 'sha256'])
    expect(stderr.text()).toBe('')
    expect(stdout.text()).not.toContain(TASK_ID)
    expect(stdout.text()).not.toContain(MEDIA_URL)
  })

  it('returns failure and writes only the generic message when the task ID is missing', async () => {
    const captureImpl = vi.fn()
    const stdout = createOutputSink()
    const stderr = createOutputSink()

    const status = await captureModule.runCli({
      env: { ARK_TASK_ID: '   ' },
      captureImpl,
      stdout: stdout.output,
      stderr: stderr.output,
    })

    expect(status).toBe(1)
    expect(captureImpl).not.toHaveBeenCalled()
    expect(stdout.text()).toBe('')
    expect(stderr.output.write).toHaveBeenCalledTimes(1)
    expect(stderr.text()).toBe('Capture failed.\n')
  })

  it('redacts a malicious capture failure behind the fixed generic message', async () => {
    const maliciousMessage = [
      TASK_ID,
      MEDIA_URL,
      JSON.stringify({ content: { video_url: MEDIA_URL }, secret: 'response-content' }),
    ].join(' ')
    const captureImpl = vi.fn().mockRejectedValue(new Error(maliciousMessage))
    const stdout = createOutputSink()
    const stderr = createOutputSink()

    const status = await captureModule.runCli({
      env: { ARK_TASK_ID: TASK_ID },
      captureImpl,
      stdout: stdout.output,
      stderr: stderr.output,
    })

    expect(status).toBe(1)
    expect(stdout.text()).toBe('')
    expect(stderr.output.write).toHaveBeenCalledTimes(1)
    expect(stderr.text()).toBe('Capture failed.\n')
    expect(stderr.text()).not.toContain(TASK_ID)
    expect(stderr.text()).not.toContain(MEDIA_URL)
    expect(stderr.text()).not.toContain('response-content')
  })
})

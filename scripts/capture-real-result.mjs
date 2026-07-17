import { createHash } from 'node:crypto'
import { mkdir, open, rename, rm } from 'node:fs/promises'
import { dirname } from 'node:path'
import { pathToFileURL } from 'node:url'

import { normalizeRemoteMediaUrl } from '../server/media/remoteUrl.js'

const PRODUCTION_MAX_BYTES = 512 * 1024 * 1024

async function writeChunk(handle, chunk) {
  let offset = 0
  while (offset < chunk.byteLength) {
    const { bytesWritten } = await handle.write(
      chunk,
      offset,
      chunk.byteLength - offset,
      null,
    )
    if (bytesWritten === 0) throw new Error('Unable to write media output')
    offset += bytesWritten
  }
}

export async function captureRealResult({
  taskId,
  baseUrl,
  outputPath,
  fetchImpl = globalThis.fetch,
  maxBytes = PRODUCTION_MAX_BYTES,
}) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new Error('maxBytes must be a positive safe integer')
  }

  const partialPath = `${outputPath}.partial`
  try {
    let taskResponse
    try {
      taskResponse = await fetchImpl(
        `${baseUrl}/api/videoGeneration/getTask?taskId=${encodeURIComponent(taskId)}`,
      )
    } catch {
      throw new Error('Local task request failed')
    }
    if (!taskResponse?.ok) throw new Error('Local task request failed')

    let envelope
    try {
      envelope = await taskResponse.json()
    } catch {
      throw new Error('Local task response was invalid')
    }
    if (envelope?.code !== 0) {
      throw new Error('Local task response was not successful')
    }
    if (envelope?.data?.status !== 'succeeded') {
      throw new Error('Task has not succeeded')
    }

    let mediaUrl
    try {
      mediaUrl = normalizeRemoteMediaUrl(envelope.data.content?.video_url)
    } catch {
      throw new Error('Task media URL is not a public HTTPS URL')
    }

    let mediaResponse
    try {
      mediaResponse = await fetchImpl(mediaUrl, { redirect: 'error' })
    } catch {
      throw new Error('Media request failed')
    }
    if (!mediaResponse?.ok) throw new Error('Media request failed')

    const contentType = mediaResponse.headers.get('content-type')
      ?.split(';', 1)[0]
      .trim()
      .toLowerCase()
    if (contentType !== 'video/mp4') {
      throw new Error('Media response is not video/mp4')
    }

    const declaredLength = mediaResponse.headers.get('content-length')
    if (declaredLength !== null && Number(declaredLength) > maxBytes) {
      throw new Error('Media response exceeds the size limit')
    }
    if (!mediaResponse.body?.getReader) {
      throw new Error('Media response body is unavailable')
    }

    const hash = createHash('sha256')
    let reader
    let handle
    let bytes = 0
    let complete = false

    try {
      reader = mediaResponse.body.getReader()
      await mkdir(dirname(outputPath), { recursive: true })
      handle = await open(partialPath, 'w')

      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          complete = true
          break
        }

        const nextBytes = bytes + value.byteLength
        if (nextBytes > maxBytes) {
          throw new Error('Media response exceeds the size limit')
        }
        await writeChunk(handle, value)
        hash.update(value)
        bytes = nextBytes
      }
    } finally {
      if (reader && !complete) await reader.cancel().catch(() => {})
      try {
        reader?.releaseLock()
      } finally {
        if (handle) await handle.close()
      }
    }

    await rename(partialPath, outputPath)
    return { bytes, sha256: hash.digest('hex') }
  } catch (error) {
    await rm(partialPath, { force: true }).catch(() => {})
    throw error
  }
}

export async function runCli({
  env = process.env,
  captureImpl = captureRealResult,
  stdout = process.stdout,
  stderr = process.stderr,
} = {}) {
  try {
    const taskId = env.ARK_TASK_ID?.trim()
    if (!taskId) throw new Error('Missing task ID')

    const result = await captureImpl({
      taskId,
      baseUrl: env.ARK_LOCAL_BASE_URL?.trim() || 'http://127.0.0.1:43128',
      outputPath: 'artifacts/real-generation/result.mp4',
      maxBytes: PRODUCTION_MAX_BYTES,
    })
    stdout.write(`${JSON.stringify({ bytes: result.bytes, sha256: result.sha256 })}\n`)
    return 0
  } catch {
    stderr.write('Capture failed.\n')
    return 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().then((status) => {
    process.exitCode = status
  })
}

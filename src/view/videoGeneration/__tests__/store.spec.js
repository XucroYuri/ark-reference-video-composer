import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import * as videoGenerationApi from '@/api/videoGeneration'
import { removeMentionsByMediaId, useVideoGenerationStore } from '../store'

vi.mock('@/api/videoGeneration', () => ({
  uploadReference: vi.fn(),
  deleteReference: vi.fn(),
  dryRunVideoGeneration: vi.fn(),
  createVideoGenerationTask: vi.fn(),
  getVideoGenerationTask: vi.fn(),
  deleteVideoGenerationTask: vi.fn(),
}))

function createDeferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

describe('removeMentionsByMediaId', () => {
  it('recursively removes only matching atomic mentions without mutating the source', () => {
    const source = {
      type: 'doc',
      meta: { preserved: true },
      content: [
        {
          type: 'paragraph',
          attrs: { align: 'left' },
          content: [
            { type: 'text', text: '保留', marks: [{ type: 'bold' }] },
            { type: 'mediaMention', attrs: { mediaId: 'remove-me', realIndex: 1 } },
            { type: 'mediaMention', attrs: { mediaId: 'keep-me', realIndex: 2 } },
          ],
        },
        {
          type: 'blockquote',
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'mediaMention', attrs: { mediaId: 'remove-me', realIndex: 1 } },
              ],
            },
          ],
        },
      ],
    }
    const snapshot = structuredClone(source)

    const result = removeMentionsByMediaId(source, 'remove-me')

    expect(source).toEqual(snapshot)
    expect(result).toEqual({
      type: 'doc',
      meta: { preserved: true },
      content: [
        {
          type: 'paragraph',
          attrs: { align: 'left' },
          content: [
            { type: 'text', text: '保留', marks: [{ type: 'bold' }] },
            { type: 'mediaMention', attrs: { mediaId: 'keep-me', realIndex: 2 } },
          ],
        },
        {
          type: 'blockquote',
          content: [{ type: 'paragraph', content: [] }],
        },
      ],
    })
    expect(result).not.toBe(source)
  })

  it.each([
    { type: 'doc', content: [] },
    { type: 'doc', content: [{ type: 'paragraph' }] },
    { type: 'doc', content: [{ type: 'paragraph', content: [] }] },
  ])('preserves an empty document shape without mutation', (source) => {
    const snapshot = structuredClone(source)

    expect(removeMentionsByMediaId(source, 'missing')).toEqual(source)
    expect(source).toEqual(snapshot)
  })
})

describe('useVideoGenerationStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.resetAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('uses source-compatible default generation options', () => {
    const store = useVideoGenerationStore()

    expect(store.config).toEqual({
      mode: 'reference_media',
      ratio: 'adaptive',
      resolution: '720p',
      duration: 5,
      count: 1,
      generateAudio: true,
      returnLastFrame: false,
      watermark: false,
      executionExpiresAfter: 172800,
      priority: 0,
    })
  })

  it('accepts the complete selected Seedance 2.0 config', () => {
    const store = useVideoGenerationStore()

    store.setConfig({
      ratio: '21:9',
      resolution: '4k',
      duration: -1,
      generateAudio: false,
      returnLastFrame: true,
      watermark: true,
      executionExpiresAfter: 3600,
      priority: 9,
    })

    expect(store.config).toMatchObject({
      ratio: '21:9',
      resolution: '4k',
      duration: -1,
      generateAudio: false,
      returnLastFrame: true,
      watermark: true,
      executionExpiresAfter: 3600,
      priority: 9,
    })
  })

  it('assigns stable realIndex values and clears the complete draft', () => {
    const store = useVideoGenerationStore()
    store.addMedia({ id: 'm1', kind: 'image', name: 'a.png', status: 'ready' })
    store.addMedia({ id: 'm2', kind: 'image', name: 'b.png', status: 'ready' })

    expect(store.mediaList.map((item) => item.realIndex)).toEqual([1, 2])

    store.clearDraft()

    expect(store.mediaList).toEqual([])
    expect(store.editorDoc).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] })
  })

  it('ignores invalid and duplicate media IDs without consuming or reusing indexes', () => {
    const store = useVideoGenerationStore()

    expect(store.addMedia({ id: '', kind: 'image' })).toBeNull()
    const first = store.addMedia({ id: 'm1', kind: 'image', realIndex: 98 })
    expect(store.addMedia({ id: 'm1', kind: 'image' })).toBe(first)
    store.addMedia({ id: 'm2', kind: 'image' })

    expect(store.mediaList.map(({ id, realIndex }) => ({ id, realIndex }))).toEqual([
      { id: 'm1', realIndex: 1 },
      { id: 'm2', realIndex: 2 },
    ])

    store.mediaList.splice(0, 1)
    const third = store.addMedia({ id: 'm3', kind: 'image' })
    expect(third.realIndex).toBe(3)

    store.clearDraft()
    expect(store.addMedia({ id: 'm4', kind: 'image' }).realIndex).toBe(1)
  })

  it('resets generation, result, task, and pending state when clearing the draft', () => {
    const store = useVideoGenerationStore()
    store.config.ratio = '16:9'
    store.dryRunResult = { confirmationToken: 'old-token' }
    store.taskList = [{ id: 'task-1' }]
    store.uploadPending = true
    store.removePending = true
    store.submitPending = true

    store.clearDraft()

    expect(store.config).toEqual({
      mode: 'reference_media',
      ratio: 'adaptive',
      resolution: '720p',
      duration: 5,
      count: 1,
      generateAudio: true,
      returnLastFrame: false,
      watermark: false,
      executionExpiresAfter: 172800,
      priority: 0,
    })
    expect(store.dryRunResult).toBeNull()
    expect(store.taskList).toEqual([])
    expect(store.uploadPending).toBe(false)
    expect(store.removePending).toBe(false)
    expect(store.submitPending).toBe(false)
  })

  it('invalidates stale dry-run confirmation after every canonical draft change', () => {
    const store = useVideoGenerationStore()
    const resetDryRun = () => {
      store.dryRunResult = { confirmationToken: 'stale-token' }
    }

    resetDryRun()
    store.addMedia({ id: 'm1', kind: 'image' })
    expect(store.dryRunResult).toBeNull()

    resetDryRun()
    store.setEditorDoc({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: '新提示' }] }],
    })
    expect(store.dryRunResult).toBeNull()

    resetDryRun()
    store.setConfig({ duration: 10 })
    expect(store.dryRunResult).toBeNull()
    expect(store.config.duration).toBe(10)
  })

  it.each([
    null,
    { injected: 'discard-me' },
    { mode: 'text_to_video' },
    { ratio: '2:1' },
    { resolution: '2k' },
    { duration: 16 },
    { count: 0 },
    { count: 1.5 },
    { generateAudio: 'true' },
  ])('rejects an invalid config patch atomically without consuming confirmation', (patch) => {
    const store = useVideoGenerationStore()
    store.dryRunResult = { confirmationToken: 'still-current' }
    const before = { ...store.config }
    let error

    try {
      store.setConfig(patch)
    } catch (caught) {
      error = caught
    }

    expect(error).toMatchObject({
      name: 'VideoGenerationStoreError',
      code: 'VIDEO_GENERATION_INVALID_CONFIG',
    })
    expect(store.config).toEqual(before)
    expect(store.dryRunResult).toEqual({ confirmationToken: 'still-current' })
  })

  it('invalidates confirmation when exposed reactive draft state changes directly', () => {
    const store = useVideoGenerationStore()

    store.dryRunResult = { confirmationToken: 'stale-token' }
    store.config.ratio = '16:9'
    expect(store.dryRunResult).toBeNull()

    store.dryRunResult = { confirmationToken: 'stale-token' }
    store.editorDoc = { type: 'doc', content: [] }
    expect(store.dryRunResult).toBeNull()

    store.dryRunResult = { confirmationToken: 'stale-token' }
    store.mediaList.push({ id: 'direct-media', realIndex: 100 })
    expect(store.dryRunResult).toBeNull()
  })

  it('uploads a file before assigning its index and resets pending in finally', async () => {
    const store = useVideoGenerationStore()
    const file = new File(['png'], 'reference.png', { type: 'image/png' })
    let resolveUpload
    videoGenerationApi.uploadReference.mockReturnValue(new Promise((resolve) => {
      resolveUpload = resolve
    }))

    const upload = store.uploadMedia(file)

    expect(store.uploadPending).toBe(true)
    expect(store.mediaList).toEqual([])
    const body = videoGenerationApi.uploadReference.mock.calls[0][0]
    expect(body).toBeInstanceOf(FormData)
    expect(body.get('file')).toBe(file)

    resolveUpload({
      code: 0,
      data: { id: 'server-media-1', kind: 'image', name: 'reference.png', status: 'ready' },
      msg: 'ok',
    })

    await expect(upload).resolves.toMatchObject({ id: 'server-media-1', realIndex: 1 })
    expect(store.uploadPending).toBe(false)
  })

  it('does not resurrect a cleared upload or let its finally clear a newer upload', async () => {
    const store = useVideoGenerationStore()
    const oldUpload = createDeferred()
    const newUpload = createDeferred()
    videoGenerationApi.uploadReference
      .mockReturnValueOnce(oldUpload.promise)
      .mockReturnValueOnce(newUpload.promise)

    const oldRequest = store.uploadMedia(new File(['old'], 'old.png'))
    await expect(store.uploadMedia(new File(['overlap'], 'overlap.png'))).rejects.toMatchObject({
      code: 'VIDEO_GENERATION_REQUEST_PENDING',
    })

    store.clearDraft()
    const newRequest = store.uploadMedia(new File(['new'], 'new.png'))
    oldUpload.resolve({
      code: 0,
      data: { id: 'old-server-media', kind: 'image', name: 'old.png' },
      msg: 'ok',
    })
    await expect(oldRequest).rejects.toMatchObject({
      code: 'VIDEO_GENERATION_STALE_OPERATION',
    })

    expect(store.mediaList).toEqual([])
    expect(store.uploadPending).toBe(true)

    newUpload.resolve({
      code: 0,
      data: { id: 'new-server-media', kind: 'image', name: 'new.png' },
      msg: 'ok',
    })
    await expect(newRequest).resolves.toMatchObject({
      id: 'new-server-media',
      realIndex: 1,
    })
    expect(store.uploadPending).toBe(false)
  })

  it('reconciles a successful upload after unrelated editor and config changes', async () => {
    const store = useVideoGenerationStore()
    const upload = createDeferred()
    videoGenerationApi.uploadReference.mockReturnValue(upload.promise)

    const request = store.uploadMedia(new File(['new'], 'new.png'))
    store.setEditorDoc({ type: 'doc', content: [{ type: 'paragraph', content: [] }] })
    store.setConfig({ ratio: '16:9' })
    upload.resolve({
      code: 0,
      data: { id: 'authoritative-upload', kind: 'image', name: 'new.png' },
      msg: 'ok',
    })

    await expect(request).resolves.toMatchObject({
      id: 'authoritative-upload',
      realIndex: 1,
    })
    expect(store.mediaList.map((item) => item.id)).toEqual(['authoritative-upload'])
    expect(store.uploadPending).toBe(false)
  })

  it('rejects upload and removal while the other media operation is active', async () => {
    const store = useVideoGenerationStore()
    store.addMedia({ id: 'existing-media', kind: 'image' })
    const upload = createDeferred()
    videoGenerationApi.uploadReference.mockReturnValue(upload.promise)

    const uploadRequest = store.uploadMedia(new File(['new'], 'new.png'))
    await expect(store.removeMedia('existing-media')).rejects.toMatchObject({
      code: 'VIDEO_GENERATION_REQUEST_PENDING',
    })
    expect(videoGenerationApi.deleteReference).not.toHaveBeenCalled()
    upload.resolve({
      code: 0,
      data: { id: 'uploaded-media', kind: 'image' },
      msg: 'ok',
    })
    await uploadRequest

    const removal = createDeferred()
    videoGenerationApi.deleteReference.mockReturnValue(removal.promise)
    const removalRequest = store.removeMedia('existing-media')
    await expect(store.uploadMedia(new File(['blocked'], 'blocked.png'))).rejects.toMatchObject({
      code: 'VIDEO_GENERATION_REQUEST_PENDING',
    })
    expect(videoGenerationApi.uploadReference).toHaveBeenCalledTimes(1)
    removal.resolve({
      code: 0,
      data: { mediaId: 'existing-media', removed: true },
      msg: 'ok',
    })
    await removalRequest
  })

  it('deduplicates uploaded server IDs without consuming another realIndex', async () => {
    const store = useVideoGenerationStore()
    store.addMedia({ id: 'server-media-1', kind: 'image', name: 'first.png' })
    videoGenerationApi.uploadReference
      .mockResolvedValueOnce({
        code: 0,
        data: { id: 'server-media-1', kind: 'image', name: 'duplicate.png' },
        msg: 'ok',
      })
      .mockResolvedValueOnce({
        code: 0,
        data: { id: 'server-media-2', kind: 'image', name: 'second.png' },
        msg: 'ok',
      })

    await store.uploadMedia(new File(['a'], 'duplicate.png'))
    await store.uploadMedia(new File(['b'], 'second.png'))

    expect(store.mediaList.map(({ id, realIndex }) => ({ id, realIndex }))).toEqual([
      { id: 'server-media-1', realIndex: 1 },
      { id: 'server-media-2', realIndex: 2 },
    ])
  })

  it.each([
    [{ code: 40003, data: {}, msg: '上传失败' }, 'VIDEO_GENERATION_API_REJECTED'],
    [{ code: 0, msg: 'missing data' }, 'VIDEO_GENERATION_API_MALFORMED'],
    [{ code: 0, data: { id: '', kind: 'image' }, msg: 'bad media' }, 'VIDEO_GENERATION_API_MALFORMED'],
    [{}, 'VIDEO_GENERATION_API_MALFORMED'],
    [{ code: '0', data: { id: 'm1' } }, 'VIDEO_GENERATION_API_MALFORMED'],
    [{ code: 0, data: { id: 'm1' } }, 'VIDEO_GENERATION_API_MALFORMED'],
    [{ code: 40003, msg: 'missing data' }, 'VIDEO_GENERATION_API_MALFORMED'],
  ])('rejects invalid upload envelopes without corrupting state', async (response, code) => {
    const store = useVideoGenerationStore()
    videoGenerationApi.uploadReference.mockResolvedValue(response)

    await expect(store.uploadMedia(new File(['x'], 'bad.png'))).rejects.toMatchObject({
      name: 'VideoGenerationStoreError',
      code,
    })
    expect(store.uploadPending).toBe(false)
    expect(store.mediaList).toEqual([])
  })

  it.each([
    ['rejected', (envelope) => videoGenerationApi.uploadReference.mockRejectedValue({
      response: { data: envelope },
    })],
    ['fulfilled', (envelope) => videoGenerationApi.uploadReference.mockResolvedValue({
      response: { data: envelope },
    })],
  ])('normalizes %s Axios-shaped server envelopes', async (_shape, arrange) => {
    const store = useVideoGenerationStore()
    arrange({ code: 40003, data: { reason: 'MEDIA_SIGNATURE_MISMATCH' }, msg: '上传失败' })

    await expect(store.uploadMedia(new File(['x'], 'bad.png'))).rejects.toMatchObject({
      code: 'VIDEO_GENERATION_API_REJECTED',
      details: {
        responseCode: 40003,
        data: { reason: 'MEDIA_SIGNATURE_MISMATCH' },
      },
    })
    expect(store.uploadPending).toBe(false)
  })

  it('maps a true network rejection to a stable safe error', async () => {
    const store = useVideoGenerationStore()
    videoGenerationApi.uploadReference.mockRejectedValue(
      new Error('sensitive network internals must not escape'),
    )

    let error
    try {
      await store.uploadMedia(new File(['x'], 'network.png'))
    } catch (caught) {
      error = caught
    }

    expect(error).toMatchObject({
      name: 'VideoGenerationStoreError',
      code: 'VIDEO_GENERATION_NETWORK_ERROR',
      message: '视频生成网络请求失败',
      details: {},
    })
    expect(JSON.stringify(error)).not.toContain('sensitive network internals')
    expect(store.uploadPending).toBe(false)
  })

  it.each([null, undefined])(
    'maps a fulfilled no-response migration result to a stable network error',
    async (response) => {
      const store = useVideoGenerationStore()
      videoGenerationApi.uploadReference.mockResolvedValue(response)

      await expect(store.uploadMedia(new File(['x'], 'no-response.png'))).rejects.toMatchObject({
        code: 'VIDEO_GENERATION_NETWORK_ERROR',
        message: '视频生成网络请求失败',
      })
      expect(store.mediaList).toEqual([])
      expect(store.uploadPending).toBe(false)
    },
  )

  it('removes media and matching mentions only after server deletion succeeds', async () => {
    const store = useVideoGenerationStore()
    store.addMedia({ id: 'm1', kind: 'image' })
    store.addMedia({ id: 'm2', kind: 'image' })
    store.addMedia({ id: 'm3', kind: 'image' })
    store.setEditorDoc({
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [
          { type: 'mediaMention', attrs: { mediaId: 'm2' } },
          { type: 'mediaMention', attrs: { mediaId: 'm3' } },
        ],
      }],
    })
    store.dryRunResult = { confirmationToken: 'stale-token' }
    let resolveDelete
    videoGenerationApi.deleteReference.mockReturnValue(new Promise((resolve) => {
      resolveDelete = resolve
    }))

    const removal = store.removeMedia('m2')

    expect(store.removePending).toBe(true)
    expect(store.mediaList).toHaveLength(3)
    expect(videoGenerationApi.deleteReference).toHaveBeenCalledWith({ mediaId: 'm2' })

    resolveDelete({ code: 0, data: { mediaId: 'm2', removed: true }, msg: 'ok' })
    await expect(removal).resolves.toMatchObject({ id: 'm2', realIndex: 2 })

    expect(store.mediaList.map(({ id, realIndex }) => ({ id, realIndex }))).toEqual([
      { id: 'm1', realIndex: 1 },
      { id: 'm3', realIndex: 3 },
    ])
    expect(store.editorDoc.content[0].content).toEqual([
      { type: 'mediaMention', attrs: { mediaId: 'm3' } },
    ])
    expect(store.dryRunResult).toBeNull()
    expect(store.removePending).toBe(false)
  })

  it('keeps media, mentions, and confirmation intact when deletion fails', async () => {
    const store = useVideoGenerationStore()
    store.addMedia({ id: 'm1', kind: 'image' })
    store.setEditorDoc({
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{ type: 'mediaMention', attrs: { mediaId: 'm1' } }],
      }],
    })
    store.dryRunResult = { confirmationToken: 'still-valid' }
    const mediaSnapshot = JSON.parse(JSON.stringify(store.mediaList))
    const docSnapshot = JSON.parse(JSON.stringify(store.editorDoc))
    videoGenerationApi.deleteReference.mockResolvedValue({
      code: 40005,
      data: { reason: 'INVALID_MEDIA_ID' },
      msg: '删除失败',
    })

    await expect(store.removeMedia('m1')).rejects.toMatchObject({
      code: 'VIDEO_GENERATION_API_REJECTED',
    })

    expect(store.mediaList).toEqual(mediaSnapshot)
    expect(store.editorDoc).toEqual(docSnapshot)
    expect(store.dryRunResult).toEqual({ confirmationToken: 'still-valid' })
    expect(store.removePending).toBe(false)
  })

  it('re-finds removal by ID and isolates old/new removal pending state across clear', async () => {
    const store = useVideoGenerationStore()
    store.addMedia({ id: 'old-m1', kind: 'image' })
    const oldRemoval = createDeferred()
    const newRemoval = createDeferred()
    videoGenerationApi.deleteReference
      .mockReturnValueOnce(oldRemoval.promise)
      .mockReturnValueOnce(newRemoval.promise)

    const oldRequest = store.removeMedia('old-m1')
    await expect(store.removeMedia('old-m1')).rejects.toMatchObject({
      code: 'VIDEO_GENERATION_REQUEST_PENDING',
    })

    store.clearDraft()
    store.addMedia({ id: 'replacement-m1', kind: 'image' })
    store.addMedia({ id: 'new-m2', kind: 'image' })
    const newRequest = store.removeMedia('new-m2')

    oldRemoval.resolve({
      code: 0,
      data: { mediaId: 'old-m1', removed: true },
      msg: 'ok',
    })
    await expect(oldRequest).rejects.toMatchObject({
      code: 'VIDEO_GENERATION_STALE_OPERATION',
    })
    expect(store.mediaList.map((item) => item.id)).toEqual(['replacement-m1', 'new-m2'])
    expect(store.removePending).toBe(true)

    newRemoval.resolve({
      code: 0,
      data: { mediaId: 'new-m2', removed: true },
      msg: 'ok',
    })
    await expect(newRequest).resolves.toMatchObject({ id: 'new-m2' })
    expect(store.mediaList.map((item) => item.id)).toEqual(['replacement-m1'])
    expect(store.removePending).toBe(false)
  })

  it('reconciles deletion by stable ID after unrelated editor and config changes', async () => {
    const store = useVideoGenerationStore()
    store.addMedia({ id: 'keep-media', kind: 'image' })
    store.addMedia({ id: 'delete-media', kind: 'image' })
    store.setEditorDoc({
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [
          { type: 'mediaMention', attrs: { mediaId: 'delete-media' } },
          { type: 'mediaMention', attrs: { mediaId: 'keep-media' } },
        ],
      }],
    })
    const removal = createDeferred()
    videoGenerationApi.deleteReference.mockReturnValue(removal.promise)

    const request = store.removeMedia('delete-media')
    store.editorDoc.content[0].content.unshift({ type: 'text', text: '无关修改' })
    store.setConfig({ duration: 10 })
    removal.resolve({
      code: 0,
      data: { mediaId: 'delete-media', removed: true },
      msg: 'ok',
    })

    await expect(request).resolves.toMatchObject({ id: 'delete-media' })
    expect(store.mediaList.map((item) => item.id)).toEqual(['keep-media'])
    expect(store.editorDoc.content[0].content).toEqual([
      { type: 'text', text: '无关修改' },
      { type: 'mediaMention', attrs: { mediaId: 'keep-media' } },
    ])
    expect(store.removePending).toBe(false)
  })

  it('blocks dry-run and paid confirmation while either media operation is active', async () => {
    const store = useVideoGenerationStore()
    store.addMedia({ id: 'existing-media', kind: 'image' })
    store.dryRunResult = { confirmationToken: 'current-token', realReady: true }
    const upload = createDeferred()
    videoGenerationApi.uploadReference.mockReturnValue(upload.promise)

    const uploadRequest = store.uploadMedia(new File(['new'], 'new.png'))
    await expect(store.runDryRun()).rejects.toMatchObject({
      code: 'VIDEO_GENERATION_REQUEST_PENDING',
    })
    await expect(store.confirmRealGeneration('current-token')).rejects.toMatchObject({
      code: 'VIDEO_GENERATION_REQUEST_PENDING',
    })
    upload.resolve({
      code: 0,
      data: { id: 'uploaded-media', kind: 'image' },
      msg: 'ok',
    })
    await uploadRequest

    store.dryRunResult = { confirmationToken: 'next-token', realReady: true }
    const removal = createDeferred()
    videoGenerationApi.deleteReference.mockReturnValue(removal.promise)
    const removalRequest = store.removeMedia('existing-media')
    await expect(store.runDryRun()).rejects.toMatchObject({
      code: 'VIDEO_GENERATION_REQUEST_PENDING',
    })
    await expect(store.confirmRealGeneration('next-token')).rejects.toMatchObject({
      code: 'VIDEO_GENERATION_REQUEST_PENDING',
    })
    removal.resolve({
      code: 0,
      data: { mediaId: 'existing-media', removed: true },
      msg: 'ok',
    })
    await removalRequest

    expect(videoGenerationApi.dryRunVideoGeneration).not.toHaveBeenCalled()
    expect(videoGenerationApi.createVideoGenerationTask).not.toHaveBeenCalled()
  })

  it('dry-runs the canonical draft with only authoritative media identity fields', async () => {
    const store = useVideoGenerationStore()
    store.addMedia({
      id: 'm1',
      kind: 'image',
      status: 'ready',
      previewUrl: '/uploads/m1.png',
      remoteUrl: 'https://untrusted.example/m1.png',
      assetId: 'client-asset',
    })
    store.setEditorDoc({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: '小豆挥手' }] }],
    })
    let resolveDryRun
    videoGenerationApi.dryRunVideoGeneration.mockReturnValue(new Promise((resolve) => {
      resolveDryRun = resolve
    }))

    const request = store.runDryRun()

    expect(store.submitPending).toBe(true)
    expect(videoGenerationApi.dryRunVideoGeneration).toHaveBeenCalledWith({
      doc: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: '小豆挥手' }] }],
      },
      mediaList: [{ id: 'm1', realIndex: 1 }],
      config: {
        mode: 'reference_media',
        ratio: 'adaptive',
        resolution: '720p',
        duration: 5,
        count: 1,
        generateAudio: true,
        returnLastFrame: false,
        watermark: false,
        executionExpiresAfter: 172800,
        priority: 0,
      },
    })

    const result = {
      serialization: { readablePrompt: '小豆挥手' },
      request: { model: 'doubao-seedance-2-0-260128' },
      blockers: [],
      realReady: true,
      confirmationToken: 'current-token',
    }
    resolveDryRun({ code: 0, data: result, msg: 'ok' })

    await expect(request).resolves.toEqual(result)
    expect(store.dryRunResult).toEqual(result)
    expect(store.submitPending).toBe(false)
  })

  it('deep-snapshots dry-run DTO and discards a response after nested draft mutation', async () => {
    const store = useVideoGenerationStore()
    store.setEditorDoc({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: '原提示' }] }],
    })
    const response = createDeferred()
    videoGenerationApi.dryRunVideoGeneration.mockReturnValue(response.promise)

    const request = store.runDryRun()
    store.editorDoc.content[0].content.push({ type: 'text', text: '后改内容' })

    expect(videoGenerationApi.dryRunVideoGeneration.mock.calls[0][0].doc).toEqual({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: '原提示' }] }],
    })
    response.resolve({
      code: 0,
      data: { realReady: true, confirmationToken: 'stale-token' },
      msg: 'ok',
    })

    await expect(request).rejects.toMatchObject({
      code: 'VIDEO_GENERATION_STALE_OPERATION',
    })
    expect(store.dryRunResult).toBeNull()
    expect(store.submitPending).toBe(false)
  })

  it('prevents an old dry-run response and finally from winning after clear', async () => {
    const store = useVideoGenerationStore()
    const oldDryRun = createDeferred()
    const newDryRun = createDeferred()
    videoGenerationApi.dryRunVideoGeneration
      .mockReturnValueOnce(oldDryRun.promise)
      .mockReturnValueOnce(newDryRun.promise)

    const oldRequest = store.runDryRun()
    store.clearDraft()
    const newRequest = store.runDryRun()

    oldDryRun.resolve({
      code: 0,
      data: { realReady: true, confirmationToken: 'old-token' },
      msg: 'ok',
    })
    await expect(oldRequest).rejects.toMatchObject({
      code: 'VIDEO_GENERATION_STALE_OPERATION',
    })
    expect(store.dryRunResult).toBeNull()
    expect(store.submitPending).toBe(true)

    newDryRun.resolve({
      code: 0,
      data: { realReady: true, confirmationToken: 'new-token' },
      msg: 'ok',
    })
    await newRequest
    expect(store.dryRunResult.confirmationToken).toBe('new-token')
    expect(store.submitPending).toBe(false)
  })

  it('blocks upload and removal once dry-run or paid submission dispatches', async () => {
    const store = useVideoGenerationStore()
    store.addMedia({ id: 'existing-media', kind: 'image' })
    const dryRun = createDeferred()
    videoGenerationApi.dryRunVideoGeneration.mockReturnValue(dryRun.promise)

    const dryRunRequest = store.runDryRun()
    await expect(store.uploadMedia(new File(['blocked'], 'blocked.png'))).rejects.toMatchObject({
      code: 'VIDEO_GENERATION_REQUEST_PENDING',
    })
    await expect(store.removeMedia('existing-media')).rejects.toMatchObject({
      code: 'VIDEO_GENERATION_REQUEST_PENDING',
    })
    dryRun.resolve({
      code: 0,
      data: { realReady: true, confirmationToken: 'paid-token' },
      msg: 'ok',
    })
    await dryRunRequest

    const paid = createDeferred()
    videoGenerationApi.createVideoGenerationTask.mockReturnValue(paid.promise)
    const paidRequest = store.confirmRealGeneration('paid-token')
    await expect(store.uploadMedia(new File(['blocked'], 'blocked-again.png'))).rejects.toMatchObject({
      code: 'VIDEO_GENERATION_REQUEST_PENDING',
    })
    await expect(store.removeMedia('existing-media')).rejects.toMatchObject({
      code: 'VIDEO_GENERATION_REQUEST_PENDING',
    })
    paid.resolve({
      code: 0,
      data: { taskIds: ['paid-task'], count: 1 },
      msg: 'ok',
    })
    await paidRequest

    expect(videoGenerationApi.uploadReference).not.toHaveBeenCalled()
    expect(videoGenerationApi.deleteReference).not.toHaveBeenCalled()
  })

  it.each([
    { code: 40006, data: {}, msg: 'Dry-run 参数无效' },
    { code: 0, msg: 'missing data' },
  ])('resets submit pending when dry-run envelope is rejected', async (response) => {
    const store = useVideoGenerationStore()
    videoGenerationApi.dryRunVideoGeneration.mockResolvedValue(response)

    await expect(store.runDryRun()).rejects.toBeInstanceOf(Error)

    expect(store.submitPending).toBe(false)
    expect(store.dryRunResult).toBeNull()
  })

  it('requires the exact current confirmation token before creating a task', async () => {
    const store = useVideoGenerationStore()
    store.dryRunResult = { confirmationToken: 'current-token', realReady: true }

    await expect(store.confirmRealGeneration('wrong-token')).rejects.toMatchObject({
      code: 'VIDEO_GENERATION_CONFIRMATION_MISMATCH',
    })

    expect(videoGenerationApi.createVideoGenerationTask).not.toHaveBeenCalled()

    store.setConfig({ ratio: '16:9' })
    await expect(store.confirmRealGeneration('current-token')).rejects.toMatchObject({
      code: 'VIDEO_GENERATION_CONFIRMATION_MISMATCH',
    })
    expect(videoGenerationApi.createVideoGenerationTask).not.toHaveBeenCalled()
  })

  it('prevents double submission and records each returned task ID once', async () => {
    const store = useVideoGenerationStore()
    store.addMedia({ id: 'm1', kind: 'image', remoteUrl: 'https://ignore.example/m1.png' })
    store.dryRunResult = { confirmationToken: 'current-token', realReady: true }
    let resolveCreate
    videoGenerationApi.createVideoGenerationTask.mockReturnValue(new Promise((resolve) => {
      resolveCreate = resolve
    }))

    const creation = store.confirmRealGeneration('current-token')

    expect(store.submitPending).toBe(true)
    expect(videoGenerationApi.createVideoGenerationTask).toHaveBeenCalledTimes(1)
    expect(videoGenerationApi.createVideoGenerationTask).toHaveBeenCalledWith({
      doc: { type: 'doc', content: [{ type: 'paragraph' }] },
      mediaList: [{ id: 'm1', realIndex: 1 }],
      config: {
        mode: 'reference_media',
        ratio: 'adaptive',
        resolution: '720p',
        duration: 5,
        count: 1,
        generateAudio: true,
        returnLastFrame: false,
        watermark: false,
        executionExpiresAfter: 172800,
        priority: 0,
      },
      confirmationToken: 'current-token',
    })
    await expect(store.confirmRealGeneration('current-token')).rejects.toMatchObject({
      code: 'VIDEO_GENERATION_REQUEST_PENDING',
    })
    expect(videoGenerationApi.createVideoGenerationTask).toHaveBeenCalledTimes(1)

    resolveCreate({
      code: 0,
      data: { taskIds: ['task-1', 'task-1', 'task-2'], count: 3 },
      msg: 'ok',
    })

    await expect(creation).resolves.toEqual({
      taskIds: ['task-1', 'task-1', 'task-2'],
      count: 3,
    })
    expect(store.taskList).toEqual([
      { id: 'task-1', status: 'queued' },
      { id: 'task-2', status: 'queued' },
    ])
    expect(store.dryRunResult.confirmationToken).toBe('')
    expect(store.submitPending).toBe(false)
  })

  it('starts polling returned task IDs after confirmed real generation without recreating tasks', async () => {
    vi.useFakeTimers()
    const store = useVideoGenerationStore()
    store.dryRunResult = { confirmationToken: 'poll-token', realReady: true }
    videoGenerationApi.createVideoGenerationTask.mockResolvedValue({
      code: 0,
      data: { taskIds: ['task-poll'], count: 1 },
      msg: 'ok',
    })
    videoGenerationApi.getVideoGenerationTask.mockResolvedValue({
      code: 0,
      data: { id: 'task-poll', status: 'running' },
      msg: 'ok',
    })

    await store.confirmRealGeneration('poll-token')
    expect(store.taskList).toEqual([{ id: 'task-poll', status: 'queued' }])
    await vi.advanceTimersByTimeAsync(3000)

    expect(videoGenerationApi.createVideoGenerationTask).toHaveBeenCalledTimes(1)
    expect(videoGenerationApi.getVideoGenerationTask).toHaveBeenCalledTimes(1)
    expect(videoGenerationApi.getVideoGenerationTask).toHaveBeenCalledWith({
      taskId: 'task-poll',
    })
    expect(store.taskList).toEqual([{ id: 'task-poll', status: 'running' }])
  })

  it('does not retry and retains partial task IDs from a rejected creation envelope', async () => {
    const store = useVideoGenerationStore()
    store.dryRunResult = { confirmationToken: 'single-use-token', realReady: true }
    videoGenerationApi.createVideoGenerationTask.mockResolvedValue({
      code: 50201,
      data: { taskIds: ['task-partial', 'task-partial'], error: { code: 'RateLimitExceeded' } },
      msg: 'Ark 创建任务失败',
    })

    await expect(store.confirmRealGeneration('single-use-token')).rejects.toMatchObject({
      code: 'VIDEO_GENERATION_API_REJECTED',
    })

    expect(videoGenerationApi.createVideoGenerationTask).toHaveBeenCalledTimes(1)
    expect(store.taskList).toEqual([{ id: 'task-partial', status: 'queued' }])
    expect(store.dryRunResult.confirmationToken).toBe('')
    expect(store.submitPending).toBe(false)
  })

  it('retains partial paid task IDs from an Axios-rejected server envelope', async () => {
    const store = useVideoGenerationStore()
    store.dryRunResult = { confirmationToken: 'single-use-token', realReady: true }
    videoGenerationApi.createVideoGenerationTask.mockRejectedValue({
      response: {
        data: {
          code: 50201,
          data: { taskIds: ['paid-created-before-failure'] },
          msg: 'Ark 创建任务失败',
        },
      },
    })

    await expect(store.confirmRealGeneration('single-use-token')).rejects.toMatchObject({
      code: 'VIDEO_GENERATION_API_REJECTED',
    })

    expect(videoGenerationApi.createVideoGenerationTask).toHaveBeenCalledTimes(1)
    expect(store.taskList).toEqual([
      { id: 'paid-created-before-failure', status: 'queued' },
    ])
  })

  it('retains a paid task after clear without overwriting newer token or pending state', async () => {
    const store = useVideoGenerationStore()
    store.dryRunResult = { confirmationToken: 'paid-token', realReady: true }
    const paidCreate = createDeferred()
    const newDryRun = createDeferred()
    const latestDryRun = createDeferred()
    videoGenerationApi.createVideoGenerationTask.mockReturnValue(paidCreate.promise)
    videoGenerationApi.dryRunVideoGeneration
      .mockReturnValueOnce(newDryRun.promise)
      .mockReturnValueOnce(latestDryRun.promise)

    const paidRequest = store.confirmRealGeneration('paid-token')
    store.clearDraft()
    const newRequest = store.runDryRun()
    newDryRun.resolve({
      code: 0,
      data: { realReady: true, confirmationToken: 'new-token' },
      msg: 'ok',
    })
    await newRequest
    const latestRequest = store.runDryRun()
    expect(store.submitPending).toBe(true)

    paidCreate.resolve({
      code: 0,
      data: { taskIds: ['paid-task-after-clear'], count: 1 },
      msg: 'ok',
    })
    await paidRequest

    expect(store.taskList).toEqual([{ id: 'paid-task-after-clear', status: 'queued' }])
    expect(store.dryRunResult.confirmationToken).toBe('new-token')
    expect(store.submitPending).toBe(true)

    latestDryRun.resolve({
      code: 0,
      data: { realReady: true, confirmationToken: 'latest-token' },
      msg: 'ok',
    })
    await latestRequest
    expect(store.dryRunResult.confirmationToken).toBe('latest-token')
    expect(store.submitPending).toBe(false)
  })

  it('polls once and updates a task in place without duplicates or timers', async () => {
    const store = useVideoGenerationStore()
    const timerSpy = vi.spyOn(globalThis, 'setTimeout')
    store.taskList = [{ id: 'task-1', status: 'queued', local: 'preserved' }]
    videoGenerationApi.getVideoGenerationTask
      .mockResolvedValueOnce({
        code: 0,
        data: { id: 'task-1', status: 'running', progress: 25 },
        msg: 'ok',
      })
      .mockResolvedValueOnce({
        code: 0,
        data: {
          id: 'task-1',
          status: 'succeeded',
          progress: 100,
          content: { video_url: 'https://cdn.example.test/task-1.mp4' },
        },
        msg: 'ok',
      })

    await expect(store.pollTask('task-1')).resolves.toMatchObject({
      id: 'task-1',
      status: 'running',
    })
    await store.pollTask('task-1')

    expect(videoGenerationApi.getVideoGenerationTask).toHaveBeenCalledTimes(2)
    expect(videoGenerationApi.getVideoGenerationTask).toHaveBeenNthCalledWith(1, {
      taskId: 'task-1',
    })
    expect(store.taskList).toEqual([{
      id: 'task-1',
      status: 'succeeded',
      progress: 100,
      local: 'preserved',
      content: { video_url: 'https://cdn.example.test/task-1.mp4' },
    }])
    expect(timerSpy).not.toHaveBeenCalled()
    timerSpy.mockRestore()
  })

  it('upserts an unknown one-shot task once and preserves it on polling failure', async () => {
    const store = useVideoGenerationStore()
    videoGenerationApi.getVideoGenerationTask.mockResolvedValueOnce({
      code: 0,
      data: { task_id: 'task-2', status: 'running' },
      msg: 'ok',
    })

    await store.pollTask('task-2')
    expect(store.taskList).toEqual([{
      id: 'task-2',
      task_id: 'task-2',
      status: 'running',
    }])

    videoGenerationApi.getVideoGenerationTask.mockResolvedValueOnce({
      code: 50202,
      data: { error: { code: 'NotFound' } },
      msg: '查询失败',
    })
    await expect(store.pollTask('task-2')).rejects.toMatchObject({
      code: 'VIDEO_GENERATION_API_REJECTED',
    })

    expect(store.taskList).toEqual([{
      id: 'task-2',
      task_id: 'task-2',
      status: 'running',
    }])
  })

  it.each([
    [{ status: 'running' }, 'missing id'],
    [{ id: 'different-task', status: 'running' }, 'mismatched id'],
    [{ id: 'task-2', status: 'processing' }, 'unknown status'],
    [{ id_task: 'task-2', status: 'running' }, 'nonofficial id_task field'],
    [{ task_id: 'task-2', status: 'succeeded' }, 'missing succeeded content'],
    [{ task_id: 'task-2', status: 'succeeded', content: { video_url: '' } }, 'empty video URL'],
    [{ task_id: 'task-2', status: 'succeeded', content: { video_url: 'http://cdn.test/video.mp4' } }, 'non-HTTPS video URL'],
    [{ task_id: 'task-2', status: 'succeeded', content: { video_url: 'https://' } }, 'invalid HTTPS video URL'],
  ])('rejects a malformed poll result without mutating task state: %s', async (data) => {
    const store = useVideoGenerationStore()
    store.taskList = [{ id: 'task-2', status: 'queued', local: 'keep' }]
    videoGenerationApi.getVideoGenerationTask.mockResolvedValue({
      code: 0,
      data,
      msg: 'ok',
    })

    await expect(store.pollTask('task-2')).rejects.toMatchObject({
      code: 'VIDEO_GENERATION_API_MALFORMED',
    })
    expect(store.taskList).toEqual([{ id: 'task-2', status: 'queued', local: 'keep' }])
  })

  it('accepts a succeeded task only with an HTTPS playable URL', async () => {
    const store = useVideoGenerationStore()
    videoGenerationApi.getVideoGenerationTask.mockResolvedValue({
      code: 0,
      data: {
        task_id: 'task-success',
        status: 'succeeded',
        content: { video_url: 'https://cdn.example.test/result/video.mp4' },
      },
      msg: 'ok',
    })

    await expect(store.pollTask('task-success')).resolves.toMatchObject({
      id: 'task-success',
      status: 'succeeded',
      content: { video_url: 'https://cdn.example.test/result/video.mp4' },
    })
  })

  it('polls active tasks every three seconds', async () => {
    vi.useFakeTimers()
    const store = useVideoGenerationStore()
    store.taskList = [{ id: 'task-interval', status: 'queued' }]
    videoGenerationApi.getVideoGenerationTask.mockResolvedValue({
      code: 0,
      data: { id: 'task-interval', status: 'running' },
      msg: 'ok',
    })

    expect(store.startPolling('task-interval')).toBe(true)
    await vi.advanceTimersByTimeAsync(2999)
    expect(videoGenerationApi.getVideoGenerationTask).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)

    expect(videoGenerationApi.getVideoGenerationTask).toHaveBeenCalledTimes(1)
    expect(videoGenerationApi.getVideoGenerationTask).toHaveBeenCalledWith({
      taskId: 'task-interval',
    })
  })

  it('polls every ten seconds while document.visibilityState is hidden', async () => {
    vi.useFakeTimers()
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    const store = useVideoGenerationStore()
    store.taskList = [{ id: 'task-hidden', status: 'queued' }]
    videoGenerationApi.getVideoGenerationTask.mockResolvedValue({
      code: 0,
      data: { id: 'task-hidden', status: 'running' },
      msg: 'ok',
    })

    store.startPolling('task-hidden')
    await vi.advanceTimersByTimeAsync(9999)
    expect(videoGenerationApi.getVideoGenerationTask).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)

    expect(videoGenerationApi.getVideoGenerationTask).toHaveBeenCalledTimes(1)
  })

  it('stops polling succeeded, failed, and cancelled tasks', async () => {
    vi.useFakeTimers()
    const store = useVideoGenerationStore()
    store.taskList = [{ id: 'task-terminal', status: 'running' }]
    videoGenerationApi.getVideoGenerationTask.mockResolvedValue({
      code: 0,
      data: {
        id: 'task-terminal',
        status: 'succeeded',
        content: { video_url: 'https://cdn.example.test/task-terminal.mp4' },
      },
      msg: 'ok',
    })

    store.startPolling('task-terminal')
    await vi.advanceTimersByTimeAsync(3000)

    expect(store.taskList[0].status).toBe('succeeded')
    expect(vi.getTimerCount()).toBe(0)
    for (const status of ['succeeded', 'failed', 'cancelled']) {
      store.taskList = [{ id: `task-${status}`, status }]
      expect(store.startPolling(`task-${status}`)).toBe(false)
    }
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not recreate a task after query failure', async () => {
    vi.useFakeTimers()
    const store = useVideoGenerationStore()
    videoGenerationApi.getVideoGenerationTask.mockRejectedValue(new Error('timeout'))

    store.startPolling('unknown-task')
    await vi.advanceTimersByTimeAsync(3000)

    expect(videoGenerationApi.getVideoGenerationTask).toHaveBeenCalledTimes(1)
    expect(videoGenerationApi.createVideoGenerationTask).not.toHaveBeenCalled()
    expect(store.taskList).toEqual([])
    expect(vi.getTimerCount()).toBe(0)
  })

  it('retains task IDs when polling times out', async () => {
    vi.useFakeTimers()
    const store = useVideoGenerationStore()
    store.taskList = [{ id: 'task-timeout', status: 'running' }]
    videoGenerationApi.getVideoGenerationTask.mockRejectedValue(new Error('timeout'))

    store.startPolling('task-timeout')
    await vi.advanceTimersByTimeAsync(3000)

    expect(store.taskList).toEqual([{ id: 'task-timeout', status: 'running' }])
    expect(vi.getTimerCount()).toBe(1)
  })

  it('ignores in-flight polling results after clearDraft', async () => {
    vi.useFakeTimers()
    const store = useVideoGenerationStore()
    const response = createDeferred()
    store.taskList = [{ id: 'task-clear-race', status: 'running' }]
    videoGenerationApi.getVideoGenerationTask.mockReturnValue(response.promise)

    store.startPolling('task-clear-race')
    await vi.advanceTimersByTimeAsync(3000)
    expect(videoGenerationApi.getVideoGenerationTask).toHaveBeenCalledTimes(1)

    store.clearDraft()
    response.resolve({
      code: 0,
      data: { id: 'task-clear-race', status: 'running' },
      msg: 'ok',
    })
    await Promise.resolve()
    await Promise.resolve()

    expect(store.taskList).toEqual([])
    expect(vi.getTimerCount()).toBe(0)
  })

  it('ignores in-flight polling results after store disposal', async () => {
    vi.useFakeTimers()
    const store = useVideoGenerationStore()
    const response = createDeferred()
    store.taskList = [{ id: 'task-dispose-race', status: 'running' }]
    videoGenerationApi.getVideoGenerationTask.mockReturnValue(response.promise)

    store.startPolling('task-dispose-race')
    await vi.advanceTimersByTimeAsync(3000)
    store.$dispose()
    response.resolve({
      code: 0,
      data: { id: 'task-dispose-race', status: 'running' },
      msg: 'ok',
    })
    await Promise.resolve()
    await Promise.resolve()

    expect(store.taskList).toEqual([{ id: 'task-dispose-race', status: 'running' }])
    expect(vi.getTimerCount()).toBe(0)
  })
})

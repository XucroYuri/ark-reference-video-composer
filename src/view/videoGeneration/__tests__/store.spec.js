import { beforeEach, describe, expect, it, vi } from 'vitest'
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
    vi.clearAllMocks()
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
    store.setConfig({ duration: 10, injected: 'discard-me' })
    expect(store.dryRunResult).toBeNull()
    expect(store.config.duration).toBe(10)
    expect(store.config).not.toHaveProperty('injected')
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
        data: { id: 'task-1', status: 'succeeded', progress: 100 },
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
})

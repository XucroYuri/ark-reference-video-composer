import { beforeEach, describe, expect, it, vi } from 'vitest'

import service from '@/utils/request'
import {
  createVideoGenerationTask,
  deleteReference,
  deleteVideoGenerationTask,
  dryRunVideoGeneration,
  getVideoGenerationTask,
  uploadReference,
} from '../videoGeneration'

vi.mock('@/utils/request', () => ({ default: vi.fn() }))

describe('video generation API adapter', () => {
  beforeEach(() => vi.clearAllMocks())

  it('overrides the JSON default for multipart while leaving the browser boundary to Axios', () => {
    const formData = new FormData()

    uploadReference(formData)

    const config = service.mock.calls[0][0]
    expect(config).toEqual({
      url: '/videoGeneration/uploadReference',
      method: 'post',
      data: formData,
      headers: { 'Content-Type': 'multipart/form-data' },
      validateStatus: expect.any(Function),
    })
    const interceptorMergedHeaders = {
      'Content-Type': 'application/json',
      ...config.headers,
    }
    expect(interceptorMergedHeaders['Content-Type']).toBe('multipart/form-data')
  })

  it('uses hc-gpt-web request shapes and the established silent-loading spelling', () => {
    deleteReference({ mediaId: 'm1' })
    dryRunVideoGeneration({ doc: {} })
    createVideoGenerationTask({ confirmationToken: 'token' })
    getVideoGenerationTask({ taskId: 'task-1' })
    deleteVideoGenerationTask({ taskId: 'task-1' })

    expect(service.mock.calls).toEqual([
      [{
        url: '/videoGeneration/deleteReference',
        method: 'post',
        data: { mediaId: 'm1' },
        validateStatus: expect.any(Function),
      }],
      [{
        url: '/videoGeneration/dryRun',
        method: 'post',
        data: { doc: {} },
        donNotShowLoading: true,
        validateStatus: expect.any(Function),
      }],
      [{
        url: '/videoGeneration/createTask',
        method: 'post',
        data: { confirmationToken: 'token' },
        validateStatus: expect.any(Function),
      }],
      [{
        url: '/videoGeneration/getTask',
        method: 'get',
        params: { taskId: 'task-1' },
        donNotShowLoading: true,
        validateStatus: expect.any(Function),
      }],
      [{
        url: '/videoGeneration/deleteTask',
        method: 'post',
        data: { taskId: 'task-1' },
        validateStatus: expect.any(Function),
      }],
    ])

    for (const [config] of service.mock.calls) {
      expect(config.validateStatus(199)).toBe(false)
      expect(config.validateStatus(200)).toBe(true)
      expect(config.validateStatus(409)).toBe(true)
      expect(config.validateStatus(599)).toBe(true)
      expect(config.validateStatus(600)).toBe(false)
    }
  })
})

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

  it('lets Axios infer the multipart upload boundary', () => {
    const formData = new FormData()

    uploadReference(formData)

    expect(service).toHaveBeenCalledWith({
      url: '/videoGeneration/uploadReference',
      method: 'post',
      data: formData,
    })
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
      }],
      [{
        url: '/videoGeneration/dryRun',
        method: 'post',
        data: { doc: {} },
        donNotShowLoading: true,
      }],
      [{
        url: '/videoGeneration/createTask',
        method: 'post',
        data: { confirmationToken: 'token' },
      }],
      [{
        url: '/videoGeneration/getTask',
        method: 'get',
        params: { taskId: 'task-1' },
        donNotShowLoading: true,
      }],
      [{
        url: '/videoGeneration/deleteTask',
        method: 'post',
        data: { taskId: 'task-1' },
      }],
    ])
  })
})

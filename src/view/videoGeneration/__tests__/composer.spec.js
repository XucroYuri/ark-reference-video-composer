import { readFile } from 'node:fs/promises'

import ElementPlus from 'element-plus'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

import VideoGeneration from '../index.vue'
import GenerationOptionsBar from '../components/GenerationOptionsBar.vue'
import GenerationTaskPanel from '../components/GenerationTaskPanel.vue'
import RemoteReferenceForm from '../components/RemoteReferenceForm.vue'
import TaskHistoryFilters from '../components/TaskHistoryFilters.vue'
import { useVideoGenerationStore } from '../store'
import * as videoGenerationApi from '@/api/videoGeneration'

vi.mock('@/api/videoGeneration', () => ({
  uploadReference: vi.fn(),
  registerRemoteReference: vi.fn(),
  deleteReference: vi.fn(),
  dryRunVideoGeneration: vi.fn(),
  createVideoGenerationTask: vi.fn(),
  getVideoGenerationTask: vi.fn(),
  listVideoGenerationTasks: vi.fn(),
  deleteVideoGenerationTask: vi.fn(),
}))

const imagePath = '/Users/huachi/Downloads/参考图/小豆人设/小豆日常/小豆Q版.png'
const mediaEnvelope = {
  code: 0,
  data: {
    id: 'media-1',
    kind: 'image',
    name: '小豆Q版.png',
    mimeType: 'image/png',
    size: 1024,
    status: 'ready',
    previewUrl: '/uploads/media-1.png',
  },
  msg: '上传成功',
}
const deleteEnvelope = { code: 0, data: {}, msg: '删除成功' }
const remoteUrl = 'https://images.example.test/boardwalk.jpg'
const remoteEnvelope = {
  code: 0,
  data: {
    id: '00000000-0000-4000-8000-000000000001',
    source: 'remote_url',
    kind: 'image',
    name: 'Boardwalk',
    status: 'ready',
    previewUrl: remoteUrl,
    remoteUrl,
  },
  msg: '公网参考素材登记成功',
}
const dryRunEnvelope = {
  code: 0,
  data: {
    realReady: false,
    confirmationToken: '',
    blockers: [{ code: 'REAL_GENERATION_DISABLED', message: '真实生成未启用' }],
    serialization: {
      readablePrompt: '让 @图片1 挥手',
      templatePrompt: '让 <<<image_1_1>>> 挥手',
      modelPrompt: '让 【图片 1】 挥手',
      media: [{ id: 'media-1', realIndex: 1, url: 'local://media-1' }],
    },
    request: {
      model: 'doubao-seedance-2-0-260128',
      ratio: 'adaptive',
      resolution: '720p',
      duration: 5,
      generate_audio: true,
      content: [{ type: 'text', text: '让 【图片 1】 挥手' }],
    },
  },
  msg: 'Dry-run 校验成功',
}

async function flush() {
  await Promise.resolve()
  await nextTick()
}

function createDeferred() {
  let resolve
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

async function createImageFile() {
  const bytes = await readFile(imagePath)
  return new File([bytes], '小豆Q版.png', { type: 'image/png' })
}

function mountComposer() {
  const pinia = createPinia()
  setActivePinia(pinia)
  return mount(VideoGeneration, {
    attachTo: document.body,
    global: {
      plugins: [pinia, ElementPlus],
      stubs: {
        transition: false,
        teleport: true,
      },
    },
  })
}

async function uploadReference(wrapper) {
  const upload = wrapper.findComponent({ name: 'ElUpload' })
  const file = await createImageFile()
  await upload.props('onChange')({ raw: file, name: file.name })
  await flush()
  await flush()
}

describe('VideoGeneration composer', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
    vi.unstubAllGlobals()
    videoGenerationApi.uploadReference.mockResolvedValue(mediaEnvelope)
    videoGenerationApi.registerRemoteReference.mockResolvedValue(remoteEnvelope)
    videoGenerationApi.deleteReference.mockResolvedValue(deleteEnvelope)
    videoGenerationApi.dryRunVideoGeneration.mockResolvedValue(dryRunEnvelope)
    videoGenerationApi.createVideoGenerationTask.mockResolvedValue({
      code: 0,
      data: { taskIds: ['task-1'] },
      msg: '创建成功',
    })
  })

  it('renders the exact default controls and prompt guidance', () => {
    const wrapper = mountComposer()

    expect(wrapper.text()).toContain('体验视频生成，让创意摇动')
    expect(wrapper.text()).toContain('参考内容')
    expect(wrapper.text()).toContain('使用 @ 可快速引用上传的文件')
    expect(wrapper.text()).toContain('参考生成')
    expect(wrapper.text()).toContain('智能比例')
    expect(wrapper.text()).toContain('720P')
    expect(wrapper.text()).toContain('5秒')
    expect(wrapper.text()).toContain('1条')
    expect(wrapper.text()).toContain('有声')
    expect(wrapper.text()).toContain('实际费用以方舟控制台为准')
    wrapper.unmount()
  })

  it('retains both remote fields when pending ends before the parent reports failure', async () => {
    const wrapper = mount(RemoteReferenceForm, {
      props: { pending: false, errorMessage: '', successSignal: 0 },
    })

    await wrapper.find('input[type="url"]').setValue(`  ${remoteUrl}  `)
    await wrapper.find('input[type="text"]').setValue('  Boardwalk  ')
    await wrapper.find('form').trigger('submit')
    await wrapper.setProps({ pending: true })
    await wrapper.setProps({ pending: false })
    await nextTick()
    await wrapper.setProps({ errorMessage: '登记失败' })

    expect(wrapper.find('input[type="url"]').element.value).toBe(remoteUrl)
    expect(wrapper.find('input[type="text"]').element.value).toBe('  Boardwalk  ')
    expect(wrapper.text()).toContain('登记失败')
    wrapper.unmount()
  })

  it('clears remote fields exactly once after an explicit parent success signal', async () => {
    const wrapper = mount(RemoteReferenceForm, {
      props: { pending: false, errorMessage: '', successSignal: 0 },
    })

    await wrapper.find('input[type="url"]').setValue(remoteUrl)
    await wrapper.find('input[type="text"]').setValue('Boardwalk')
    await wrapper.find('form').trigger('submit')

    await wrapper.setProps({ successSignal: 1 })
    expect(wrapper.find('input[type="url"]').element.value).toBe('')
    expect(wrapper.find('input[type="text"]').element.value).toBe('')

    await wrapper.find('input[type="url"]').setValue('https://images.example.test/next.jpg')
    await wrapper.find('input[type="text"]').setValue('Next')
    await wrapper.setProps({ pending: true })
    await wrapper.setProps({ pending: false, successSignal: 2 })
    expect(wrapper.find('input[type="url"]').element.value).toBe(
      'https://images.example.test/next.jpg',
    )
    expect(wrapper.find('input[type="text"]').element.value).toBe('Next')
    wrapper.unmount()
  })

  it('uploads 小豆Q版.png and displays 图片1', async () => {
    const wrapper = mountComposer()

    await uploadReference(wrapper)

    expect(videoGenerationApi.uploadReference).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('图片1')
    wrapper.unmount()
  })

  it('inserts @图片1 only after the reference becomes ready', async () => {
    const wrapper = mountComposer()

    expect(wrapper.find('.mention-trigger').exists()).toBe(false)
    await uploadReference(wrapper)
    await wrapper.find('.mention-trigger').trigger('click')
    await flush()

    expect(wrapper.find('.ProseMirror').text()).toContain('@图片1')
    wrapper.unmount()
  })

  it('registers a URL, mentions 图片1, and Dry-runs only its authoritative identity', async () => {
    const registration = createDeferred()
    videoGenerationApi.registerRemoteReference.mockReturnValue(registration.promise)
    videoGenerationApi.dryRunVideoGeneration.mockResolvedValue({
      ...dryRunEnvelope,
      data: {
        ...dryRunEnvelope.data,
        serialization: {
          ...dryRunEnvelope.data.serialization,
          readablePrompt: '@图片1',
          media: [{
            id: remoteEnvelope.data.id,
            realIndex: 1,
            url: remoteUrl,
          }],
        },
        request: {
          ...dryRunEnvelope.data.request,
          content: [
            { type: 'text', text: '【图片 1】' },
            { type: 'image_url', image_url: { url: remoteUrl } },
          ],
        },
      },
    })
    const wrapper = mountComposer()

    await wrapper.find('.remote-reference-form input[type="url"]').setValue(`  ${remoteUrl}  `)
    await wrapper.find('.remote-reference-form input[type="text"]').setValue('  Boardwalk  ')
    await wrapper.find('.remote-reference-form').trigger('submit')
    await flush()

    expect(wrapper.find('.remote-reference-form button').attributes('disabled')).toBeDefined()
    expect(wrapper.find('.remote-reference-form input[type="url"]').element.value).toContain(remoteUrl)
    registration.resolve(remoteEnvelope)
    await flush()
    await flush()

    expect(videoGenerationApi.registerRemoteReference).toHaveBeenCalledWith({
      url: remoteUrl,
      name: 'Boardwalk',
    })
    expect(wrapper.find('.remote-reference-form input[type="url"]').element.value).toBe('')
    expect(wrapper.find('.remote-reference-form input[type="text"]').element.value).toBe('')
    expect(wrapper.text()).toContain('图片1')
    expect(wrapper.find('.reference-thumbnail').attributes('referrerpolicy')).toBe('no-referrer')

    await wrapper.find('.mention-trigger').trigger('click')
    await flush()
    expect(wrapper.find('.ProseMirror').text()).toContain('@图片1')

    await wrapper.find('[aria-label="提交 Dry-run"]').trigger('click')
    await flush()
    await flush()

    const submitted = videoGenerationApi.dryRunVideoGeneration.mock.calls[0][0]
    expect(submitted.mediaList).toEqual([{ id: remoteEnvelope.data.id, realIndex: 1 }])
    expect(wrapper.text()).toContain(remoteUrl)
    wrapper.unmount()
  })

  it('updates ratio, resolution, duration, count, and audio configuration', async () => {
    const wrapper = mountComposer()

    await wrapper.find('[data-testid="generation-options-trigger"]').trigger('click')
    await flush()
    await wrapper.find('[data-testid="ratio-select"]').setValue('16:9')
    await wrapper.find('[data-testid="resolution-select"]').setValue('1080p')
    await wrapper.find('[data-testid="duration-select"]').setValue('10')
    await wrapper.find('[data-testid="count-select"]').setValue('4')
    await wrapper.find('[data-testid="audio-select"]').setValue('false')
    await flush()

    const store = useVideoGenerationStore()
    expect(store.config).toMatchObject({
      ratio: '16:9',
      resolution: '1080p',
      duration: 10,
      count: 4,
      generateAudio: false,
    })
    expect(wrapper.text()).toContain('1080P')
    expect(wrapper.text()).toContain('10秒')
    expect(wrapper.text()).toContain('4条')
    expect(wrapper.text()).toContain('无声')
    wrapper.unmount()
  })

  it('emits advanced generation options as typed patches', async () => {
    const wrapper = mount(GenerationOptionsBar, {
      props: {
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
      },
      global: { plugins: [ElementPlus] },
    })

    await wrapper.find('[data-testid="generation-options-trigger"]').trigger('click')
    await flush()
    await wrapper.find('[data-testid="ratio-select"]').setValue('4:3')
    await wrapper.find('[data-testid="resolution-select"]').setValue('480p')
    await wrapper.find('[data-testid="duration-select"]').setValue('15')
    await wrapper.find('input[type="checkbox"]').setValue(true)
    await wrapper.findAll('input[type="checkbox"]')[1].setValue(true)
    await wrapper.find('[data-testid="expires-input"]').setValue('3600')
    await wrapper.find('[data-testid="priority-input"]').setValue('9')

    expect(wrapper.emitted('update')).toEqual([
      [{ ratio: '4:3' }],
      [{ resolution: '480p' }],
      [{ duration: 15 }],
      [{ returnLastFrame: true }],
      [{ watermark: true }],
      [{ executionExpiresAfter: 3600 }],
      [{ priority: 9 }],
    ])
    wrapper.unmount()
  })

  it('opens Dry-run preview instead of creating a paid task', async () => {
    const wrapper = mountComposer()

    await uploadReference(wrapper)
    await wrapper.find('[aria-label="提交 Dry-run"]').trigger('click')
    await flush()
    await flush()

    expect(videoGenerationApi.dryRunVideoGeneration).toHaveBeenCalledTimes(1)
    expect(videoGenerationApi.createVideoGenerationTask).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('可读提示词')
    expect(wrapper.text()).toContain('控制台兼容模板')
    expect(wrapper.text()).toContain('模型规范文本')
    expect(wrapper.text()).toContain('媒体映射')
    expect(wrapper.text()).toContain('最终 API 请求')
    expect(wrapper.text()).toContain('仅复制 JSON')
    wrapper.unmount()
  })

  it('keeps blocked real generation visible and disabled without emitting a create', async () => {
    const wrapper = mountComposer()

    await uploadReference(wrapper)
    await wrapper.find('[aria-label="提交 Dry-run"]').trigger('click')
    await flush()
    await flush()

    const realGeneration = wrapper.find('[data-testid="real-generation-button"]')
    expect(realGeneration.exists()).toBe(true)
    expect(realGeneration.attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-testid="real-confirm-checkbox"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('真实生成未启用')

    await realGeneration.trigger('click')
    await flush()
    expect(
      wrapper.findComponent({ name: 'RequestPreviewDrawer' }).emitted('confirm-real'),
    ).toBeUndefined()
    expect(videoGenerationApi.createVideoGenerationTask).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('clear all resets editor, media, parameters, preview, and tasks', async () => {
    const wrapper = mountComposer()

    await uploadReference(wrapper)
    await wrapper.find('[data-testid="generation-options-trigger"]').trigger('click')
    await flush()
    await wrapper.find('[data-testid="ratio-select"]').setValue('16:9')
    await wrapper.find('.mention-trigger').trigger('click')
    await flush()
    await wrapper.find('.clear-all-button').trigger('click')
    await flush()

    const store = useVideoGenerationStore()
    expect(store.mediaList).toEqual([])
    expect(store.taskList).toEqual([])
    expect(store.dryRunResult).toBeNull()
    expect(store.config).toMatchObject({
      ratio: 'adaptive',
      resolution: '720p',
      duration: 5,
      count: 1,
      generateAudio: true,
    })
    expect(wrapper.text()).toContain('参考内容')
    expect(wrapper.text()).not.toContain('图片1')
    wrapper.unmount()
  })

  it('requires confirmation before deleting media referenced by the editor', async () => {
    const confirm = vi.fn()
    vi.stubGlobal('confirm', confirm)
    const wrapper = mountComposer()

    await uploadReference(wrapper)
    await wrapper.find('.mention-trigger').trigger('click')
    await flush()

    confirm.mockReturnValueOnce(false)
    await wrapper.find('[aria-label="删除图片1"]').trigger('click')
    await flush()
    expect(videoGenerationApi.deleteReference).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('图片1')

    confirm.mockReturnValueOnce(true)
    await wrapper.find('[aria-label="删除图片1"]').trigger('click')
    await flush()
    expect(videoGenerationApi.deleteReference).toHaveBeenCalledWith({ mediaId: 'media-1' })
    expect(useVideoGenerationStore().mediaList).toEqual([])
    wrapper.unmount()
  })

  it('renders official task states, result fields, expiry guidance, and the DELETE action matrix', async () => {
    const wrapper = mount(GenerationTaskPanel, {
      props: {
        taskList: [
          { id: 'task-queued', status: 'queued' },
          { id: 'task-running', status: 'running' },
          {
            id: 'task-succeeded',
            status: 'succeeded',
            model: 'doubao-seedance-2-0-260128',
            resolution: '1080p',
            ratio: '16:9',
            duration: 10,
            generate_audio: true,
            usage: { completion_tokens: 314 },
            content: {
              video_url: 'https://cdn.example.test/temporary/video.mp4',
              last_frame_url: 'https://cdn.example.test/temporary/last-frame.png',
            },
          },
          {
            id: 'task-failed',
            status: 'failed',
            error: {
              code: 'OutputVideoSensitiveContentDetected',
              message: '输出视频包含敏感内容',
            },
          },
          { id: 'task-cancelled', status: 'cancelled' },
          { id: 'task-expired', status: 'expired' },
          { id: 'task-unavailable', status: 'unavailable' },
        ],
        total: 7,
      },
    })

    expect(wrapper.text()).toContain('任务超时')
    expect(wrapper.text()).toContain('任务不可用')
    expect(wrapper.text()).toContain('OutputVideoSensitiveContentDetected')
    expect(wrapper.text()).toContain('输出视频包含敏感内容')
    expect(wrapper.text()).toContain('视频链接有效期为 24 小时')
    expect(wrapper.text()).toContain('视频与尾帧链接有效期为 24 小时')
    expect(wrapper.find('[data-task-status="queued"] [data-action="delete"]').text()).toBe('取消任务')
    expect(wrapper.find('[data-task-status="succeeded"] [data-action="delete"]').text()).toBe('删除记录')
    expect(wrapper.find('[data-task-status="running"] [data-action="delete"]').exists()).toBe(false)
    expect(wrapper.find('[data-task-status="cancelled"] [data-action="delete"]').exists()).toBe(false)
    expect(wrapper.find('[data-task-status="unavailable"] [data-action="delete"]').exists()).toBe(false)

    const succeeded = wrapper.find('[data-task-status="succeeded"]')
    expect(succeeded.text()).toContain('usage.completion_tokens')
    expect(succeeded.text()).toContain('314')
    expect(succeeded.text()).toContain('content.video_url')
    expect(succeeded.text()).toContain('content.last_frame_url')
    expect(succeeded.text()).toContain('resolution')
    expect(succeeded.text()).toContain('1080p')
    expect(succeeded.text()).toContain('ratio')
    expect(succeeded.text()).toContain('16:9')
    expect(succeeded.text()).toContain('duration')
    expect(succeeded.text()).toContain('10')
    expect(succeeded.text()).toContain('generate_audio')
    expect(succeeded.text()).toContain('true')
    expect(succeeded.find('video').attributes()).toMatchObject({
      src: 'https://cdn.example.test/temporary/video.mp4',
      controls: '',
      playsinline: '',
      preload: 'metadata',
    })
    expect(succeeded.find('video').attributes('autoplay')).toBeUndefined()
    expect(succeeded.find('a').attributes()).toMatchObject({
      href: 'https://cdn.example.test/temporary/video.mp4',
      target: '_blank',
      rel: 'noopener noreferrer',
    })
    expect(succeeded.find('img').attributes()).toMatchObject({
      src: 'https://cdn.example.test/temporary/last-frame.png',
      alt: '生成视频尾帧',
      referrerpolicy: 'no-referrer',
    })

    expect(wrapper.html()).not.toContain('task-succeeded')
    expect(wrapper.text()).not.toContain('task-succeeded')
    expect(succeeded.find('[data-action="copy"]').attributes('aria-label')).toBe('复制完整任务 ID')

    await wrapper.find('[data-task-status="running"] [data-action="refresh"]').trigger('click')
    await wrapper.find('[data-task-status="queued"] [data-action="delete"]').trigger('click')
    await wrapper.find('[data-task-status="succeeded"] [data-action="delete"]').trigger('click')
    expect(wrapper.emitted('refresh-task')).toEqual([['task-running']])
    expect(wrapper.emitted('remove-or-cancel')).toEqual([
      [{ id: 'task-queued', status: 'queued' }],
      [expect.objectContaining({ id: 'task-succeeded', status: 'succeeded' })],
    ])
    wrapper.unmount()
  })

  it('keeps sensitive task identity out of rendered HTML before copy or task actions', async () => {
    const fullTaskId = 'task-sensitive-identity-1234567890'
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const wrapper = mount(GenerationTaskPanel, {
      props: {
        taskList: [{ id: fullTaskId, status: 'queued' }],
      },
    })

    expect(wrapper.html()).not.toContain(fullTaskId)
    expect(wrapper.text()).toContain('task…7890')
    expect(wrapper.find('[data-action="copy"]').exists()).toBe(true)
    expect(wrapper.find('[data-action="refresh"]').exists()).toBe(true)
    expect(wrapper.find('[data-action="delete"]').exists()).toBe(true)
    await wrapper.find('[data-action="copy"]').trigger('click')
    await flush()
    expect(writeText).toHaveBeenCalledWith(fullTaskId)
    wrapper.unmount()
  })

  it('sanitizes provider task errors, bounds display text, and retains safe fallbacks', () => {
    const fullTaskId = 'task-provider-secret-1234567890'
    const temporaryUrl = 'https://cdn.example.test/temporary/private-video.mp4?token=url-secret'
    const bearerSecret = 'bearer-super-secret-token'
    const apiKeySecret = 'sk-provider-secret-key'
    const oversized = `Provider detail ${'x'.repeat(600)}`
    const wrapper = mount(GenerationTaskPanel, {
      props: {
        taskList: [{
          id: fullTaskId,
          status: 'failed',
          error: {
            code: `ProviderError ${fullTaskId} ${temporaryUrl}`,
            message: `Authorization: Bearer ${bearerSecret} api_key=${apiKeySecret} ${oversized}`,
          },
        }],
      },
    })

    const html = wrapper.html()
    expect(html).not.toContain(fullTaskId)
    expect(html).not.toContain(temporaryUrl)
    expect(html).not.toContain(bearerSecret)
    expect(html).not.toContain(apiKeySecret)
    expect(wrapper.text()).toContain('error.code')
    expect(wrapper.text()).toContain('error.message')
    expect(wrapper.text()).toContain('[已隐藏]')
    expect(wrapper.text()).toContain('…（已截断）')

    const fallback = mount(GenerationTaskPanel, {
      props: {
        taskList: [{ id: 'task-fallback-secret', status: 'failed', error: { code: '', message: null } }],
      },
    })
    expect(fallback.html()).not.toContain('task-fallback-secret')
    expect(fallback.text()).toContain('生成失败')
    expect(fallback.text()).toContain('方舟未返回错误详情')
    fallback.unmount()
    wrapper.unmount()
  })

  it('redacts plain credential assignments while preserving safe provider context', () => {
    const secrets = {
      token: 'PLAIN_TOKEN_VALUE_123',
      authToken: 'AUTH_TOKEN_VALUE_456',
      accessToken: 'ACCESS_TOKEN_VALUE_789',
      refreshToken: 'REFRESH_TOKEN_VALUE_012',
      apiKey: 'API_KEY_VALUE_345',
      apikey: 'APIKEY_VALUE_678',
      password: 'PASSWORD_VALUE_901',
      secret: 'SECRET_VALUE_234',
      credential: 'CREDENTIAL_VALUE_567',
    }
    const wrapper = mount(GenerationTaskPanel, {
      props: {
        taskList: [{
          id: 'task-plain-credential-sensitive',
          status: 'failed',
          error: {
            code: `Safe code context token=${secrets.token} auth_token = "${secrets.authToken}"`,
            message: [
              'Safe message context',
              `access_token:${secrets.accessToken}`,
              `refresh_token = '${secrets.refreshToken}'`,
              `api_key=${secrets.apiKey}`,
              `apikey: ${secrets.apikey}`,
              `password=${secrets.password}`,
              `secret: "${secrets.secret}"`,
              `credential='${secrets.credential}'`,
              'ordinary token discussion remains visible',
              'Safe message suffix',
            ].join(' '),
          },
        }],
      },
    })

    const html = wrapper.html()
    Object.values(secrets).forEach((secret) => expect(html).not.toContain(secret))
    expect(wrapper.text()).toContain('Safe code context')
    expect(wrapper.text()).toContain('Safe message context')
    expect(wrapper.text()).toContain('ordinary token discussion remains visible')
    expect(wrapper.text()).toContain('Safe message suffix')
    wrapper.unmount()
  })

  it('redacts serialized credential JSON while preserving safe provider context', () => {
    const secrets = {
      apiKey: 'JSON_API_KEY_VALUE_123',
      password: 'JSON_PASSWORD_VALUE_456',
      token: 'JSON_TOKEN_VALUE_789',
      authToken: 'JSON_AUTH_TOKEN_VALUE_012',
      credential: 'JSON_CREDENTIAL_VALUE_345',
    }
    const serialized = JSON.stringify({
      api_key: secrets.apiKey,
      password: secrets.password,
      TOKEN: secrets.token,
      Auth_Token: secrets.authToken,
      credential: secrets.credential,
      safe_field: 'visible-safe-value',
    })
    const wrapper = mount(GenerationTaskPanel, {
      props: {
        taskList: [{
          id: 'task-json-credential-sensitive',
          status: 'failed',
          error: {
            code: 'Safe JSON code context',
            message: `Safe JSON prefix ${serialized} Safe JSON suffix`,
          },
        }],
      },
    })

    const html = wrapper.html()
    Object.values(secrets).forEach((secret) => expect(html).not.toContain(secret))
    expect(wrapper.text()).toContain('Safe JSON prefix')
    expect(wrapper.text()).toContain('visible-safe-value')
    expect(wrapper.text()).toContain('Safe JSON suffix')
    wrapper.unmount()
  })

  it('redacts escaped quotes and backslashes throughout serialized credential values', () => {
    const secrets = {
      password: 'quote-before"quote-after',
      apiKey: 'slash-before\\slash-after',
    }
    const serialized = JSON.stringify({
      password: secrets.password,
      api_key: secrets.apiKey,
      safe_field: 'escaped-json-safe-value',
    })
    expect(serialized).toContain('quote-before\\"quote-after')
    expect(serialized).toContain('slash-before\\\\slash-after')

    const wrapper = mount(GenerationTaskPanel, {
      props: {
        taskList: [{
          id: 'task-escaped-json-credential-sensitive',
          status: 'failed',
          error: {
            code: 'Safe escaped JSON code',
            message: `Safe escaped JSON prefix ${serialized} Safe escaped JSON suffix`,
          },
        }],
      },
    })

    const html = wrapper.html()
    expect(html).not.toContain('quote-before')
    expect(html).not.toContain('quote-after')
    expect(html).not.toContain('slash-before')
    expect(html).not.toContain('slash-after')
    expect(wrapper.text()).toContain('Safe escaped JSON prefix')
    expect(wrapper.text()).toContain('escaped-json-safe-value')
    expect(wrapper.text()).toContain('Safe escaped JSON suffix')
    wrapper.unmount()
  })

  it('renders official frames metadata for a frames-only task without inventing duration', () => {
    const wrapper = mount(GenerationTaskPanel, {
      props: {
        taskList: [{ id: 'task-frames-sensitive', status: 'running', frames: 241 }],
      },
    })

    const metadata = wrapper.find('.generation-task-metadata')
    expect(metadata.text()).toContain('frames')
    expect(metadata.text()).toContain('241')
    expect(metadata.text()).not.toContain('duration')
    expect(wrapper.html()).not.toContain('task-frames-sensitive')
    wrapper.unmount()
  })

  it('defines responsive task history layout and 40px mobile action targets', async () => {
    const styles = await readFile(
      `${process.cwd()}/src/view/videoGeneration/styles/index.scss`,
      'utf8',
    )
    const mobileStyles = styles.slice(styles.indexOf('@media (max-width: 639px)'))

    expect(mobileStyles).toMatch(/\.task-history-filters\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s)
    expect(mobileStyles).toMatch(/\.generation-task-metadata\s*\{[^}]*grid-template-columns:/s)
    expect(mobileStyles).toMatch(/\.generation-task video\s*\{[^}]*width:\s*100%/s)
    expect(mobileStyles).toMatch(/\.generation-task-identity button,[^{]*\{[^}]*min-height:\s*40px/s)
  })

  it('caps the Dry-run drawer and generation options popover to their mobile container', async () => {
    const drawer = await readFile(
      `${process.cwd()}/src/view/videoGeneration/components/RequestPreviewDrawer.vue`,
      'utf8',
    )
    const options = await readFile(
      `${process.cwd()}/src/view/videoGeneration/components/GenerationOptionsBar.vue`,
      'utf8',
    )
    const styles = await readFile(
      `${process.cwd()}/src/view/videoGeneration/styles/index.scss`,
      'utf8',
    )
    const mobileStyles = styles.slice(styles.indexOf('@media (max-width: 639px)'))

    expect(drawer).toMatch(/size="min\(520px, 100%\)"/)
    expect(options).toMatch(/width="min\(497px, calc\(100vw - 24px\)\)"/)
    expect(mobileStyles).toMatch(/\.generation-options-bar\s*\{[^}]*min-width:\s*0/s)
    expect(mobileStyles).toMatch(/\.parameter-trigger\s*\{[^}]*width:\s*100%[^}]*min-width:\s*0/s)
    expect(mobileStyles).toMatch(/\.request-preview pre\s*\{[^}]*max-width:\s*100%[^}]*overflow-wrap:\s*anywhere/s)
  })

  it('prevents horizontal preview drawer overflow while preserving vertical scrolling', async () => {
    const styles = await readFile(
      `${process.cwd()}/src/view/videoGeneration/styles/index.scss`,
      'utf8',
    )

    expect(styles).toMatch(
      /\.request-preview-drawer \.el-drawer__body\s*\{[^}]*max-width:\s*100%[^}]*overflow-x:\s*hidden[^}]*overflow-y:\s*auto/s,
    )
    expect(styles).toMatch(
      /\.request-preview,\s*\.request-preview section\s*\{[^}]*min-width:\s*0[^}]*max-width:\s*100%/s,
    )
    expect(styles).toMatch(
      /\.request-preview pre\s*\{[^}]*max-width:\s*100%[^}]*overflow-x:\s*hidden[^}]*overflow-y:\s*auto[^}]*overflow-wrap:\s*anywhere/s,
    )
  })

  it('normalizes task history filters and emits previous and next page loads', async () => {
    const wrapper = mount(TaskHistoryFilters, {
      props: { total: 125 },
    })

    const status = wrapper.find('[data-testid="task-status-filter"]')
    const statusValues = status.findAll('option').map((option) => option.attributes('value'))
    expect(statusValues).toEqual(['', 'queued', 'running', 'cancelled', 'succeeded', 'failed'])
    expect(statusValues).not.toContain('expired')

    await status.setValue('succeeded')
    await wrapper.find('[data-testid="task-ids-filter"]').setValue(
      ' task-one,task-two\ntask-one\n task-three ',
    )
    await wrapper.find('[data-testid="task-model-filter"]').setValue('doubao-seedance-2-0-260128')
    await wrapper.find('[data-testid="task-service-tier-filter"]').setValue('flex')
    await wrapper.find('[data-testid="task-page-size-filter"]').setValue('50')
    await wrapper.find('[data-action="load-history"]').trigger('click')

    expect(wrapper.emitted('load')[0]).toEqual([{
      pageNum: 1,
      pageSize: 50,
      status: 'succeeded',
      taskIds: ['task-one', 'task-two', 'task-three'],
      model: 'doubao-seedance-2-0-260128',
      serviceTier: 'flex',
    }])

    await wrapper.find('[data-action="next-page"]').trigger('click')
    await wrapper.find('[data-action="previous-page"]').trigger('click')
    expect(wrapper.emitted('load').slice(1).map(([query]) => query.pageNum)).toEqual([2, 1])
    expect(wrapper.find('[data-action="previous-page"]').attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })

  it('wires task history filters and panel actions through the page and catches action failures', async () => {
    const wrapper = mountComposer()
    const store = useVideoGenerationStore()
    store.taskList = [
      { id: 'task-page-queued-secret', status: 'queued' },
      { id: 'task-page-running-secret', status: 'running' },
    ]
    await flush()

    const loadTaskHistory = vi.spyOn(store, 'loadTaskHistory').mockResolvedValue({ items: [], total: 0 })
    const pollTask = vi.spyOn(store, 'pollTask').mockResolvedValue(store.taskList[1])
    const removeOrCancelTask = vi.spyOn(store, 'removeOrCancelTask').mockResolvedValue(store.taskList[0])

    await wrapper.find('[data-action="load-history"]').trigger('click')
    await wrapper.find('[data-task-status="running"] [data-action="refresh"]').trigger('click')
    await wrapper.find('[data-task-status="queued"] [data-action="delete"]').trigger('click')
    await flush()

    expect(loadTaskHistory).toHaveBeenCalledWith({
      pageNum: 1,
      pageSize: 20,
      status: undefined,
      taskIds: [],
      model: undefined,
      serviceTier: undefined,
    })
    expect(pollTask).toHaveBeenCalledWith('task-page-running-secret')
    expect(removeOrCancelTask).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'task-page-queued-secret' }),
    )

    pollTask.mockRejectedValueOnce(
      new Error('task-page-running-secret https://cdn.example.test/temporary/private.mp4'),
    )
    await wrapper.find('[data-task-status="running"] [data-action="refresh"]').trigger('click')
    await flush()
    await flush()

    const alert = wrapper.find('[data-testid="task-action-error"]')
    expect(alert.attributes('role')).toBe('alert')
    expect(alert.text()).toContain('刷新任务失败')
    expect(alert.text()).not.toContain('task-page-running-secret')
    expect(alert.text()).not.toContain('https://cdn.example.test/temporary/private.mp4')
    wrapper.unmount()
  })
})

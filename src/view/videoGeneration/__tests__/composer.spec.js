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
import { VideoGenerationStoreError, useVideoGenerationStore } from '../store'
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

const pngFixture = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x04, 0x00, 0x00, 0x00, 0xb5, 0x1c, 0x0c, 0x02, 0x00, 0x00, 0x00,
  0x0b, 0x49, 0x44, 0x41, 0x54, 0x78, 0xda, 0x63, 0x64, 0xf8, 0x0f, 0x00,
  0x01, 0x05, 0x01, 0x01, 0x27, 0x18, 0xe3, 0x66, 0x00, 0x00, 0x00, 0x00,
  0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
])
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
const realReadyDryRunEnvelope = {
  ...dryRunEnvelope,
  data: {
    ...dryRunEnvelope.data,
    realReady: true,
    confirmationToken: 'current-confirmation-token',
    blockers: [],
  },
}
const LOCAL_CONFIRMATION_FAILURE = '确认凭证无效或已过期，请重新运行 Dry-run。'
const ARK_CREATION_FAILURE = 'Ark 创建任务失败，请检查模型权限、账户余额或资源包。'
const GENERIC_CREATION_FAILURE = '创建视频任务失败，请稍后重试。'

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

function createImageFile() {
  return new File([pngFixture], '小豆Q版.png', { type: 'image/png' })
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

async function renderRealFailure(response) {
  videoGenerationApi.dryRunVideoGeneration.mockResolvedValue(realReadyDryRunEnvelope)
  videoGenerationApi.createVideoGenerationTask.mockResolvedValue(response)
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  const wrapper = mountComposer()

  await uploadReference(wrapper)
  await wrapper.find('[aria-label="提交 Dry-run"]').trigger('click')
  await flush()
  await flush()
  wrapper.findComponent({ name: 'RequestPreviewDrawer' }).vm.$emit(
    'confirm-real',
    realReadyDryRunEnvelope.data.confirmationToken,
  )
  await flush()
  await flush()
  await flush()

  return {
    wrapper,
    alert: wrapper.find('[data-testid="task-action-error"]'),
    consoleError,
  }
}

async function renderThrownConfirmationFailure(thrownValue) {
  videoGenerationApi.dryRunVideoGeneration.mockResolvedValue(realReadyDryRunEnvelope)
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  const wrapper = mountComposer()

  await uploadReference(wrapper)
  await wrapper.find('[aria-label="提交 Dry-run"]').trigger('click')
  await flush()
  await flush()
  const store = useVideoGenerationStore()
  vi.spyOn(store, 'confirmRealGeneration').mockRejectedValue(thrownValue)
  wrapper.findComponent({ name: 'RequestPreviewDrawer' }).vm.$emit(
    'confirm-real',
    realReadyDryRunEnvelope.data.confirmationToken,
  )
  await flush()
  await flush()

  return {
    wrapper,
    alert: wrapper.find('[data-testid="task-action-error"]'),
    consoleError,
  }
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

  it('catches an invalid confirmation token, closes the stale preview, and allows a new Dry-run', async () => {
    videoGenerationApi.dryRunVideoGeneration.mockResolvedValue(realReadyDryRunEnvelope)
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const wrapper = mountComposer()

    await uploadReference(wrapper)
    await wrapper.find('[aria-label="提交 Dry-run"]').trigger('click')
    await flush()
    await flush()

    wrapper.findComponent({ name: 'RequestPreviewDrawer' }).vm.$emit(
      'confirm-real',
      'expired-confirmation-token',
    )
    await flush()
    await flush()

    const alert = wrapper.find('[data-testid="task-action-error"]')
    expect(alert.attributes('role')).toBe('alert')
    expect(alert.text()).toBe(LOCAL_CONFIRMATION_FAILURE)
    expect(alert.text()).not.toContain('expired-confirmation-token')
    expect(wrapper.findComponent({ name: 'RequestPreviewDrawer' }).props('modelValue')).toBe(false)
    expect(videoGenerationApi.createVideoGenerationTask).not.toHaveBeenCalled()
    expect(consoleError).not.toHaveBeenCalled()

    videoGenerationApi.dryRunVideoGeneration.mockResolvedValue({
      ...realReadyDryRunEnvelope,
      data: {
        ...realReadyDryRunEnvelope.data,
        confirmationToken: 'replacement-confirmation-token',
      },
    })
    await wrapper.find('[aria-label="提交 Dry-run"]').trigger('click')
    await flush()
    await flush()

    expect(wrapper.find('[data-testid="task-action-error"]').exists()).toBe(false)
    expect(wrapper.findComponent({ name: 'RequestPreviewDrawer' }).props('modelValue')).toBe(true)
    expect(videoGenerationApi.dryRunVideoGeneration).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })

  it('shows bounded sanitized Ark creation fields without leaking provider payload details', async () => {
    videoGenerationApi.dryRunVideoGeneration.mockResolvedValue(realReadyDryRunEnvelope)
    videoGenerationApi.createVideoGenerationTask.mockResolvedValue({
      code: 403,
      data: {
        error: {
          code: `ProviderDenied\n\u202eBearer provider-bearer-secret Basic YmFkOmNyZWRlbnRpYWw= requestId=req-code-secret`,
          message: `配额不足 https://cdn.example.test/temporary/private.mp4 token="provider-token-secret" password=provider-password-secret credential=provider-credential-secret api_key=provider-api-key-secret secret=provider-assignment-secret request_id req-space-secret task-provider-secret cgt-20260717123456-private ${'很长'.repeat(200)}`,
        },
        taskIds: ['cgt-details-task-secret'],
      },
      msg: 'outer-secret-should-not-be-used',
    })
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const wrapper = mountComposer()

    await uploadReference(wrapper)
    await wrapper.find('[aria-label="提交 Dry-run"]').trigger('click')
    await flush()
    await flush()
    wrapper.findComponent({ name: 'RequestPreviewDrawer' }).vm.$emit(
      'confirm-real',
      realReadyDryRunEnvelope.data.confirmationToken,
    )
    await flush()
    await flush()
    await flush()

    expect(videoGenerationApi.createVideoGenerationTask).toHaveBeenCalledTimes(1)
    expect(useVideoGenerationStore().dryRunResult.confirmationToken).toBe('')
    expect(consoleError).not.toHaveBeenCalled()
    const alert = wrapper.find('[data-testid="task-action-error"]')
    expect(alert.text()).toBe(GENERIC_CREATION_FAILURE)
    expect(alert.text().length).toBeLessThanOrEqual(240)
    for (const sensitiveValue of [
      'https://cdn.example.test/temporary/private.mp4',
      'provider-bearer-secret',
      'YmFkOmNyZWRlbnRpYWw=',
      'req-code-secret',
      'req-space-secret',
      'requestId',
      'provider-token-secret',
      'provider-password-secret',
      'provider-credential-secret',
      'provider-api-key-secret',
      'provider-assignment-secret',
      'task-provider-secret',
      'cgt-20260717123456-private',
      'cgt-details-task-secret',
      'outer-secret-should-not-be-used',
    ]) {
      expect(alert.text()).not.toContain(sensitiveValue)
    }
    expect(alert.text()).not.toMatch(/\p{C}/u)
    expect(wrapper.findComponent({ name: 'RequestPreviewDrawer' }).props('modelValue')).toBe(false)
    wrapper.unmount()
  })

  it('redacts namespaced credential assignments and complete authorization values from the DOM', async () => {
    const authorizationValue = ['Authori', 'zation: ', 'Bear', 'er authorization-secret'].join('')
    const { wrapper, alert } = await renderRealFailure({
      code: 403,
      data: {
        error: {
          code: 'CredentialRejected',
          message: `凭证拒绝 ARK_API_KEY="alpha two words" clientSecret='beta two words' auth_token=\`gamma two words\` namespace.password=“delta two words” tenant-client-secret:‘epsilon two words’ x_request_id=“zeta two words” ${authorizationValue} Bearer bare-bearer-secret Basic YmFyZS1iYXNpYy1zZWNyZXQ=`,
        },
      },
      msg: 'provider rejected credentials',
    })

    expect(alert.text()).toBe(GENERIC_CREATION_FAILURE)
    for (const sensitiveValue of [
      'ARK_API_KEY',
      'alpha two words',
      'clientSecret',
      'beta two words',
      'auth_token',
      'gamma two words',
      'namespace.password',
      'delta two words',
      'tenant-client-secret',
      'epsilon two words',
      'x_request_id',
      'zeta two words',
      'Authorization',
      'authorization-secret',
      'Bearer',
      'bare-bearer-secret',
      'Basic',
      'YmFyZS1iYXNpYy1zZWNyZXQ=',
    ]) {
      expect(alert.text()).not.toContain(sensitiveValue)
    }
    expect(alert.text()).not.toMatch(/\p{C}/u)
    wrapper.unmount()
  })

  it('redacts complete escaped ASCII-quoted assignment values from the DOM', async () => {
    const { wrapper, alert } = await renderRealFailure({
      code: 403,
      data: {
        error: {
          code: 'EscapedQuoteRejected',
          message: String.raw`转义拒绝 token=\"alpha bravo charlie\"; token="delta \"echo\" foxtrot golf"`,
        },
      },
      msg: 'provider rejected escaped quoting',
    })

    expect(alert.text()).toBe(GENERIC_CREATION_FAILURE)
    for (const opaqueValue of [
      'alpha',
      'bravo',
      'charlie',
      'delta',
      'echo',
      'foxtrot',
      'golf',
    ]) {
      expect(alert.text()).not.toContain(opaqueValue)
    }
    expect(alert.text().length).toBeLessThanOrEqual(240)
    expect(alert.text()).not.toMatch(/\p{C}/u)
    wrapper.unmount()
  })

  it('redacts fullwidth, guillemet, and CJK-quoted assignment values from the DOM', async () => {
    const { wrapper, alert } = await renderRealFailure({
      code: 403,
      data: {
        error: {
          code: 'UnicodeQuoteRejected',
          message: '引用拒绝 token=＂hotel india juliet＂; requestId=«kilo lima mike»; password=「november oscar papa」',
        },
      },
      msg: 'provider rejected Unicode quoting',
    })

    expect(alert.text()).toBe(GENERIC_CREATION_FAILURE)
    for (const opaqueValue of [
      'hotel',
      'india',
      'juliet',
      'kilo',
      'lima',
      'mike',
      'november',
      'oscar',
      'papa',
    ]) {
      expect(alert.text()).not.toContain(opaqueValue)
    }
    expect(alert.text().length).toBeLessThanOrEqual(240)
    expect(alert.text()).not.toMatch(/\p{C}/u)
    wrapper.unmount()
  })

  it('redacts an unterminated quoted assignment through the field end', async () => {
    const { wrapper, alert } = await renderRealFailure({
      code: 403,
      data: {
        error: {
          code: 'UnterminatedQuoteRejected',
          message: '未闭合引用拒绝 token="quebec romeo sierra',
        },
      },
      msg: 'provider rejected unterminated quoting',
    })

    expect(alert.text()).toBe(GENERIC_CREATION_FAILURE)
    for (const opaqueValue of ['quebec', 'romeo', 'sierra']) {
      expect(alert.text()).not.toContain(opaqueValue)
    }
    expect(alert.text().length).toBeLessThanOrEqual(240)
    expect(alert.text()).not.toMatch(/\p{C}/u)
    wrapper.unmount()
  })

  it.each([
    {
      label: 'ASCII comma',
      message: '分隔符拒绝 token="alpha, bravo charlie", safe=visible',
      opaqueValues: ['alpha', 'bravo', 'charlie'],
    },
    {
      label: 'ASCII semicolon',
      message: "分隔符拒绝 password='delta; echo foxtrot'; safe=visible",
      opaqueValues: ['delta', 'echo', 'foxtrot'],
    },
    {
      label: 'fullwidth comma',
      message: '分隔符拒绝 requestId=“golf， hotel india”，safe=visible',
      opaqueValues: ['golf', 'hotel', 'india'],
    },
    {
      label: 'JSON-escaped semicolon',
      message: String.raw`分隔符拒绝 token=\"juliet; kilo lima\"; safe=visible`,
      opaqueValues: ['juliet', 'kilo', 'lima'],
    },
    {
      label: 'authorization comma',
      message: ['分隔符拒绝 Authori', 'zation: Bear', 'er "mike, november oscar", safe=visible'].join(''),
      opaqueValues: ['mike', 'november', 'oscar'],
    },
  ])('keeps safe text after a closed $label quoted value', async ({ message, opaqueValues }) => {
    const { wrapper, alert } = await renderRealFailure({
      code: 403,
      data: { error: { code: 'QuotedDelimiterRejected', message } },
      msg: 'provider rejected quoted delimiters',
    })

    expect(alert.text()).toBe(GENERIC_CREATION_FAILURE)
    for (const opaqueValue of opaqueValues) {
      expect(alert.text()).not.toContain(opaqueValue)
    }
    expect(alert.text().length).toBeLessThanOrEqual(240)
    expect(alert.text()).not.toMatch(/\p{C}/u)
    wrapper.unmount()
  })

  it('conservatively hides an ambiguous escaped quote field instead of leaking after a delimiter', async () => {
    const { wrapper, alert } = await renderRealFailure({
      code: 403,
      data: {
        error: {
          code: 'AmbiguousQuoteRejected',
          message: String.raw`歧义引用拒绝 token=\"alpha; bravo\" trailing; safe=visible`,
        },
      },
      msg: 'provider rejected ambiguous quoting',
    })

    expect(alert.text()).toBe(GENERIC_CREATION_FAILURE)
    for (const opaqueValue of ['alpha', 'bravo', 'trailing']) {
      expect(alert.text()).not.toContain(opaqueValue)
    }
    expect(alert.text().length).toBeLessThanOrEqual(240)
    expect(alert.text()).not.toMatch(/\p{C}/u)
    wrapper.unmount()
  })

  it.each([
    {
      label: 'fullwidth snake case',
      message: '全角键拒绝 ＡＲＫ＿ＡＰＩ＿ＫＥＹ＝＂alpha bravo charlie＂; safe=visible',
      opaqueValues: ['alpha', 'bravo', 'charlie'],
    },
    {
      label: 'fullwidth camel case',
      message: '全角键拒绝 ｃｌｉｅｎｔＳｅｃｒｅｔ：«delta echo foxtrot»; safe=visible',
      opaqueValues: ['delta', 'echo', 'foxtrot'],
    },
    {
      label: 'fullwidth request ID',
      message: '全角键拒绝 ｒｅｑｕｅｓｔＩｄ=「golf hotel india」; safe=visible',
      opaqueValues: ['golf', 'hotel', 'india'],
    },
  ])('normalizes and redacts a $label candidate before classification', async ({ message, opaqueValues }) => {
    const { wrapper, alert } = await renderRealFailure({
      code: 403,
      data: { error: { code: 'FullwidthKeyRejected', message } },
      msg: 'provider rejected fullwidth keys',
    })

    expect(alert.text()).toBe(GENERIC_CREATION_FAILURE)
    for (const opaqueValue of opaqueValues) {
      expect(alert.text()).not.toContain(opaqueValue)
    }
    expect(alert.text().length).toBeLessThanOrEqual(240)
    expect(alert.text()).not.toMatch(/\p{C}/u)
    wrapper.unmount()
  })

  it('redacts escaped and protocol-relative URLs plus assigned and Unicode-separated task IDs', async () => {
    const { wrapper, alert } = await renderRealFailure({
      code: 403,
      data: {
        error: {
          code: 'ResourceRejected',
          message: '资源拒绝 https:\\/\\/cdn.example.test\\/temporary\\/private.mp4 \\/\\/media.example.test\\/temporary\\/last-frame.png //plain.example.test/temporary/video.mp4 taskId="task first private" namespace.task_id=\'task second private\' task-id=`task third private` cgt‐20260717‐private cgt－20260717－private',
        },
      },
      msg: 'provider rejected resources',
    })

    expect(alert.text()).toBe(GENERIC_CREATION_FAILURE)
    for (const sensitiveValue of [
      'https:\\/\\/cdn.example.test\\/temporary\\/private.mp4',
      '\\/\\/media.example.test\\/temporary\\/last-frame.png',
      '//plain.example.test/temporary/video.mp4',
      'cdn.example.test',
      'media.example.test',
      'plain.example.test',
      'taskId',
      'task first private',
      'namespace.task_id',
      'task second private',
      'task-id',
      'task third private',
      'cgt‐20260717‐private',
      'cgt－20260717－private',
    ]) {
      expect(alert.text()).not.toContain(sensitiveValue)
    }
    expect(alert.text()).not.toMatch(/\p{C}/u)
    wrapper.unmount()
  })

  it('does not split an emoji at the provider-code field boundary', async () => {
    const fieldPrefix = 'C'.repeat(62)
    const { wrapper, alert } = await renderRealFailure({
      code: 403,
      data: {
        error: {
          code: `${fieldPrefix}😀X`,
          message: '字段边界',
        },
      },
      msg: 'provider boundary failure',
    })

    expect(alert.text()).toBe(GENERIC_CREATION_FAILURE)
    expect(alert.text()).not.toContain(fieldPrefix)
    expect(alert.text()).not.toContain('😀')
    expect(alert.text()).not.toMatch(/\p{C}/u)
    wrapper.unmount()
  })

  it('does not split an emoji at the final 240-code-unit boundary', async () => {
    const visiblePrefix = 'F'.repeat(229)
    const { wrapper, alert } = await renderRealFailure({
      code: 403,
      data: {
        error: {
          code: '',
          message: `${visiblePrefix}😀X`,
        },
      },
      msg: 'provider final boundary failure',
    })

    expect(alert.text()).toBe(GENERIC_CREATION_FAILURE)
    expect(alert.text()).not.toContain(visiblePrefix)
    expect(alert.text()).not.toContain('😀')
    expect(alert.text().length).toBeLessThanOrEqual(240)
    expect(alert.text()).not.toContain('\uFFFD')
    expect(alert.text()).not.toMatch(/\p{C}/u)
    wrapper.unmount()
  })

  it.each([
    [40901, LOCAL_CONFIRMATION_FAILURE],
    [50201, ARK_CREATION_FAILURE],
    [403, GENERIC_CREATION_FAILURE],
  ])('maps structured response code %s to a fixed creation alert', async (responseCode, expected) => {
    const rawMessage = `raw-provider-message-${responseCode}`
    const { wrapper, alert, consoleError } = await renderRealFailure({
      code: responseCode,
      data: {
        error: {
          code: `raw-provider-code-${responseCode}`,
          message: rawMessage,
          requestId: `raw-request-id-${responseCode}`,
        },
        taskIds: [`raw-task-id-${responseCode}`],
      },
      msg: `raw-error-message-${responseCode}`,
    })

    expect(alert.text()).toBe(expected)
    expect(alert.text()).not.toContain('raw-')
    expect(alert.text().length).toBeLessThanOrEqual(240)
    expect(alert.text()).not.toMatch(/\p{C}/u)
    expect(consoleError).not.toHaveBeenCalled()
    expect(wrapper.findComponent({ name: 'RequestPreviewDrawer' }).props('modelValue')).toBe(false)
    wrapper.unmount()
  })

  it('requires an exact integer response code before selecting a fixed Ark message', async () => {
    const { wrapper, alert, consoleError } = await renderRealFailure({
      code: '50201',
      data: {
        error: { code: 'raw-string-code', message: 'raw-string-message' },
      },
      msg: 'raw-string-error-message',
    })

    expect(alert.text()).toBe(GENERIC_CREATION_FAILURE)
    expect(alert.text()).not.toContain('raw-')
    expect(consoleError).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('keeps huge malformed provider and raw error strings out of the DOM without throwing', async () => {
    const bearerPrefix = ['Bear', 'er', ' '].join('')
    const basicPrefix = ['Bas', 'ic', ' '].join('')
    const authFlood = `${bearerPrefix.repeat(5_000)}${basicPrefix.repeat(5_000)}`
    const rawProviderMessage = [
      'token="alpha, bravo',
      String.raw`token=\"charlie; delta`,
      'requestId=«echo， foxtrot',
      'credential=⟦golf; hotel⟧',
      authFlood,
      'opaque-provider-tail',
    ].join(' | ')
    const { wrapper, alert, consoleError } = await renderRealFailure({
      code: 50201,
      data: {
        error: {
          code: 'malicious-provider-code',
          message: rawProviderMessage,
          requestId: 'malicious-request-id',
        },
        taskIds: ['malicious-task-id'],
      },
      msg: 'malicious raw Error.message must never render',
    })

    expect(alert.text()).toBe(ARK_CREATION_FAILURE)
    for (const rawFragment of [
      'alpha',
      'charlie',
      'foxtrot',
      '⟦golf; hotel⟧',
      'Bearer',
      'Basic',
      'opaque-provider-tail',
      'malicious-provider-code',
      'malicious-request-id',
      'malicious-task-id',
      'malicious raw Error.message',
    ]) {
      expect(alert.text()).not.toContain(rawFragment)
    }
    expect(alert.text().length).toBeLessThanOrEqual(240)
    expect(alert.text()).not.toMatch(/\p{C}/u)
    expect(consoleError).not.toHaveBeenCalled()
    expect(wrapper.findComponent({ name: 'RequestPreviewDrawer' }).props('modelValue')).toBe(false)
    wrapper.unmount()
  })

  it('keeps invalid recovered task IDs out of task state and the DOM', async () => {
    const validTaskId = 'cgt-valid_partial:ui'
    const invalidTaskIds = [
      ' cgt-whitespace-payload ',
      'cgt/invalid-path-payload',
      'cgt?invalid-query-payload',
      'cgt-\u0000invalid-control-payload',
      `cgt-${'z'.repeat(253)}`,
    ]
    const { wrapper, alert, consoleError } = await renderRealFailure({
      code: 50201,
      data: {
        error: {
          code: 'raw-invalid-task-id-code',
          message: 'raw invalid task ID payload must not render',
        },
        taskIds: [validTaskId, validTaskId, ...invalidTaskIds, 7, null, { id: 'object-id' }],
      },
      msg: 'raw invalid task ID envelope',
    })

    expect(useVideoGenerationStore().taskList).toEqual([
      { id: validTaskId, status: 'queued' },
    ])
    expect(alert.text()).toBe(ARK_CREATION_FAILURE)
    const rendered = wrapper.html()
    for (const invalidTaskId of invalidTaskIds) {
      expect(rendered).not.toContain(invalidTaskId)
    }
    expect(rendered).not.toContain('raw invalid task ID payload')
    expect(videoGenerationApi.getVideoGenerationTask).not.toHaveBeenCalled()
    expect(consoleError).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it.each([
    {
      label: 'throwing code getter',
      create() {
        return Object.create(VideoGenerationStoreError.prototype, {
          code: {
            get() { throw new Error('hostile-code-getter') },
          },
        })
      },
    },
    {
      label: 'throwing details getter',
      create() {
        return Object.create(VideoGenerationStoreError.prototype, {
          code: { value: 'VIDEO_GENERATION_API_REJECTED' },
          details: {
            get() { throw new Error('hostile-details-getter') },
          },
        })
      },
    },
    {
      label: 'throwing responseCode getter',
      create() {
        return Object.create(VideoGenerationStoreError.prototype, {
          code: { value: 'VIDEO_GENERATION_API_REJECTED' },
          details: {
            value: {
              get responseCode() { throw new Error('hostile-response-code-getter') },
            },
          },
        })
      },
    },
    {
      label: 'throwing getPrototypeOf proxy trap',
      create() {
        return new Proxy({}, {
          getPrototypeOf() { throw new Error('hostile-prototype-trap') },
        })
      },
    },
  ])('contains a hostile thrown value with a $label', async ({ create }) => {
    const { wrapper, alert, consoleError } = await renderThrownConfirmationFailure(create())

    expect(alert.attributes('role')).toBe('alert')
    expect(alert.text()).toBe(GENERIC_CREATION_FAILURE)
    expect(alert.text()).not.toContain('hostile-')
    expect(consoleError).not.toHaveBeenCalled()
    expect(wrapper.findComponent({ name: 'RequestPreviewDrawer' }).props('modelValue')).toBe(false)
    wrapper.unmount()
  })

  it('keeps the successful real-confirmation path handled and free of stale errors', async () => {
    videoGenerationApi.dryRunVideoGeneration.mockResolvedValue(realReadyDryRunEnvelope)
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const wrapper = mountComposer()

    await uploadReference(wrapper)
    await wrapper.find('[aria-label="提交 Dry-run"]').trigger('click')
    await flush()
    await flush()
    wrapper.findComponent({ name: 'RequestPreviewDrawer' }).vm.$emit(
      'confirm-real',
      realReadyDryRunEnvelope.data.confirmationToken,
    )
    await flush()
    await flush()

    expect(videoGenerationApi.createVideoGenerationTask).toHaveBeenCalledTimes(1)
    expect(useVideoGenerationStore().taskList).toEqual([
      { id: 'task-1', status: 'queued' },
    ])
    expect(wrapper.find('[data-testid="task-action-error"]').exists()).toBe(false)
    expect(consoleError).not.toHaveBeenCalled()
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

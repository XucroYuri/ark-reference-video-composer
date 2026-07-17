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
import { useVideoGenerationStore } from '../store'
import * as videoGenerationApi from '@/api/videoGeneration'

vi.mock('@/api/videoGeneration', () => ({
  uploadReference: vi.fn(),
  registerRemoteReference: vi.fn(),
  deleteReference: vi.fn(),
  dryRunVideoGeneration: vi.fn(),
  createVideoGenerationTask: vi.fn(),
  getVideoGenerationTask: vi.fn(),
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

  it('hides empty task state and renders submitting, queued, running, succeeded, failed, and cancelled task states', () => {
    const idle = mount(GenerationTaskPanel, {
      props: { taskList: [] },
    })
    expect(idle.find('[aria-label="生成任务"]').exists()).toBe(false)
    idle.unmount()

    const submitting = mount(GenerationTaskPanel, {
      props: { taskList: [], submitting: true },
    })
    expect(submitting.text()).toContain('submitting')
    submitting.unmount()

    const wrapper = mount(GenerationTaskPanel, {
      props: {
        taskList: [
          { id: 'task-queued', status: 'queued' },
          { id: 'task-running', status: 'running' },
          { id: 'task-succeeded', status: 'succeeded', content: { video_url: 'https://example.com/video.mp4' } },
          { id: 'task-failed', status: 'failed', message: '失败原因' },
          { id: 'task-cancelled', status: 'cancelled' },
        ],
      },
    })

    expect(wrapper.text()).toContain('queued')
    expect(wrapper.text()).toContain('running')
    expect(wrapper.text()).toContain('succeeded')
    expect(wrapper.text()).toContain('failed')
    expect(wrapper.text()).toContain('cancelled')
    expect(wrapper.find('video').attributes('autoplay')).toBeUndefined()
    wrapper.unmount()
  })
})

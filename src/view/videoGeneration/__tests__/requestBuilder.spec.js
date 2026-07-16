import { describe, expect, it } from 'vitest'
import {
  buildArkRequest,
  collectCanonicalMedia,
  serializePrompt,
  validateRealSubmission,
} from '../utils/requestBuilder'

const image1 = {
  id: 'media-1',
  kind: 'image',
  name: '小豆Q版.png',
  realIndex: 1,
  previewUrl: '/uploads/media-1.png',
  remoteUrl: 'https://media.example/xiaodou.png',
  mimeType: 'image/png',
  size: 87040,
  status: 'ready',
}

const image2 = {
  id: 'media-2',
  kind: 'image',
  name: '龙女Q版.png',
  realIndex: 2,
  previewUrl: '/uploads/media-2.png',
  remoteUrl: 'https://media.example/longnv.png',
  mimeType: 'image/png',
  size: 209920,
  status: 'ready',
}

const doc = {
  type: 'doc',
  content: [{
    type: 'paragraph',
    content: [
      { type: 'text', text: '让 ' },
      { type: 'mediaMention', attrs: { mediaId: 'media-2', kind: 'image', sourceLabel: '图片2', realIndex: 2 } },
      { type: 'text', text: ' 模仿 ' },
      { type: 'mediaMention', attrs: { mediaId: 'media-1', kind: 'image', sourceLabel: '图片1', realIndex: 1 } },
      { type: 'text', text: ' 挥手，再让 ' },
      { type: 'mediaMention', attrs: { mediaId: 'media-2', kind: 'image', sourceLabel: '图片2', realIndex: 2 } },
      { type: 'text', text: ' 转身' },
    ],
  }],
}

describe('requestBuilder', () => {
  it('deduplicates media by first mention and preserves realIndex', () => {
    expect(collectCanonicalMedia(doc, [image1, image2]).map((item) => item.id)).toEqual(['media-2', 'media-1'])
  })

  it('creates readable, template, and model prompts', () => {
    expect(serializePrompt(doc, [image1, image2])).toMatchObject({
      readablePrompt: '让 @图片2 模仿 @图片1 挥手，再让 @图片2 转身',
      templatePrompt: '让 <<<image_1_2>>> 模仿 <<<image_2_1>>> 挥手，再让 <<<image_1_2>>> 转身',
      modelPrompt: '让 【图片 1】 模仿 【图片 2】 挥手，再让 【图片 1】 转身',
    })
  })

  it('builds public Ark content with text first and canonical media after it', () => {
    const result = buildArkRequest({
      doc,
      mediaList: [image1, image2],
      model: 'doubao-seedance-2-0-260128',
      config: { mode: 'reference_media', ratio: 'adaptive', resolution: '720p', duration: 5, count: 1, generateAudio: false },
    })
    expect(result.content).toEqual([
      { type: 'text', text: '让 【图片 1】 模仿 【图片 2】 挥手，再让 【图片 1】 转身' },
      { type: 'image_url', role: 'reference_image', image_url: { url: 'https://media.example/longnv.png' } },
      { type: 'image_url', role: 'reference_image', image_url: { url: 'https://media.example/xiaodou.png' } },
    ])
    expect(result).toMatchObject({
      model: 'doubao-seedance-2-0-260128',
      ratio: 'adaptive',
      resolution: '720p',
      duration: 5,
      generate_audio: false,
    })
  })

  it('preserves paragraph and hard-break newlines in every prompt projection', () => {
    const multilineDoc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: '第一行' }, { type: 'hardBreak' }, { type: 'text', text: '第二行' }] },
        { type: 'paragraph', content: [{ type: 'text', text: '第三行' }] },
      ],
    }

    expect(serializePrompt(multilineDoc, [])).toMatchObject({
      readablePrompt: '第一行\n第二行\n第三行',
      templatePrompt: '第一行\n第二行\n第三行',
      modelPrompt: '第一行\n第二行\n第三行',
    })
  })

  it('preserves an unresolved mention visibly and records a blocking error', () => {
    const missingMediaDoc = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [
        { type: 'text', text: '让 ' },
        { type: 'mediaMention', attrs: { mediaId: 'missing-9', kind: 'image', sourceLabel: '图片9', realIndex: 9 } },
        { type: 'text', text: ' 挥手' },
      ] }],
    }

    expect(serializePrompt(missingMediaDoc, [])).toMatchObject({
      readablePrompt: '让 @图片9 挥手',
      templatePrompt: '让 @图片9 挥手',
      modelPrompt: '让 @图片9 挥手',
      missingMedia: [{ mediaId: 'missing-9', kind: 'image', sourceLabel: '图片9', realIndex: 9 }],
      errors: [{ code: 'MISSING_MEDIA', mediaId: 'missing-9' }],
    })
  })

  it('appends unmentioned references after the first-mentioned media', () => {
    const oneMentionDoc = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [
        { type: 'mediaMention', attrs: { mediaId: 'media-2', kind: 'image', sourceLabel: '图片2', realIndex: 2 } },
      ] }],
    }

    expect(collectCanonicalMedia(oneMentionDoc, [image1, image2]).map((item) => item.id)).toEqual([
      'media-2',
      'media-1',
    ])
  })

  it('keeps an explicit text content item when the editor text is empty', () => {
    const emptyDoc = { type: 'doc', content: [{ type: 'paragraph' }] }
    const request = buildArkRequest({
      doc: emptyDoc,
      mediaList: [image1],
      model: 'doubao-seedance-2-0-260128',
      config: { ratio: 'adaptive', resolution: '720p', duration: 5, generateAudio: false },
    })

    expect(serializePrompt(emptyDoc, [image1])).toMatchObject({
      readablePrompt: '',
      templatePrompt: '',
      modelPrompt: '',
    })
    expect(request.content[0]).toEqual({ type: 'text', text: '' })
    expect(request.content[1].image_url.url).toBe('https://media.example/xiaodou.png')
  })

  it('prefers an Ark asset URL over a remote URL', () => {
    const assetImage = { ...image1, assetId: 'asset-xiaodou' }
    const serialization = serializePrompt(doc, [assetImage, image2])
    const request = buildArkRequest({
      doc,
      mediaList: [assetImage, image2],
      model: 'doubao-seedance-2-0-260128',
      config: { ratio: 'adaptive', resolution: '720p', duration: 5, generateAudio: false },
    })

    expect(serialization.media.find((item) => item.id === image1.id)).toMatchObject({
      url: 'asset://asset-xiaodou',
      notPublic: false,
    })
    expect(request.content[2].image_url.url).toBe('asset://asset-xiaodou')
  })

  it('uses an explicit local URL and marks media without a public locator', () => {
    const localImage = { ...image1, remoteUrl: '' }
    const serialization = serializePrompt(doc, [localImage, image2])
    const request = buildArkRequest({
      doc,
      mediaList: [localImage, image2],
      model: 'doubao-seedance-2-0-260128',
      config: { ratio: 'adaptive', resolution: '720p', duration: 5, generateAudio: false },
    })

    expect(serialization.media.find((item) => item.id === image1.id)).toMatchObject({
      url: 'local://media-1',
      notPublic: true,
    })
    expect(request.content[2].image_url.url).toBe('local://media-1')
  })

  it('reports disabled real generation and a missing server API key', () => {
    const serialization = serializePrompt(doc, [image1, image2])

    expect(validateRealSubmission({
      serialization,
      runtime: { realGenerationEnabled: false, arkApiKey: '' },
    }).map((item) => item.code)).toEqual([
      'REAL_GENERATION_DISABLED',
      'ARK_API_KEY_MISSING',
    ])
  })

  it('blocks real submission when a canonical media URL is local-only', () => {
    const serialization = serializePrompt(doc, [{ ...image1, remoteUrl: '' }, image2])

    expect(validateRealSubmission({
      serialization,
      runtime: { realGenerationEnabled: true, arkApiKey: 'server-only-key' },
    })).toEqual([{
      code: 'MEDIA_NOT_PUBLIC',
      mediaId: 'media-1',
      message: '参考素材不是可公开访问的 HTTPS URL 或 Ark 资产：小豆Q版.png',
    }])
  })

  it('carries unresolved mention errors into real-submission blockers', () => {
    const missingMediaDoc = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [
        { type: 'mediaMention', attrs: { mediaId: 'missing-9', kind: 'image', sourceLabel: '图片9', realIndex: 9 } },
      ] }],
    }
    const serialization = serializePrompt(missingMediaDoc, [])

    expect(validateRealSubmission({
      serialization,
      runtime: { realGenerationEnabled: true, arkApiKey: 'server-only-key' },
    })).toEqual([{
      code: 'MISSING_MEDIA',
      mediaId: 'missing-9',
      message: '引用的素材不存在：图片9',
    }])
  })

  it('allows real submission metadata when runtime and media are public', () => {
    const serialization = serializePrompt(doc, [image1, image2])

    expect(validateRealSubmission({
      serialization,
      runtime: { realGenerationEnabled: true, arkApiKey: 'server-only-key' },
    })).toEqual([])
  })

  it('blocks a real submission with neither prompt text nor media', () => {
    const serialization = serializePrompt({ type: 'doc', content: [{ type: 'paragraph' }] }, [])

    expect(validateRealSubmission({
      serialization,
      runtime: { realGenerationEnabled: true, arkApiKey: 'server-only-key' },
    })).toEqual([{
      code: 'EMPTY_CONTENT',
      message: '请填写提示词或添加参考内容',
    }])
  })

  it('blocks every canonical media record whose status is not exactly ready', () => {
    const mediaList = [
      { ...image1, id: 'status-missing', realIndex: 1, status: undefined },
      { ...image1, id: 'status-local', realIndex: 2, status: 'local' },
      { ...image1, id: 'status-uploading', realIndex: 3, status: 'uploading' },
      { ...image1, id: 'status-error', realIndex: 4, status: 'error' },
    ]
    const serialization = serializePrompt({ type: 'doc', content: [{ type: 'paragraph' }] }, mediaList)

    expect(validateRealSubmission({
      serialization,
      runtime: { realGenerationEnabled: true, arkApiKey: 'server-only-key' },
    }).map(({ code, mediaId, status }) => ({ code, mediaId, status }))).toEqual([
      { code: 'MEDIA_NOT_READY', mediaId: 'status-missing', status: undefined },
      { code: 'MEDIA_NOT_READY', mediaId: 'status-local', status: 'local' },
      { code: 'MEDIA_NOT_READY', mediaId: 'status-uploading', status: 'uploading' },
      { code: 'MEDIA_NOT_READY', mediaId: 'status-error', status: 'error' },
    ])
  })

  it('derives resolved mention projections only from immutable media records', () => {
    const staleMentionDoc = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [
        { type: 'mediaMention', attrs: { mediaId: 'media-2', kind: 'video', sourceLabel: '音频99', realIndex: 99 } },
        { type: 'text', text: ' 和 ' },
        { type: 'mediaMention', attrs: { mediaId: 'media-1' } },
      ] }],
    }

    expect(serializePrompt(staleMentionDoc, [image1, image2])).toMatchObject({
      readablePrompt: '@图片2 和 @图片1',
      templatePrompt: '<<<image_1_2>>> 和 <<<image_2_1>>>',
      modelPrompt: '【图片 1】 和 【图片 2】',
      errors: [],
    })
  })

  it('emits blocking errors with stable paths for invalid media metadata', () => {
    const mediaList = [
      { ...image1, id: 'missing-kind', kind: undefined, realIndex: 1 },
      { ...image2, id: 'invalid-index', kind: 'image', realIndex: 0 },
      { ...image2, id: 'missing-index', kind: 'image', realIndex: undefined },
    ]
    const serialization = serializePrompt({ type: 'doc', content: [{ type: 'paragraph' }] }, mediaList)
    const expectedErrors = [
      {
        code: 'UNSUPPORTED_MEDIA_KIND',
        path: 'mediaList[0].kind',
        mediaId: 'missing-kind',
        message: '仅支持图片参考素材：missing-kind',
      },
      {
        code: 'INVALID_MEDIA_REAL_INDEX',
        path: 'mediaList[1].realIndex',
        mediaId: 'invalid-index',
        message: '素材 realIndex 必须是正整数：invalid-index',
      },
      {
        code: 'INVALID_MEDIA_REAL_INDEX',
        path: 'mediaList[2].realIndex',
        mediaId: 'missing-index',
        message: '素材 realIndex 必须是正整数：missing-index',
      },
    ]

    expect(serialization.errors).toEqual(expectedErrors)
    expect(validateRealSubmission({
      serialization,
      runtime: { realGenerationEnabled: true, arkApiKey: 'server-only-key' },
    })).toEqual(expectedErrors)
  })

  it.each([
    ['mentioned', { type: 'doc', content: [{ type: 'paragraph', content: [
      { type: 'mediaMention', attrs: { mediaId: 'media-1' } },
    ] }] }],
    ['unmentioned', { type: 'doc', content: [{ type: 'paragraph' }] }],
  ])('uses the first duplicate media record when it is %s and blocks submission', (_state, duplicateDoc) => {
    const duplicate = { ...image1, remoteUrl: 'https://media.example/duplicate.png' }
    const mediaList = [image1, duplicate]
    const serialization = serializePrompt(duplicateDoc, mediaList)
    const expectedError = {
      code: 'DUPLICATE_MEDIA_ID',
      path: 'mediaList[1].id',
      mediaId: 'media-1',
      message: '素材 ID 重复：media-1',
    }

    expect(collectCanonicalMedia(duplicateDoc, mediaList)).toEqual([image1])
    expect(serialization.media).toHaveLength(1)
    expect(serialization.media[0].url).toBe('https://media.example/xiaodou.png')
    expect(serialization.errors).toEqual([expectedError])
    expect(validateRealSubmission({
      serialization,
      runtime: { realGenerationEnabled: true, arkApiKey: 'server-only-key' },
    })).toEqual([expectedError])
  })

  it.each([
    ['video', '视频'],
    ['audio', '音频'],
  ])('never encodes an unsupported %s reference as image_url', (kind, label) => {
    const media = { ...image1, id: `${kind}-1`, kind, name: `${kind}.mp4`, realIndex: 1 }
    const mediaDoc = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [
        { type: 'text', text: '让 ' },
        { type: 'mediaMention', attrs: { mediaId: media.id } },
      ] }],
    }
    const serialization = serializePrompt(mediaDoc, [media])
    const request = buildArkRequest({
      doc: mediaDoc,
      mediaList: [media],
      model: 'doubao-seedance-2-0-260128',
      config: { ratio: 'adaptive', resolution: '720p', duration: 5, generateAudio: false },
    })
    const expectedError = {
      code: 'UNSUPPORTED_MEDIA_KIND',
      path: 'mediaList[0].kind',
      mediaId: media.id,
      message: `仅支持图片参考素材：${media.id}`,
    }

    expect(serialization).toMatchObject({
      readablePrompt: `让 @${label}1`,
      templatePrompt: `让 <<<${kind}_1_1>>>`,
      modelPrompt: `让 【${label} 1】`,
      errors: [expectedError],
    })
    expect(request.content).toEqual([{ type: 'text', text: `让 【${label} 1】` }])
    expect(validateRealSubmission({
      serialization,
      runtime: { realGenerationEnabled: true, arkApiKey: 'server-only-key' },
    })).toEqual([expectedError])
  })

  it('treats a whitespace-only API key as missing', () => {
    const serialization = serializePrompt(doc, [image1, image2])

    expect(validateRealSubmission({
      serialization,
      runtime: { realGenerationEnabled: true, arkApiKey: '   \n\t' },
    })).toEqual([{
      code: 'ARK_API_KEY_MISSING',
      message: '服务端未配置 ARK_API_KEY',
    }])
  })

  it('deduplicates serialization blockers and returns defensive copies', () => {
    const serialization = serializePrompt(doc, [image1, image2])
    const error = {
      code: 'UNSUPPORTED_MEDIA_KIND',
      path: 'mediaList[0].kind',
      mediaId: 'media-1',
      message: '仅支持图片参考素材：media-1',
    }
    const blockers = validateRealSubmission({
      serialization: { ...serialization, errors: [error, { ...error }] },
      runtime: { realGenerationEnabled: true, arkApiKey: 'server-only-key' },
    })

    expect(blockers).toEqual([error])
    expect(blockers[0]).not.toBe(error)
  })
})

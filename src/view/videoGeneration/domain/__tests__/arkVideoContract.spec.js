import { describe, expect, it } from 'vitest'
import {
  DEFAULT_GENERATION_CONFIG,
  pickArkRequestOptions,
  validateGenerationConfig,
} from '../arkVideoContract.js'

describe('selected Seedance 2.0 contract', () => {
  it.each(['adaptive', '16:9', '4:3', '1:1', '3:4', '9:16', '21:9'])(
    'accepts ratio %s',
    (ratio) => expect(validateGenerationConfig({
      ...DEFAULT_GENERATION_CONFIG,
      ratio,
    }).errors).toEqual([]),
  )

  it.each([480, 720, 1080])('rejects numeric resolution %s', (resolution) => {
    expect(validateGenerationConfig({
      ...DEFAULT_GENERATION_CONFIG,
      resolution,
    }).errors).toContainEqual(expect.objectContaining({ path: 'config.resolution' }))
  })

  it.each([4, 5, 15, -1])('accepts duration %s', (duration) => {
    expect(validateGenerationConfig({
      ...DEFAULT_GENERATION_CONFIG,
      duration,
    }).errors).toEqual([])
  })

  it.each([
    ['generateAudio', 'true'],
    ['returnLastFrame', 1],
    ['watermark', null],
    ['executionExpiresAfter', 3599],
    ['executionExpiresAfter', 259201],
    ['executionExpiresAfter', 3600.5],
    ['priority', -1],
    ['priority', 10],
    ['priority', 0.5],
  ])('rejects malformed advanced option %s=%j', (field, value) => {
    expect(validateGenerationConfig({
      ...DEFAULT_GENERATION_CONFIG,
      [field]: value,
    }).errors).toContainEqual(expect.objectContaining({ path: `config.${field}` }))
  })

  it('rejects unsupported config keys and never returns them in a normalized value', () => {
    const result = validateGenerationConfig({
      ...DEFAULT_GENERATION_CONFIG,
      frames: 57,
      seed: 1,
      serviceTier: 'flex',
      callback: { url: 'https://attacker.example/callback' },
    })

    expect(result).toMatchObject({ value: null })
    expect(result.errors.map((error) => error.path)).toEqual([
      'config.frames',
      'config.seed',
      'config.serviceTier',
      'config.callback',
    ])
  })

  it('projects supported fields and omits unsupported fields', () => {
    expect(pickArkRequestOptions({
      ...DEFAULT_GENERATION_CONFIG,
      frames: 57,
      seed: 1,
      serviceTier: 'flex',
    })).toEqual({
      ratio: 'adaptive',
      resolution: '720p',
      duration: 5,
      generate_audio: true,
      return_last_frame: false,
      watermark: false,
      execution_expires_after: 172800,
      priority: 0,
    })
  })
})

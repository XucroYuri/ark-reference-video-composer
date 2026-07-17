export const ARK_RATIOS = Object.freeze([
  'adaptive', '16:9', '4:3', '1:1', '3:4', '9:16', '21:9',
])
export const ARK_RESOLUTIONS = Object.freeze(['480p', '720p', '1080p', '4k'])
export const ARK_LIST_FILTER_STATUSES = Object.freeze([
  'queued', 'running', 'cancelled', 'succeeded', 'failed',
])

export const DEFAULT_GENERATION_CONFIG = Object.freeze({
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

const GENERATION_CONFIG_KEYS = Object.freeze(Object.keys(DEFAULT_GENERATION_CONFIG))
const GENERATION_CONFIG_KEY_SET = new Set(GENERATION_CONFIG_KEYS)

export function validateGenerationConfig(input) {
  const errors = []
  const add = (path, message) => errors.push({ path, message })
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { value: null, errors: [{ path: 'config', message: '必须是对象' }] }
  }
  for (const key of Object.keys(input)) {
    if (!GENERATION_CONFIG_KEY_SET.has(key)) add(`config.${key}`, '不支持的配置项')
  }
  if (input.mode !== 'reference_media') add('config.mode', '仅支持 reference_media')
  if (!ARK_RATIOS.includes(input.ratio)) add('config.ratio', '比例不受支持')
  if (!ARK_RESOLUTIONS.includes(input.resolution)) add('config.resolution', '分辨率不受支持')
  if (!(input.duration === -1 || (Number.isInteger(input.duration)
    && input.duration >= 4 && input.duration <= 15))) {
    add('config.duration', '时长必须为 -1 或 4 到 15 的整数')
  }
  if (!(Number.isInteger(input.count) && input.count >= 1 && input.count <= 4)) {
    add('config.count', '数量必须是 1 到 4 的整数')
  }
  if (typeof input.generateAudio !== 'boolean') add('config.generateAudio', '必须是布尔值')
  if (typeof input.returnLastFrame !== 'boolean') add('config.returnLastFrame', '必须是布尔值')
  if (typeof input.watermark !== 'boolean') add('config.watermark', '必须是布尔值')
  if (!(Number.isInteger(input.executionExpiresAfter)
    && input.executionExpiresAfter >= 3600
    && input.executionExpiresAfter <= 259200)) {
    add('config.executionExpiresAfter', '必须是 3600 到 259200 的整数')
  }
  if (!(Number.isInteger(input.priority) && input.priority >= 0 && input.priority <= 9)) {
    add('config.priority', '必须是 0 到 9 的整数')
  }
  return {
    value: errors.length
      ? null
      : Object.fromEntries(GENERATION_CONFIG_KEYS.map((key) => [key, input[key]])),
    errors,
  }
}

export function pickArkRequestOptions(config) {
  return {
    ratio: config.ratio,
    resolution: config.resolution,
    duration: config.duration,
    generate_audio: config.generateAudio,
    return_last_frame: config.returnLastFrame,
    watermark: config.watermark,
    execution_expires_after: config.executionExpiresAfter,
    priority: config.priority,
  }
}

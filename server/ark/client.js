import { ARK_LIST_FILTER_STATUSES } from '../../src/view/videoGeneration/domain/arkVideoContract.js'

const TASK_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/
const APPROVED_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3'

export class ArkClientError extends Error {
  constructor({ status, code, message, requestId = '' }) {
    super(message)
    this.name = 'ArkClientError'
    this.status = status
    this.code = code
    this.requestId = requestId
  }
}

function assertTaskId(id) {
  if (typeof id !== 'string' || !TASK_ID_PATTERN.test(id)) {
    throw new ArkClientError({
      status: 400,
      code: 'INVALID_TASK_ID',
      message: '任务 ID 格式无效',
    })
  }
}

function throwInvalidList(field) {
  throw new ArkClientError({
    status: 400,
    code: 'INVALID_TASK_LIST_FILTER',
    message: `任务列表参数无效: ${field}`,
  })
}

function buildTaskListPath({
  pageNum = 1,
  pageSize = 20,
  status,
  taskIds = [],
  model,
  serviceTier,
} = {}) {
  if (!Number.isInteger(pageNum) || pageNum < 1 || pageNum > 500) {
    throwInvalidList('page_num')
  }
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 500) {
    throwInvalidList('page_size')
  }
  if (status != null && !ARK_LIST_FILTER_STATUSES.includes(status)) {
    throwInvalidList('filter.status')
  }
  if (!Array.isArray(taskIds)) throwInvalidList('filter.task_ids')
  if (model != null && (typeof model !== 'string' || !model.trim())) {
    throwInvalidList('filter.model')
  }
  if (serviceTier != null && !['default', 'flex'].includes(serviceTier)) {
    throwInvalidList('filter.service_tier')
  }

  const query = new URLSearchParams({
    page_num: String(pageNum),
    page_size: String(pageSize),
  })
  if (status) query.set('filter.status', status)
  for (const taskId of taskIds) {
    assertTaskId(taskId)
    query.append('filter.task_ids', taskId)
  }
  if (model) query.set('filter.model', model)
  if (serviceTier) query.set('filter.service_tier', serviceTier)
  return `/contents/generations/tasks?${query}`
}

async function cancelResponseBody(response) {
  try {
    await response.body?.cancel()
  } catch {
    // 这里保留原始响应校验错误，不让取消响应体的异常覆盖真正原因。
  }
}

async function readJsonBody(response, maxResponseBytes) {
  const requestId = response.headers.get('x-request-id') || ''
  const contentLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(contentLength) && contentLength > maxResponseBytes) {
    await cancelResponseBody(response)
    throw new ArkClientError({
      status: 502,
      code: 'ARK_RESPONSE_TOO_LARGE',
      message: 'Ark 响应体过大',
      requestId,
    })
  }

  const reader = response.body?.getReader()
  if (!reader) {
    throw new ArkClientError({
      status: response.status,
      code: 'ARK_INVALID_RESPONSE',
      message: 'Ark 返回了无效响应',
      requestId,
    })
  }

  const chunks = []
  let totalBytes = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    totalBytes += value.byteLength
    if (totalBytes > maxResponseBytes) {
      await reader.cancel()
      throw new ArkClientError({
        status: 502,
        code: 'ARK_RESPONSE_TOO_LARGE',
        message: 'Ark 响应体过大',
        requestId,
      })
    }
    chunks.push(Buffer.from(value))
  }

  try {
    return JSON.parse(Buffer.concat(chunks, totalBytes).toString('utf8'))
  } catch {
    throw new ArkClientError({
      status: response.status,
      code: 'ARK_INVALID_RESPONSE',
      message: 'Ark 返回了无效响应',
      requestId,
    })
  }
}

export function createArkClient({
  baseUrl,
  apiKey,
  fetchImpl = fetch,
  maxResponseBytes = 1024 * 1024,
  timeoutMs = 15_000,
}) {
  if (baseUrl !== APPROVED_BASE_URL && baseUrl !== `${APPROVED_BASE_URL}/`) {
    throw new ArkClientError({
      status: 500,
      code: 'INVALID_ARK_BASE_URL',
      message: 'Ark 服务地址不在允许范围内',
    })
  }
  const normalizedBaseUrl = APPROVED_BASE_URL
  const normalizedApiKey = String(apiKey ?? '').trim()
  const redactSensitive = (value, maxLength = 500) => {
    let redacted = String(value ?? '')
      .replace(/Bearer\s+[^\s"'<>]+/gi, 'Bearer [REDACTED]')
    if (normalizedApiKey) redacted = redacted.split(normalizedApiKey).join('[REDACTED]')
    return redacted.slice(0, maxLength)
  }
  const isSensitiveKey = (key) => {
    if (normalizedApiKey && key.includes(normalizedApiKey)) return true
    if (/Bearer\s+[^\s"'<>]+/i.test(key)) return true
    const normalized = key.toLowerCase().replace(/[_\s-]/g, '')
    return normalized.endsWith('token')
      || normalized.includes('secret')
      || normalized.endsWith('authorization')
      || normalized.includes('password')
      || normalized.includes('credential')
      || normalized.includes('apikey')
      || normalized.includes('accesskey')
  }
  const sanitizeResponse = (value) => {
    if (typeof value === 'string') return redactSensitive(value, Infinity)
    if (Array.isArray(value)) return value.map(sanitizeResponse)
    if (!value || typeof value !== 'object') return value
    return Object.fromEntries(Object.entries(value)
      .filter(([key]) => !isSensitiveKey(key))
      .map(([key, child]) => [key, sanitizeResponse(child)]))
  }

  const request = async (path, { method, body }) => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    try {
      let response
      try {
        response = await fetchImpl(`${normalizedBaseUrl}${path}`, {
          method,
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${normalizedApiKey}`,
            ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          redirect: 'error',
          signal: controller.signal,
        })
      } catch {
        if (controller.signal.aborted) {
          throw new ArkClientError({
            status: 504,
            code: 'ARK_TIMEOUT',
            message: 'Ark 请求超时',
          })
        }
        throw new ArkClientError({
          status: 502,
          code: 'ARK_NETWORK_ERROR',
          message: '无法连接 Ark 服务',
        })
      }

      if (
        response.status !== 204
        && !/^application\/(?:[\w.+-]*\+)?json(?:\s*;|$)/i.test(response.headers.get('content-type') || '')
      ) {
        await cancelResponseBody(response)
        throw new ArkClientError({
          status: response.status,
          code: 'ARK_INVALID_RESPONSE',
          message: 'Ark 返回了无效响应',
          requestId: response.headers.get('x-request-id') || '',
        })
      }

      let parsed
      try {
        parsed = response.status === 204 ? {} : await readJsonBody(response, maxResponseBytes)
      } catch (error) {
        if (controller.signal.aborted) {
          throw new ArkClientError({
            status: 504,
            code: 'ARK_TIMEOUT',
            message: 'Ark 请求超时',
          })
        }
        throw error
      }
      if (!response.ok) {
        throw new ArkClientError({
          status: response.status,
          code: redactSensitive(parsed?.error?.code || parsed?.code || 'ARK_REQUEST_FAILED'),
          message: redactSensitive(parsed?.error?.message || parsed?.message || 'Ark 请求失败'),
          requestId: redactSensitive(
            response.headers.get('x-request-id') || parsed?.request_id || '',
          ),
        })
      }
      return sanitizeResponse(parsed)
    } finally {
      clearTimeout(timeout)
    }
  }

  return {
    async createTask(payload) {
      const task = await request('/contents/generations/tasks', {
        method: 'POST',
        body: payload,
      })
      const taskId = task?.id ?? task?.task_id
      if (typeof taskId !== 'string' || !TASK_ID_PATTERN.test(taskId)) {
        throw new ArkClientError({
          status: 502,
          code: 'ARK_INVALID_RESPONSE',
          message: 'Ark 创建任务响应中的任务 ID 无效',
        })
      }
      return task
    },
    async getTask(id) {
      assertTaskId(id)
      return request(`/contents/generations/tasks/${encodeURIComponent(id)}`, { method: 'GET' })
    },
    async listTasks(filters) {
      return request(buildTaskListPath(filters), { method: 'GET' })
    },
    async deleteTask(id) {
      assertTaskId(id)
      return request(`/contents/generations/tasks/${encodeURIComponent(id)}`, { method: 'DELETE' })
    },
  }
}

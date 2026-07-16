const TASK_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/

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

async function readJsonBody(response, maxResponseBytes) {
  const requestId = response.headers.get('x-request-id') || ''
  const contentLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(contentLength) && contentLength > maxResponseBytes) {
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
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '')
  const normalizedApiKey = String(apiKey ?? '').trim()
  const redactSensitive = (value) => {
    let redacted = String(value ?? '')
      .replace(/Bearer\s+[^\s"'<>]+/gi, 'Bearer [REDACTED]')
    if (normalizedApiKey) redacted = redacted.split(normalizedApiKey).join('[REDACTED]')
    return redacted.slice(0, 500)
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
      return parsed
    } finally {
      clearTimeout(timeout)
    }
  }

  return {
    createTask(payload) {
      return request('/contents/generations/tasks', {
        method: 'POST',
        body: payload,
      })
    },
    async getTask(id) {
      assertTaskId(id)
      return request(`/contents/generations/tasks/${encodeURIComponent(id)}`, { method: 'GET' })
    },
    async deleteTask(id) {
      assertTaskId(id)
      return request(`/contents/generations/tasks/${encodeURIComponent(id)}`, { method: 'DELETE' })
    },
  }
}

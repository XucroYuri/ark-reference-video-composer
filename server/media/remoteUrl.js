import { isIP } from 'node:net'

export class RemoteMediaUrlError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'RemoteMediaUrlError'
    this.code = code
  }
}

function hasExplicitPort(rawUrl) {
  const authority = /^[^:/?#]+:\/\/([^/?#]*)/.exec(rawUrl)?.[1] || ''
  const hostAndPort = authority.slice(authority.lastIndexOf('@') + 1)
  if (hostAndPort.startsWith('[')) {
    const closingBracket = hostAndPort.indexOf(']')
    return closingBracket !== -1 && hostAndPort[closingBracket + 1] === ':'
  }
  return hostAndPort.includes(':')
}

export function normalizeRemoteMediaUrl(rawUrl) {
  if (
    typeof rawUrl !== 'string'
    || !rawUrl
    || rawUrl.length > 2048
    || rawUrl.trim() !== rawUrl
  ) {
    throw new RemoteMediaUrlError('INVALID_REMOTE_MEDIA_URL', '公网图片 URL 格式无效')
  }
  if (/\p{Cc}/u.test(rawUrl)) {
    throw new RemoteMediaUrlError('INVALID_REMOTE_MEDIA_URL', '公网图片 URL 包含控制字符')
  }

  let parsed
  try {
    parsed = new URL(rawUrl)
  } catch {
    throw new RemoteMediaUrlError('INVALID_REMOTE_MEDIA_URL', '公网图片 URL 格式无效')
  }

  const host = parsed.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase()
  if (
    parsed.protocol !== 'https:'
    || parsed.username
    || parsed.password
    || parsed.port
    || !/^https:\/\/[^/?#]+/i.test(rawUrl)
    || hasExplicitPort(rawUrl)
    || !host
    || host === 'localhost'
    || host.endsWith('.localhost')
    || host.endsWith('.local')
    || isIP(host)
  ) {
    throw new RemoteMediaUrlError('REMOTE_MEDIA_URL_NOT_PUBLIC', '只允许公开 HTTPS 图片 URL')
  }

  parsed.hash = ''
  return parsed.toString()
}

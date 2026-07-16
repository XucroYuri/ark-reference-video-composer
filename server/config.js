import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import dotenv from 'dotenv'

function parseOptionalEnv(path) {
  return existsSync(path) ? dotenv.parse(readFileSync(path)) : {}
}

export function loadEnvironment({ rootDir, processEnv = process.env }) {
  if (!rootDir) throw new TypeError('rootDir is required')
  const development = parseOptionalEnv(resolve(rootDir, '.env.development'))
  const local = parseOptionalEnv(resolve(rootDir, '.env.local'))
  return { ...development, ...local, ...processEnv }
}

export function loadConfig(env = process.env) {
  const parsedPort = Number(env.VITE_SERVER_PORT || 8888)

  return {
    port: Number.isInteger(parsedPort) && parsedPort >= 1 && parsedPort <= 65535
      ? parsedPort
      : 8888,
    host: env.SERVER_HOST || '127.0.0.1',
    arkBaseUrl: env.ARK_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3',
    arkModel: env.ARK_MODEL || 'doubao-seedance-2-0-260128',
    arkApiKey: env.ARK_API_KEY || '',
    publicMediaBaseUrl: env.PUBLIC_MEDIA_BASE_URL || '',
    realGenerationEnabled: env.APP_REAL_GENERATION_ENABLED === 'true',
  }
}

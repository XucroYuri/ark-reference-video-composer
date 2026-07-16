export function loadConfig(env = process.env) {
  const parsedPort = Number(env.VITE_SERVER_PORT || 8888)

  return {
    port: Number.isInteger(parsedPort) && parsedPort > 0 ? parsedPort : 8888,
    host: env.SERVER_HOST || '127.0.0.1',
    arkBaseUrl: env.ARK_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3',
    arkModel: env.ARK_MODEL || 'doubao-seedance-2-0-260128',
    arkApiKey: env.ARK_API_KEY || '',
    publicMediaBaseUrl: env.PUBLIC_MEDIA_BASE_URL || '',
    realGenerationEnabled: env.APP_REAL_GENERATION_ENABLED === 'true',
  }
}

import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createApp } from './app.js'
import { createArkClient } from './ark/client.js'
import { loadConfig, loadEnvironment } from './config.js'
import { createMediaStore } from './media/store.js'
import { createConfirmationStore } from './security/confirmationStore.js'

const defaultProjectRoot = fileURLToPath(new URL('..', import.meta.url))

export function createRuntime({
  rootDir = defaultProjectRoot,
  processEnv = process.env,
  fetchImpl = fetch,
  clock = Date.now,
  idFactory,
} = {}) {
  const config = loadConfig(loadEnvironment({ rootDir, processEnv }))
  const uploadDir = resolve(rootDir, 'uploads')
  const mediaStore = createMediaStore({
    uploadDir,
    publicBaseUrl: config.publicMediaBaseUrl,
  })
  const arkClient = createArkClient({
    baseUrl: config.arkBaseUrl,
    apiKey: config.arkApiKey,
    fetchImpl,
  })
  const confirmationStore = createConfirmationStore({ clock, idFactory })
  const runtimeConfig = { ...config, uploadDir }
  const app = createApp({
    config: runtimeConfig,
    arkClient,
    mediaStore,
    confirmationStore,
  })

  return {
    app,
    arkClient,
    config: runtimeConfig,
    confirmationStore,
    mediaStore,
  }
}

export function startRuntime(runtime = createRuntime()) {
  const { app, config } = runtime
  const server = app.listen(config.port, config.host, () => {
    console.log(`[server] listening on http://${config.host}:${config.port}`)
  })
  const stop = () => server.close(() => process.exit(0))
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
  return server
}

const isMainModule = process.argv[1]
  && fileURLToPath(import.meta.url) === resolve(process.argv[1])

if (isMainModule) startRuntime()

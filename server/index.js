import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import dotenv from 'dotenv'

import { createApp } from './app.js'
import { loadConfig } from './config.js'
import { createMediaStore } from './media/store.js'

const projectRoot = fileURLToPath(new URL('..', import.meta.url))

dotenv.config({ path: resolve(projectRoot, '.env.development') })
dotenv.config({ path: resolve(projectRoot, '.env.local'), override: true })

const config = loadConfig()
const uploadDir = resolve(projectRoot, 'uploads')
const mediaStore = createMediaStore({
  uploadDir,
  publicBaseUrl: config.publicMediaBaseUrl,
})

const unavailableArkClient = {
  async createTask() {
    throw new Error('Ark client is not available in Dry-run mode')
  },
  async getTask() {
    throw new Error('Ark client is not available in Dry-run mode')
  },
}

const app = createApp({
  config: { ...config, uploadDir },
  arkClient: unavailableArkClient,
  mediaStore,
  confirmationStore: {},
})

const server = app.listen(config.port, config.host, () => {
  console.log(`[server] listening on http://${config.host}:${config.port}`)
})

const stop = () => server.close(() => process.exit(0))
process.on('SIGINT', stop)
process.on('SIGTERM', stop)

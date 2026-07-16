import express from 'express'
import multer from 'multer'

import { createVideoGenerationRouter, fail, ok } from './routes/videoGeneration.js'

export function createApp({ config, arkClient, mediaStore, confirmationStore }) {
  const app = express()

  app.use(express.json({ limit: '2mb' }))
  if (config.uploadDir) {
    app.use('/uploads', express.static(config.uploadDir, {
      dotfiles: 'deny',
      fallthrough: false,
      index: false,
    }))
  }
  app.get('/api/health', (_req, res) => ok(res, { status: 'ok' }, '服务正常'))
  app.use('/api/videoGeneration', createVideoGenerationRouter({
    config,
    arkClient,
    mediaStore,
    confirmationStore,
  }))
  app.use((req, res) => fail(
    res,
    40400,
    '请求路径不存在',
    { path: req.path },
    404,
  ))

  app.use((error, req, res, next) => {
    void next
    if (error instanceof multer.MulterError) {
      const message = error.code === 'LIMIT_FILE_SIZE'
        ? '上传文件不能超过 30MB'
        : '上传请求格式错误'
      return fail(res, 40004, message, { reason: error.code })
    }

    if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
      return fail(res, 40001, '请求 JSON 格式错误')
    }

    if (error.status === 404) {
      return fail(res, 40400, '请求路径不存在', { path: req.path }, 404)
    }

    return fail(res, 50000, '服务内部错误', {}, 500)
  })

  return app
}

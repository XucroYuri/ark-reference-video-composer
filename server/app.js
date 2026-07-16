import express from 'express'
import multer from 'multer'

import { MediaStoreError } from './media/store.js'
import { createVideoGenerationRouter, fail, ok } from './routes/videoGeneration.js'

export function createApp({ config, arkClient, mediaStore, confirmationStore }) {
  const app = express()

  app.use(express.json({ limit: '2mb' }))
  app.get('/uploads/:filename', async (req, res, next) => {
    if (typeof mediaStore?.read !== 'function') {
      return fail(res, 40400, '请求路径不存在', { path: req.path }, 404)
    }
    try {
      const media = await mediaStore.read(req.params.filename)
      res.set('Content-Type', media.mimeType)
      res.set('X-Content-Type-Options', 'nosniff')
      return res.send(media.buffer)
    } catch (error) {
      if (error instanceof MediaStoreError && error.code === 'MEDIA_NOT_FOUND') {
        return fail(res, 40400, '请求路径不存在', { path: req.path }, 404)
      }
      return next(error)
    }
  })
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

    if (error.status === 413 || error.type === 'entity.too.large') {
      return fail(res, 41300, '请求体过大', {}, 413)
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

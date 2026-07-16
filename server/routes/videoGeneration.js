import { Router } from 'express'
import multer from 'multer'

import {
  buildArkRequest,
  serializePrompt,
  validateRealSubmission,
} from '../../src/view/videoGeneration/utils/requestBuilder.js'
import { MAX_UPLOAD_BYTES, MediaStoreError } from '../media/store.js'

export const ok = (res, data, msg = '操作成功') => res.json({ code: 0, data, msg })

export const fail = (res, code, msg, data = {}) => (
  res.status(400).json({ code, data, msg })
)

export function createVideoGenerationRouter({ config, arkClient, mediaStore }) {
  const router = Router()
  const maxUploadBytes = Number.isInteger(config.maxUploadBytes) && config.maxUploadBytes > 0
    ? config.maxUploadBytes
    : MAX_UPLOAD_BYTES
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxUploadBytes, files: 1 },
  })

  router.post('/uploadReference', upload.single('file'), async (req, res, next) => {
    try {
      if (!req.file) return fail(res, 40002, '请选择要上传的参考图片')
      const media = await mediaStore.save(req.file)
      return ok(res, media, '参考素材上传成功')
    } catch (error) {
      if (error instanceof MediaStoreError) {
        return fail(res, 40003, error.message, { reason: error.code })
      }
      return next(error)
    }
  })

  router.post('/deleteReference', async (req, res, next) => {
    const mediaId = req.body?.mediaId
    try {
      const removed = await mediaStore.remove(mediaId)
      return ok(
        res,
        { mediaId, removed },
        removed ? '参考素材已删除' : '参考素材已不存在',
      )
    } catch (error) {
      if (error instanceof MediaStoreError) {
        return fail(res, 40005, error.message, { reason: error.code })
      }
      return next(error)
    }
  })

  router.post('/dryRun', (req, res) => {
    const body = req.body || {}
    const serialization = serializePrompt(body.doc, body.mediaList)
    const request = buildArkRequest({
      doc: body.doc,
      mediaList: body.mediaList,
      config: body.config || {},
      model: config.arkModel,
    })
    const blockers = validateRealSubmission({ serialization, runtime: config })

    // Keep these dependencies visible here so Task 5 can add guarded real routes
    // without changing the dry-run contract. Dry-run never invokes either one.
    void arkClient
    void mediaStore

    return ok(res, {
      serialization,
      request,
      blockers,
      realReady: blockers.length === 0,
      confirmationToken: '',
    }, 'Dry-run 校验成功')
  })

  return router
}

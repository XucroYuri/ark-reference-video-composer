import { VideoGenerationStoreError } from '../store'

const LOCAL_CONFIRMATION_FAILURE = '确认凭证无效或已过期，请重新运行 Dry-run。'
const ARK_CREATION_FAILURE = 'Ark 创建任务失败，请检查模型权限、账户余额或资源包。'
const GENERIC_CREATION_FAILURE = '创建视频任务失败，请稍后重试。'

function trustedResponseCode(error) {
  const responseCode = error.details?.responseCode
  return Number.isInteger(responseCode) ? responseCode : null
}

export function formatGenerationFailure(error) {
  try {
    if (!(error instanceof VideoGenerationStoreError)) return GENERIC_CREATION_FAILURE
    if (error.code === 'VIDEO_GENERATION_CONFIRMATION_MISMATCH') {
      return LOCAL_CONFIRMATION_FAILURE
    }

    const responseCode = trustedResponseCode(error)
    if (responseCode === 40901) return LOCAL_CONFIRMATION_FAILURE
    if (responseCode === 50201) return ARK_CREATION_FAILURE
    return GENERIC_CREATION_FAILURE
  } catch {
    return GENERIC_CREATION_FAILURE
  }
}

import service from '@/utils/request'

const resolveServerEnvelope = (status) => status >= 200 && status < 600

export const uploadReference = (formData) => service({
  url: '/videoGeneration/uploadReference',
  method: 'post',
  data: formData,
  headers: { 'Content-Type': 'multipart/form-data' },
  validateStatus: resolveServerEnvelope,
})

export const registerRemoteReference = (data) => service({
  url: '/videoGeneration/registerRemoteReference',
  method: 'post',
  data,
  validateStatus: resolveServerEnvelope,
})

export const deleteReference = (data) => service({
  url: '/videoGeneration/deleteReference',
  method: 'post',
  data,
  validateStatus: resolveServerEnvelope,
})

export const dryRunVideoGeneration = (data) => service({
  url: '/videoGeneration/dryRun',
  method: 'post',
  data,
  donNotShowLoading: true,
  validateStatus: resolveServerEnvelope,
})

export const createVideoGenerationTask = (data) => service({
  url: '/videoGeneration/createTask',
  method: 'post',
  data,
  validateStatus: resolveServerEnvelope,
})

export const getVideoGenerationTask = (params) => service({
  url: '/videoGeneration/getTask',
  method: 'get',
  params,
  donNotShowLoading: true,
  validateStatus: resolveServerEnvelope,
})

export const deleteVideoGenerationTask = (data) => service({
  url: '/videoGeneration/deleteTask',
  method: 'post',
  data,
  validateStatus: resolveServerEnvelope,
})

import service from '@/utils/request'

export const uploadReference = (formData) => service({
  url: '/videoGeneration/uploadReference',
  method: 'post',
  data: formData,
})

export const deleteReference = (data) => service({
  url: '/videoGeneration/deleteReference',
  method: 'post',
  data,
})

export const dryRunVideoGeneration = (data) => service({
  url: '/videoGeneration/dryRun',
  method: 'post',
  data,
  donNotShowLoading: true,
})

export const createVideoGenerationTask = (data) => service({
  url: '/videoGeneration/createTask',
  method: 'post',
  data,
})

export const getVideoGenerationTask = (params) => service({
  url: '/videoGeneration/getTask',
  method: 'get',
  params,
  donNotShowLoading: true,
})

export const deleteVideoGenerationTask = (data) => service({
  url: '/videoGeneration/deleteTask',
  method: 'post',
  data,
})

import { createRouter, createWebHashHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    redirect: '/video-generation',
  },
  {
    path: '/video-generation',
    name: 'VideoGeneration',
    component: () => import('@/view/videoGeneration/index.vue'),
  },
]

export default createRouter({ history: createWebHashHistory(), routes })

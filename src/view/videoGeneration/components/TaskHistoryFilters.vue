<template>
  <form class="task-history-filters" @submit.prevent="loadFirstPage">
    <label>
      状态
      <select v-model="status" data-testid="task-status-filter" :disabled="loading">
        <option value="">全部</option>
        <option v-for="value in ARK_LIST_FILTER_STATUSES" :key="value" :value="value">
          {{ value }}
        </option>
      </select>
    </label>

    <label class="task-history-filter-wide">
      任务 ID（逗号或换行分隔）
      <textarea
        v-model="taskIdsText"
        data-testid="task-ids-filter"
        rows="2"
        :disabled="loading"
      />
    </label>

    <label>
      model
      <input
        v-model.trim="model"
        data-testid="task-model-filter"
        type="text"
        :disabled="loading"
      >
    </label>

    <label>
      service_tier
      <select v-model="serviceTier" data-testid="task-service-tier-filter" :disabled="loading">
        <option value="">全部</option>
        <option value="default">default</option>
        <option value="flex">flex</option>
      </select>
    </label>

    <label>
      每页
      <select v-model.number="pageSize" data-testid="task-page-size-filter" :disabled="loading">
        <option :value="20">20</option>
        <option :value="50">50</option>
        <option :value="100">100</option>
      </select>
    </label>

    <div class="task-history-load">
      <button
        type="button"
        data-action="load-history"
        :disabled="loading"
        @click="loadFirstPage"
      >
        {{ loading ? '加载中…' : '加载历史' }}
      </button>
    </div>

    <div class="task-history-pagination" aria-label="任务历史分页">
      <button
        type="button"
        data-action="previous-page"
        :disabled="loading || pageNum <= 1"
        @click="loadPage(pageNum - 1)"
      >
        上一页
      </button>
      <span>第 {{ pageNum }} 页 · 共 {{ total }} 条</span>
      <button
        type="button"
        data-action="next-page"
        :disabled="loading || pageNum * pageSize >= total"
        @click="loadPage(pageNum + 1)"
      >
        下一页
      </button>
    </div>
  </form>
</template>

<script setup>
import { ref } from 'vue'

import { ARK_LIST_FILTER_STATUSES } from '../domain/arkVideoContract.js'

defineProps({
  total: { type: Number, default: 0 },
  loading: { type: Boolean, default: false },
})

const emit = defineEmits(['load'])

const status = ref('')
const taskIdsText = ref('')
const model = ref('')
const serviceTier = ref('')
const pageSize = ref(20)
const pageNum = ref(1)

function normalizeTaskIds(value) {
  return [...new Set(value
    .split(/[,\r\n]+/)
    .map((taskId) => taskId.trim())
    .filter(Boolean))]
}

function createQuery(nextPage) {
  return {
    pageNum: nextPage,
    pageSize: pageSize.value,
    status: status.value || undefined,
    taskIds: normalizeTaskIds(taskIdsText.value),
    model: model.value || undefined,
    serviceTier: serviceTier.value || undefined,
  }
}

function loadPage(nextPage) {
  pageNum.value = nextPage
  emit('load', createQuery(nextPage))
}

function loadFirstPage() {
  loadPage(1)
}
</script>

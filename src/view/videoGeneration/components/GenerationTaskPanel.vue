<template>
  <section v-if="visibleTasks.length" class="generation-task-panel" aria-label="生成任务">
    <article
      v-for="task in visibleTasks"
      :key="task.id"
      class="generation-task"
      :class="`is-${task.status}`"
    >
      <div>
        <strong>{{ task.id }}</strong>
        <span>{{ statusLabels[task.status] || task.status }}</span>
      </div>
      <video
        v-if="task.status === 'succeeded' && task.content?.video_url"
        :src="task.content.video_url"
        controls
        playsinline
        preload="metadata"
      />
      <p v-if="task.status === 'failed'">{{ task.message || '生成失败' }}</p>
    </article>
  </section>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  taskList: { type: Array, default: () => [] },
  submitting: { type: Boolean, default: false },
})

const statusLabels = {
  submitting: 'submitting',
  queued: 'queued',
  running: 'running',
  succeeded: 'succeeded',
  failed: 'failed',
  cancelled: 'cancelled',
}

const visibleTasks = computed(() => {
  if (props.submitting) return [{ id: 'local-submitting', status: 'submitting' }]
  if (props.taskList.length) return props.taskList
  return []
})
</script>

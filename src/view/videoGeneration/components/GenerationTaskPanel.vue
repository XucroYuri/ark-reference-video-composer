<template>
  <section class="generation-task-panel" aria-label="生成任务">
    <p v-if="!taskList.length" class="generation-task-empty">idle</p>
    <article
      v-for="task in taskList"
      :key="task.id"
      class="generation-task"
      :class="`is-${task.status}`"
    >
      <div>
        <strong>{{ task.id }}</strong>
        <span>{{ task.status }}</span>
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
defineProps({
  taskList: { type: Array, default: () => [] },
})
</script>

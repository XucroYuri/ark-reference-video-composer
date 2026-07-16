<template>
  <div class="media-suggestion-menu" role="listbox" aria-label="参考内容">
    <div class="media-suggestion-tabs" aria-hidden="true">
      <span class="is-active">全部</span>
      <span>图片</span>
    </div>
    <button
      v-for="(item, index) in items"
      :key="item.mediaId || `disabled-${index}`"
      class="media-suggestion-option"
      :class="{ 'is-active': index === selectedIndex, 'is-disabled': item.disabled }"
      type="button"
      role="option"
      :aria-selected="index === selectedIndex ? 'true' : 'false'"
      :aria-disabled="item.disabled ? 'true' : 'false'"
      :disabled="item.disabled"
      @mousedown.prevent="selectItem(item)"
    >
      <img
        v-if="item.previewUrl"
        class="media-suggestion-thumbnail"
        :src="item.previewUrl"
        alt=""
      >
      <span>{{ item.label }}</span>
    </button>
  </div>
</template>

<script setup>
const props = defineProps({
  items: { type: Array, default: () => [] },
  selectedIndex: { type: Number, default: 0 },
})

const emit = defineEmits(['select'])

function selectItem(item) {
  if (item?.disabled) return
  emit('select', item)
}
</script>

<style scoped>
.media-suggestion-menu {
  box-sizing: border-box;
  width: 160px;
  padding: 6px 8px;
  overflow: hidden;
  color: #0b0b0f;
  background: #fff;
  border: 1px solid #f0f2fa;
  border-radius: 12px;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.05), 0 2px 6px rgba(0, 0, 0, 0.05);
}

.media-suggestion-tabs {
  display: flex;
  gap: 16px;
  height: 36px;
  padding: 0 6px;
  color: #787c91;
  font-size: 12px;
  line-height: 30px;
}

.media-suggestion-tabs .is-active {
  color: #5252ff;
}

.media-suggestion-option {
  display: flex;
  align-items: center;
  width: 100%;
  min-height: 48px;
  padding: 6px;
  gap: 8px;
  color: inherit;
  font: inherit;
  text-align: left;
  background: transparent;
  border: 0;
  border-radius: 4px;
  cursor: pointer;
}

.media-suggestion-option.is-active {
  background: #f7f7f9;
}

.media-suggestion-option.is-disabled {
  color: #a5a8b8;
  cursor: default;
}

.media-suggestion-thumbnail {
  width: 36px;
  height: 36px;
  flex: 0 0 36px;
  object-fit: cover;
  border-radius: 6px;
}
</style>

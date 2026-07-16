<template>
  <div ref="rootElement" class="prompt-composer">
    <editor-content :editor="editor" />
    <media-suggestion-menu
      v-if="suggestionState.open"
      :items="suggestionState.items"
      :selected-index="suggestionState.selectedIndex"
      :style="menuStyle"
      @select="selectSuggestion"
    />
  </div>
</template>

<script setup>
import { Editor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'

import MediaSuggestionMenu from './MediaSuggestionMenu.vue'
import {
  createMediaPasteGuard,
  isCurrentMediaMention,
  MediaMention,
} from '../editor/mediaMention'
import { createMediaSuggestion, getMediaSuggestionItems } from '../editor/mediaSuggestion'

const props = defineProps({
  modelValue: { type: Object, required: true },
  mediaList: { type: Array, default: () => [] },
  disabled: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue', 'focus', 'blur'])
let applyingExternal = false
const rootElement = ref(null)
const suggestionState = reactive({
  open: false,
  items: [],
  selectedIndex: 0,
  clientRect: null,
  command: null,
})

const toSignature = (value) => JSON.stringify(value)

const mediaSuggestion = createMediaSuggestion({
  getItems: () => props.mediaList,
  onStateChange: (state) => Object.assign(suggestionState, state),
})
const mediaPasteGuard = createMediaPasteGuard({ getMediaList: () => props.mediaList })

const editor = new Editor({
  extensions: [StarterKit, MediaMention, mediaPasteGuard, mediaSuggestion],
  content: props.modelValue,
  editable: !props.disabled,
  onUpdate: ({ editor: currentEditor, transaction }) => {
    if (!transaction.docChanged || applyingExternal) return
    emit('update:modelValue', currentEditor.getJSON())
  },
  onFocus: () => emit('focus'),
  onBlur: () => emit('blur'),
})

const menuStyle = computed(() => {
  const anchor = suggestionState.clientRect?.()
  const rootRect = rootElement.value?.getBoundingClientRect?.()
  if (!anchor || !rootRect) return { left: '0px', top: '32px' }
  return {
    left: `${Math.max(0, anchor.left - rootRect.left)}px`,
    top: `${Math.max(0, anchor.bottom - rootRect.top + 6)}px`,
  }
})

function selectSuggestion(item) {
  suggestionState.command?.(item)
}

watch(
  () => props.modelValue,
  (nextValue) => {
    if (!editor || editor.isDestroyed) return
    if (toSignature(editor.getJSON()) === toSignature(nextValue)) return
    applyingExternal = true
    try {
      editor.commands.setContent(nextValue, false)
    } finally {
      applyingExternal = false
    }
  },
  { deep: true },
)

watch(
  () => props.disabled,
  (disabled) => {
    if (!editor.isDestroyed) editor.setEditable(!disabled)
  },
)

watch(
  () => props.mediaList,
  (mediaList) => {
    if (editor.isDestroyed) return
    const removals = []
    editor.state.doc.descendants((node, position) => {
      if (node.type.name === 'mediaMention'
        && !isCurrentMediaMention(node.attrs, mediaList)) {
        removals.push({ from: position, to: position + node.nodeSize })
      }
    })
    if (!removals.length) return

    const transaction = removals
      .sort((left, right) => right.from - left.from)
      .reduce(
        (current, range) => current.delete(range.from, range.to),
        editor.state.tr,
      )
    editor.view.dispatch(transaction)
  },
  { deep: true },
)

function focus() {
  if (props.disabled || editor.isDestroyed) return false
  return editor.commands.focus()
}

function insertMedia(media) {
  if (props.disabled || editor.isDestroyed) return false
  const item = getMediaSuggestionItems(props.mediaList)
    .find((candidate) => candidate.mediaId === media?.id && !candidate.disabled)
  if (!item) return false

  return editor.commands.insertContent({
    type: 'mediaMention',
    attrs: {
      mediaId: item.mediaId,
      kind: item.kind,
      sourceLabel: item.sourceLabel,
      realIndex: item.realIndex,
    },
  })
}

function clear() {
  if (editor.isDestroyed) return false
  return editor.commands.clearContent(true)
}

defineExpose({ clear, focus, insertMedia })

onBeforeUnmount(() => editor.destroy())
</script>

<style scoped>
.prompt-composer {
  position: relative;
  min-width: 0;
}

.prompt-composer > :deep(.media-suggestion-menu) {
  position: absolute;
  z-index: 9999;
}

.prompt-composer :deep(.ProseMirror) {
  min-height: 52px;
  outline: none;
  white-space: break-spaces;
}

.prompt-composer :deep(.ProseMirror p) {
  margin: 0;
}
</style>

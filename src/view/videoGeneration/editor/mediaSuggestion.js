import { Extension } from '@tiptap/core'
import Suggestion from '@tiptap/suggestion'

import { isValidMediaMentionAttrs } from './mediaMention'

const EMPTY_ITEM = Object.freeze({
  disabled: true,
  label: '请先添加参考内容',
})

function toSuggestionItem(media) {
  const attrs = {
    mediaId: typeof media?.id === 'string' ? media.id.trim() : '',
    kind: media?.kind,
    sourceLabel: `图片${media?.realIndex}`,
    realIndex: media?.realIndex,
  }

  if (media?.status !== 'ready' || !isValidMediaMentionAttrs(attrs)) return null
  return {
    ...attrs,
    disabled: false,
    label: attrs.sourceLabel,
    previewUrl: typeof media.previewUrl === 'string' ? media.previewUrl : '',
  }
}

export function getMediaSuggestionItems(mediaList, query = '') {
  const normalizedQuery = typeof query === 'string' ? query.trim().toLocaleLowerCase() : ''
  const candidates = (Array.isArray(mediaList) ? mediaList : [])
    .map(toSuggestionItem)
    .filter(Boolean)
  const identityCounts = new Map()
  const indexCounts = new Map()
  for (const item of candidates) {
    identityCounts.set(item.mediaId, (identityCounts.get(item.mediaId) || 0) + 1)
    indexCounts.set(item.realIndex, (indexCounts.get(item.realIndex) || 0) + 1)
  }

  const items = candidates
    .filter((item) => identityCounts.get(item.mediaId) === 1)
    .filter((item) => indexCounts.get(item.realIndex) === 1)
    .sort((left, right) => left.realIndex - right.realIndex)
    .filter((item) => item.sourceLabel.toLocaleLowerCase().includes(normalizedQuery))

  return items.length ? items : [{ ...EMPTY_ITEM }]
}

export function isSelectableSuggestionItem(item) {
  return item?.disabled === false && isValidMediaMentionAttrs(item)
}

function firstSelectableIndex(items) {
  return items.findIndex(isSelectableSuggestionItem)
}

function moveSelection(items, currentIndex, direction) {
  const selectable = items
    .map((item, index) => (isSelectableSuggestionItem(item) ? index : -1))
    .filter((index) => index >= 0)
  if (!selectable.length) return 0

  const currentPosition = selectable.indexOf(currentIndex)
  const nextPosition = currentPosition < 0
    ? 0
    : (currentPosition + direction + selectable.length) % selectable.length
  return selectable[nextPosition]
}

function safeClientRect(clientRect) {
  if (typeof clientRect !== 'function') return null
  return () => {
    try {
      return clientRect() || null
    } catch {
      return null
    }
  }
}

const CLOSED_STATE = Object.freeze({
  open: false,
  items: [],
  selectedIndex: 0,
  clientRect: null,
  command: null,
})

export function createMediaSuggestionRenderer(onStateChange = () => {}) {
  let currentProps = null
  let selectedIndex = 0
  let dismissed = false

  const report = () => {
    if (!currentProps || dismissed) {
      onStateChange({ ...CLOSED_STATE })
      return
    }
    const items = Array.isArray(currentProps.items) ? currentProps.items : []
    const command = (item) => {
      if (!isSelectableSuggestionItem(item) || dismissed || !currentProps) return false
      currentProps.command(item)
      return true
    }
    onStateChange({
      open: true,
      items,
      selectedIndex,
      clientRect: safeClientRect(currentProps.clientRect),
      command,
    })
  }

  const update = (props) => {
    currentProps = props
    dismissed = false
    const candidate = firstSelectableIndex(Array.isArray(props.items) ? props.items : [])
    selectedIndex = candidate >= 0 ? candidate : 0
    report()
  }

  return {
    onStart: update,
    onUpdate: update,
    onKeyDown({ view, event }) {
      if (!currentProps || dismissed) return false
      if (event.key === 'Escape') {
        dismissed = true
        report()
        return true
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        selectedIndex = moveSelection(
          currentProps.items,
          selectedIndex,
          event.key === 'ArrowDown' ? 1 : -1,
        )
        report()
        return true
      }
      if (event.key !== 'Enter') return false
      if (event.isComposing || event.keyCode === 229 || view?.composing) return false

      const item = currentProps.items[selectedIndex]
      if (!isSelectableSuggestionItem(item)) return false
      currentProps.command(item)
      return true
    },
    onExit() {
      currentProps = null
      dismissed = false
      selectedIndex = 0
      onStateChange({ ...CLOSED_STATE })
    },
  }
}

export function createMediaSuggestion({ getItems, onStateChange } = {}) {
  const readMedia = typeof getItems === 'function' ? getItems : () => []
  const reportState = typeof onStateChange === 'function' ? onStateChange : () => {}

  return Extension.create({
    name: 'mediaSuggestion',

    addProseMirrorPlugins() {
      return [Suggestion({
        editor: this.editor,
        char: '@',
        items: ({ query }) => getMediaSuggestionItems(readMedia(), query),
        command: ({ editor, range, props }) => {
          if (!isSelectableSuggestionItem(props)) return false
          const currentItem = getMediaSuggestionItems(readMedia()).find((item) => (
            isSelectableSuggestionItem(item)
            && item.mediaId === props.mediaId
            && item.realIndex === props.realIndex
          ))
          if (!currentItem) return false
          return editor
            .chain()
            .focus()
            .insertContentAt(range, {
              type: 'mediaMention',
              attrs: {
                mediaId: currentItem.mediaId,
                kind: currentItem.kind,
                sourceLabel: currentItem.sourceLabel,
                realIndex: currentItem.realIndex,
              },
            })
            .run()
        },
        render: () => createMediaSuggestionRenderer(reportState),
      })]
    },
  })
}

import { describe, expect, it, vi } from 'vitest'
import { Editor } from '@tiptap/core'
import { DOMParser as ProseMirrorDOMParser } from '@tiptap/pm/model'
import { NodeSelection } from '@tiptap/pm/state'
import StarterKit from '@tiptap/starter-kit'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

import MediaSuggestionMenu from '../components/MediaSuggestionMenu.vue'
import PromptComposer from '../components/PromptComposer.vue'
import {
  isValidMediaMentionAttrs,
  MediaMention,
  pruneMediaMentionDoc,
  sanitizeMediaMentionSlice,
} from '../editor/mediaMention'
import {
  createMediaSuggestion,
  createMediaSuggestionRenderer,
  getMediaSuggestionItems,
} from '../editor/mediaSuggestion'

describe('MediaMention', () => {
  it('renders an atomic @ label and round-trips its attributes', () => {
    const editor = new Editor({
      extensions: [StarterKit, MediaMention],
      content: {
        type: 'doc',
        content: [{
          type: 'paragraph',
          content: [
            { type: 'text', text: '让 ' },
            {
              type: 'mediaMention',
              attrs: {
                mediaId: 'm1',
                kind: 'image',
                sourceLabel: '图片1',
                realIndex: 1,
              },
            },
            { type: 'text', text: ' 挥手' },
          ],
        }],
      },
    })

    expect(editor.getHTML()).toContain('data-media-id="m1"')
    expect(editor.getHTML()).not.toContain('mediaid=')
    expect(editor.getHTML()).not.toContain('sourcelabel=')
    expect(editor.getText()).toContain('@图片1')
    expect(editor.getJSON().content[0].content[1].attrs).toMatchObject({
      mediaId: 'm1',
      realIndex: 1,
    })
    editor.destroy()
  })

  it('requires a numeric positive integer realIndex in document attributes', () => {
    expect(isValidMediaMentionAttrs({
      mediaId: 'm1',
      kind: 'image',
      sourceLabel: '图片1',
      realIndex: '1',
    })).toBe(false)
    expect(isValidMediaMentionAttrs({
      mediaId: 'm1',
      kind: 'image',
      sourceLabel: '图片1',
      realIndex: 1,
    })).toBe(true)
  })

  it('strictly parses valid mention HTML and leaves malformed mentions as safe text', () => {
    const editor = new Editor({ extensions: [StarterKit, MediaMention] })
    editor.commands.setContent(`
      <p>
        <span data-type="media-mention" data-media-id="m1" data-kind="image"
          data-source-label="图片1" data-real-index="1" onclick="alert(1)">@图片1</span>
        <span data-type="media-mention" data-media-id="m2" data-kind="video"
          data-source-label="视频2" data-real-index="2">@视频2</span>
        <span data-type="media-mention" data-media-id="" data-kind="image"
          data-source-label="图片3" data-real-index="3">@图片3</span>
      </p>
    `)

    const paragraph = editor.getJSON().content[0]
    expect(paragraph.content.filter((node) => node.type === 'mediaMention')).toEqual([
      expect.objectContaining({ attrs: expect.objectContaining({ mediaId: 'm1', realIndex: 1 }) }),
    ])
    expect(editor.getText()).toContain('@视频2')
    expect(editor.getText()).toContain('@图片3')
    expect(editor.getHTML()).not.toContain('onclick')
    editor.destroy()
  })

  it('prunes removed or noncanonical mentions without renumbering remaining nodes', () => {
    const doc = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [
          { type: 'mediaMention', attrs: { mediaId: 'm1', kind: 'image', sourceLabel: '图片1', realIndex: 1 } },
          { type: 'text', text: ' 与 ' },
          { type: 'mediaMention', attrs: { mediaId: 'm2', kind: 'image', sourceLabel: '图片2', realIndex: 2 } },
          { type: 'mediaMention', attrs: { mediaId: 'm2', kind: 'image', sourceLabel: '伪造标签', realIndex: 2 } },
        ],
      }],
    }

    expect(pruneMediaMentionDoc(doc, [
      { id: 'm2', kind: 'image', status: 'ready', realIndex: 2 },
    ])).toEqual({
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [
          { type: 'text', text: ' 与 ' },
          { type: 'mediaMention', attrs: { mediaId: 'm2', kind: 'image', sourceLabel: '图片2', realIndex: 2 } },
        ],
      }],
    })
  })

  it('keeps plain text and current mentions while degrading unknown pasted mentions to text', () => {
    const editor = new Editor({ extensions: [StarterKit, MediaMention] })
    const container = document.createElement('div')
    container.innerHTML = `<p>中文
      <span data-type="media-mention" data-media-id="m1" data-kind="image"
        data-source-label="图片1" data-real-index="1">@图片1</span>
      <span data-type="media-mention" data-media-id="unknown" data-kind="image"
        data-source-label="图片9" data-real-index="9">@图片9</span>
      <span data-type="media-mention" data-media-id="m2" data-kind="video"
        data-source-label="视频2" data-real-index="2">@视频2</span>
      <script>alert(1)</script></p>`
    const slice = ProseMirrorDOMParser.fromSchema(editor.schema).parseSlice(container)
    const sanitized = sanitizeMediaMentionSlice(slice, [
      { id: 'm1', kind: 'image', status: 'ready', realIndex: 1 },
    ])
    editor.view.dispatch(editor.state.tr.replaceSelection(sanitized))

    const mentions = editor.getJSON().content[0].content
      .filter((node) => node.type === 'mediaMention')
    expect(mentions).toEqual([
      expect.objectContaining({ attrs: expect.objectContaining({ mediaId: 'm1' }) }),
    ])
    expect(editor.getText()).toContain('中文')
    expect(editor.getText()).toContain('@图片9')
    expect(editor.getText()).toContain('@视频2')
    expect(editor.getText()).not.toContain('alert(1)')
    editor.destroy()
  })

  it('selects and deletes a mention as one atomic node', () => {
    const editor = new Editor({
      extensions: [StarterKit, MediaMention],
      content: {
        type: 'doc',
        content: [{
          type: 'paragraph',
          content: [
            { type: 'text', text: '让 ' },
            { type: 'mediaMention', attrs: { mediaId: 'm1', kind: 'image', sourceLabel: '图片1', realIndex: 1 } },
            { type: 'text', text: ' 挥手' },
          ],
        }],
      },
    })
    let mentionPosition
    editor.state.doc.descendants((node, position) => {
      if (node.type.name === 'mediaMention') mentionPosition = position
    })
    editor.view.dispatch(editor.state.tr.setSelection(
      NodeSelection.create(editor.state.doc, mentionPosition),
    ))

    expect(editor.state.selection).toBeInstanceOf(NodeSelection)
    expect(editor.commands.deleteSelection()).toBe(true)
    expect(editor.getJSON().content[0].content).toEqual([
      { type: 'text', text: '让  挥手' },
    ])
    editor.destroy()
  })
})

describe('getMediaSuggestionItems', () => {
  it('returns only valid ready images in stable realIndex order', () => {
    const items = getMediaSuggestionItems([
      { id: 'm3', kind: 'image', status: 'ready', realIndex: 3 },
      { id: 'pending', kind: 'image', status: 'uploading', realIndex: 1 },
      { id: 'video', kind: 'video', status: 'ready', realIndex: 2 },
      { id: 'm1', kind: 'image', status: 'ready', realIndex: 1 },
      { id: '', kind: 'image', status: 'ready', realIndex: 4 },
      { id: 'bad-index', kind: 'image', status: 'ready', realIndex: 0 },
    ], '')

    expect(items).toEqual([
      expect.objectContaining({ mediaId: 'm1', sourceLabel: '图片1', realIndex: 1 }),
      expect.objectContaining({ mediaId: 'm3', sourceLabel: '图片3', realIndex: 3 }),
    ])
    expect(items.every((item) => item.disabled === false)).toBe(true)
  })

  it('filters by label and returns a disabled empty state when nothing matches', () => {
    const media = [
      { id: 'm1', kind: 'image', status: 'ready', realIndex: 1 },
      { id: 'm2', kind: 'image', status: 'ready', realIndex: 2 },
    ]

    expect(getMediaSuggestionItems(media, '2')).toEqual([
      expect.objectContaining({ mediaId: 'm2', sourceLabel: '图片2' }),
    ])
    expect(getMediaSuggestionItems(media, '不存在')).toEqual([{
      disabled: true,
      label: '请先添加参考内容',
    }])
  })

  it('drops duplicate identities and indexes instead of exposing ambiguous commands', () => {
    const items = getMediaSuggestionItems([
      { id: 'm1', kind: 'image', status: 'ready', realIndex: 1 },
      { id: 'm1', kind: 'image', status: 'ready', realIndex: 2 },
      { id: 'm3', kind: 'image', status: 'ready', realIndex: 1 },
      { id: 'm4', kind: 'image', status: 'ready', realIndex: 4 },
    ])

    expect(items).toEqual([
      expect.objectContaining({ mediaId: 'm4', realIndex: 4 }),
    ])
  })
})

describe('createMediaSuggestionRenderer', () => {
  const image1 = {
    mediaId: 'm1',
    kind: 'image',
    sourceLabel: '图片1',
    realIndex: 1,
    disabled: false,
  }
  const image2 = {
    mediaId: 'm2',
    kind: 'image',
    sourceLabel: '图片2',
    realIndex: 2,
    disabled: false,
  }

  it('wraps keyboard selection and inserts only a selectable item', () => {
    let state
    const command = vi.fn()
    const renderer = createMediaSuggestionRenderer((next) => { state = next })
    renderer.onStart({ items: [image1, image2], command, clientRect: null })

    expect(state.selectedIndex).toBe(0)
    expect(renderer.onKeyDown({ view: {}, event: { key: 'ArrowUp' } })).toBe(true)
    expect(state.selectedIndex).toBe(1)
    expect(renderer.onKeyDown({ view: {}, event: { key: 'ArrowDown' } })).toBe(true)
    expect(state.selectedIndex).toBe(0)
    expect(renderer.onKeyDown({ view: {}, event: { key: 'Enter' } })).toBe(true)
    expect(command).toHaveBeenCalledWith(image1)
  })

  it('never commands a disabled item and ignores composition Enter', () => {
    let state
    const command = vi.fn()
    const renderer = createMediaSuggestionRenderer((next) => { state = next })
    renderer.onStart({
      items: [{ disabled: true, label: '请先添加参考内容' }],
      command,
      clientRect: null,
    })

    expect(renderer.onKeyDown({ view: {}, event: { key: 'Enter' } })).toBe(false)
    expect(state.command(state.items[0])).toBe(false)
    expect(command).not.toHaveBeenCalled()

    renderer.onUpdate({ items: [image1], command, clientRect: null })
    expect(renderer.onKeyDown({
      view: { composing: true },
      event: { key: 'Enter', isComposing: false },
    })).toBe(false)
    expect(renderer.onKeyDown({
      view: {},
      event: { key: 'Enter', isComposing: true },
    })).toBe(false)
    expect(command).not.toHaveBeenCalled()
  })

  it('closes on Escape and keeps stale client rectangles and commands inert', () => {
    let state
    const command = vi.fn()
    const renderer = createMediaSuggestionRenderer((next) => { state = next })
    renderer.onStart({
      items: [image1],
      command,
      clientRect: () => { throw new Error('destroyed decoration') },
    })
    const staleCommand = state.command

    expect(state.clientRect()).toBeNull()
    expect(renderer.onKeyDown({ view: {}, event: { key: 'Escape' } })).toBe(true)
    expect(state).toMatchObject({ open: false, command: null, clientRect: null })
    expect(staleCommand(image1)).toBe(false)
    expect(command).not.toHaveBeenCalled()

    renderer.onExit()
    expect(state.open).toBe(false)
  })
})

describe('createMediaSuggestion', () => {
  const readyImage = {
    id: 'm1',
    kind: 'image',
    status: 'ready',
    realIndex: 1,
    previewUrl: '/uploads/m1.png',
  }

  it('keeps stale suggestion commands inert after the editor becomes non-editable', async () => {
    let state
    const editor = new Editor({
      extensions: [
        StarterKit,
        MediaMention,
        createMediaSuggestion({
          getItems: () => [readyImage],
          onStateChange: (next) => { state = next },
        }),
      ],
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
    })

    editor.commands.insertContent('@')
    await Promise.resolve()
    expect(state.open).toBe(true)
    const staleCommand = state.command
    const staleItem = state.items[0]

    editor.setEditable(false)
    expect(staleCommand(staleItem)).toBe(false)
    expect(editor.getJSON().content[0].content).toEqual([{ type: 'text', text: '@' }])
    editor.destroy()
  })
})

describe('PromptComposer', () => {
  const emptyDoc = { type: 'doc', content: [{ type: 'paragraph' }] }
  const readyImage = {
    id: 'm1',
    kind: 'image',
    status: 'ready',
    realIndex: 1,
    previewUrl: '/uploads/m1.png',
  }

  it('applies external JSON changes without feeding them back as updates', async () => {
    const initial = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: '初始提示' }] }],
    }
    const wrapper = mount(PromptComposer, {
      props: { modelValue: initial },
      attachTo: document.body,
    })
    await nextTick()

    expect(wrapper.find('.ProseMirror').text()).toBe('初始提示')
    await wrapper.setProps({ modelValue: structuredClone(initial) })
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()

    const external = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: '外部更新' }] }],
    }
    await wrapper.setProps({ modelValue: external })
    await nextTick()

    expect(wrapper.find('.ProseMirror').text()).toBe('外部更新')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    wrapper.unmount()
  })

  it('exposes guarded focus, insertMedia, and clear operations that emit JSON', async () => {
    const wrapper = mount(PromptComposer, {
      props: { modelValue: emptyDoc, mediaList: [readyImage] },
      attachTo: document.body,
    })
    await nextTick()

    expect(wrapper.vm.focus()).toBe(true)
    expect(wrapper.vm.insertMedia(readyImage)).toBe(true)
    await nextTick()

    const emitted = wrapper.emitted('update:modelValue')
    expect(emitted.at(-1)[0].content[0].content[0]).toEqual({
      type: 'mediaMention',
      attrs: {
        mediaId: 'm1',
        kind: 'image',
        sourceLabel: '图片1',
        realIndex: 1,
      },
    })
    expect(wrapper.vm.insertMedia({ ...readyImage, id: 'unknown' })).toBe(false)

    expect(wrapper.vm.clear()).toBe(true)
    await nextTick()
    expect(wrapper.emitted('update:modelValue').at(-1)[0]).toEqual(emptyDoc)

    await wrapper.setProps({ disabled: true })
    expect(wrapper.find('.ProseMirror').attributes('contenteditable')).toBe('false')
    expect(wrapper.vm.insertMedia(readyImage)).toBe(false)
    wrapper.unmount()
  })

  it('does not clear content or emit changes while disabled', async () => {
    const initial = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: '保留提示' }] }],
    }
    const wrapper = mount(PromptComposer, {
      props: { modelValue: initial, disabled: true },
      attachTo: document.body,
    })
    await nextTick()

    expect(wrapper.vm.clear()).toBe(false)
    await nextTick()

    expect(wrapper.find('.ProseMirror').text()).toBe('保留提示')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    wrapper.unmount()
  })

  it('opens the source-compatible menu and inserts the active suggestion by keyboard', async () => {
    const wrapper = mount(PromptComposer, {
      props: { modelValue: emptyDoc, mediaList: [readyImage] },
      attachTo: document.body,
    })
    await nextTick()
    const editor = wrapper.findComponent({ name: 'EditorContent' }).props('editor')

    editor.commands.insertContent('@')
    await Promise.resolve()
    await nextTick()

    expect(wrapper.find('[role="listbox"]').exists()).toBe(true)
    expect(wrapper.find('[role="option"]').text()).toContain('图片1')
    editor.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await nextTick()

    const doc = wrapper.emitted('update:modelValue').at(-1)[0]
    expect(doc.content[0].content[0]).toMatchObject({
      type: 'mediaMention',
      attrs: { mediaId: 'm1', sourceLabel: '图片1', realIndex: 1 },
    })
    expect(wrapper.find('[role="listbox"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('closes an open suggestion menu when disabled and ignores the stale selection', async () => {
    const wrapper = mount(PromptComposer, {
      props: { modelValue: emptyDoc, mediaList: [readyImage] },
      attachTo: document.body,
    })
    await nextTick()
    const editor = wrapper.findComponent({ name: 'EditorContent' }).props('editor')

    editor.commands.insertContent('@')
    await Promise.resolve()
    await nextTick()

    const menu = wrapper.findComponent(MediaSuggestionMenu)
    const staleItem = menu.props('items')[0]
    const updatesBeforeDisabling = wrapper.emitted('update:modelValue')?.length ?? 0

    await wrapper.setProps({ disabled: true })
    await nextTick()
    expect(wrapper.find('[role="listbox"]').exists()).toBe(false)

    menu.vm.$emit('select', staleItem)
    await nextTick()

    expect(wrapper.emitted('update:modelValue')).toHaveLength(updatesBeforeDisabling)
    expect(editor.getJSON().content[0].content).toEqual([{ type: 'text', text: '@' }])
    wrapper.unmount()
  })

  it('prunes stale mentions from initial content against the current media list', async () => {
    const initial = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [
          { type: 'mediaMention', attrs: { mediaId: 'stale', kind: 'image', sourceLabel: '图片9', realIndex: 9 } },
          { type: 'text', text: ' 和 ' },
          { type: 'mediaMention', attrs: { mediaId: 'm1', kind: 'image', sourceLabel: '图片1', realIndex: 1 } },
        ],
      }],
    }
    const wrapper = mount(PromptComposer, {
      props: { modelValue: initial, mediaList: [readyImage] },
      attachTo: document.body,
    })
    await nextTick()

    const emitted = wrapper.emitted('update:modelValue')
    expect(emitted.at(-1)[0].content[0].content).toEqual([
      { type: 'text', text: ' 和 ' },
      {
        type: 'mediaMention',
        attrs: { mediaId: 'm1', kind: 'image', sourceLabel: '图片1', realIndex: 1 },
      },
    ])
    expect(wrapper.find('.ProseMirror').element.textContent).toBe(' 和 @图片1')
    wrapper.unmount()
  })

  it('prunes stale mentions from external model updates without echoing valid updates', async () => {
    const wrapper = mount(PromptComposer, {
      props: { modelValue: emptyDoc, mediaList: [readyImage] },
      attachTo: document.body,
    })
    await nextTick()

    const validExternal = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: '外部有效更新' }] }],
    }
    await wrapper.setProps({ modelValue: validExternal })
    await nextTick()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()

    const staleExternal = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [
          { type: 'text', text: '保留 ' },
          { type: 'mediaMention', attrs: { mediaId: 'removed', kind: 'image', sourceLabel: '图片2', realIndex: 2 } },
          { type: 'mediaMention', attrs: { mediaId: 'm1', kind: 'image', sourceLabel: '伪造标签', realIndex: 1 } },
        ],
      }],
    }
    await wrapper.setProps({ modelValue: staleExternal })
    await nextTick()

    const emitted = wrapper.emitted('update:modelValue')
    expect(emitted).toHaveLength(1)
    expect(emitted[0][0]).toEqual({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: '保留 ' }] }],
    })
    expect(wrapper.find('.ProseMirror').element.textContent).toBe('保留 ')
    wrapper.unmount()
  })

  it('prunes removed media mentions without changing surviving realIndex values', async () => {
    const image2 = { ...readyImage, id: 'm2', realIndex: 2 }
    const doc = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [
          { type: 'mediaMention', attrs: { mediaId: 'm1', kind: 'image', sourceLabel: '图片1', realIndex: 1 } },
          { type: 'text', text: ' 和 ' },
          { type: 'mediaMention', attrs: { mediaId: 'm2', kind: 'image', sourceLabel: '图片2', realIndex: 2 } },
        ],
      }],
    }
    const wrapper = mount(PromptComposer, {
      props: { modelValue: doc, mediaList: [readyImage, image2] },
      attachTo: document.body,
    })
    await nextTick()

    await wrapper.setProps({ mediaList: [image2] })
    await nextTick()

    const emitted = wrapper.emitted('update:modelValue').at(-1)[0]
    expect(emitted.content[0].content).toEqual([
      { type: 'text', text: ' 和 ' },
      {
        type: 'mediaMention',
        attrs: { mediaId: 'm2', kind: 'image', sourceLabel: '图片2', realIndex: 2 },
      },
    ])
    expect(wrapper.find('.ProseMirror').element.textContent).toBe(' 和 @图片2')
    wrapper.unmount()
  })

  it('runs pasted slices through the live-media guard and preserves ordinary Chinese text', async () => {
    const wrapper = mount(PromptComposer, {
      props: { modelValue: emptyDoc, mediaList: [readyImage] },
      attachTo: document.body,
    })
    await nextTick()
    const editor = wrapper.findComponent({ name: 'EditorContent' }).props('editor')
    const container = document.createElement('div')
    container.innerHTML = `<p>粘贴中文
      <span data-type="media-mention" data-media-id="m1" data-kind="image"
        data-source-label="图片1" data-real-index="1">@图片1</span>
      <span data-type="media-mention" data-media-id="unknown" data-kind="image"
        data-source-label="图片9" data-real-index="9">@图片9</span></p>`
    const slice = ProseMirrorDOMParser.fromSchema(editor.schema).parseSlice(container)
    const transformed = editor.view.someProp(
      'transformPasted',
      (transform) => transform(slice, editor.view, false),
    )
    editor.view.dispatch(editor.state.tr.replaceSelection(transformed))
    await nextTick()

    const emitted = wrapper.emitted('update:modelValue').at(-1)[0]
    expect(emitted.content[0].content.filter((node) => node.type === 'mediaMention')).toEqual([
      expect.objectContaining({ attrs: expect.objectContaining({ mediaId: 'm1' }) }),
    ])
    expect(wrapper.find('.ProseMirror').element.textContent).toContain('粘贴中文')
    expect(wrapper.find('.ProseMirror').element.textContent).toContain('@图片9')
    wrapper.unmount()
  })

  it('destroys the editor and active suggestion plugin on unmount', async () => {
    const destroy = vi.spyOn(Editor.prototype, 'destroy')
    const wrapper = mount(PromptComposer, {
      props: { modelValue: emptyDoc, mediaList: [readyImage] },
      attachTo: document.body,
    })
    await nextTick()
    const editor = wrapper.findComponent({ name: 'EditorContent' }).props('editor')
    editor.commands.insertContent('@')
    await Promise.resolve()
    await nextTick()
    expect(wrapper.find('[role="listbox"]').exists()).toBe(true)

    wrapper.unmount()
    expect(destroy).toHaveBeenCalledTimes(1)
    expect(editor.isDestroyed).toBe(true)
  })
})

describe('MediaSuggestionMenu', () => {
  it('emits exact mouse selection and keeps the empty item inert', async () => {
    const selectable = {
      mediaId: 'm1',
      kind: 'image',
      sourceLabel: '图片1',
      label: '图片1',
      realIndex: 1,
      disabled: false,
      previewUrl: '/uploads/m1.png',
    }
    const disabled = { disabled: true, label: '请先添加参考内容' }
    const wrapper = mount(MediaSuggestionMenu, {
      props: { items: [selectable, disabled], selectedIndex: 0 },
    })

    const options = wrapper.findAll('[role="option"]')
    expect(options).toHaveLength(2)
    expect(options[0].attributes('aria-selected')).toBe('true')
    await options[0].trigger('mousedown')
    expect(wrapper.emitted('select')).toEqual([[selectable]])

    await options[1].trigger('mousedown')
    expect(wrapper.emitted('select')).toEqual([[selectable]])
  })
})

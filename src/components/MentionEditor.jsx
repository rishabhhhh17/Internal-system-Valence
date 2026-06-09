// =============================================================================
// MentionEditor — TipTap editor with @user mentions (Phase 24)
// =============================================================================
// Drop-in replacement for the plain <textarea> used in note + comment
// forms. Wires:
//   - StarterKit (headings/lists/bold/italic — minimal, sane defaults)
//   - Mention with a custom suggestion popup that queries the user's
//     team (public.seats joined to profile bits)
//
// Props:
//   value         — TipTap JSON OR plain text seed (initial only)
//   onChange      — fires on every edit with { html, text, json,
//                   mentionedUserIds }
//   onSubmit      — fires on Cmd+Enter / Ctrl+Enter with the same shape
//   placeholder   — string
//
// The parent component is responsible for persisting both `content`
// (plain text) and `content_json` (TipTap doc), and for calling
// notifyMentions() from src/lib/notifications.js after the save row
// lands. This component is presentation-only.
// =============================================================================

import { useEffect, useMemo, useRef } from 'react'
import { useEditor, EditorContent, ReactRenderer } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Mention from '@tiptap/extension-mention'
import tippy from 'tippy.js'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'

// Walks a TipTap doc to extract every mention node's attrs.id (uuid).
export function extractMentionedUserIds(doc) {
  if (!doc || typeof doc !== 'object') return []
  const ids = new Set()
  function walk(node) {
    if (!node) return
    if (node.type === 'mention' && node.attrs?.id) ids.add(node.attrs.id)
    if (Array.isArray(node.content)) node.content.forEach(walk)
  }
  walk(doc)
  return Array.from(ids)
}

// Walks a TipTap doc to extract every mention node's display label, so
// renderers can highlight the exact `@Full Name` string in the stored plain
// text (which can contain spaces a naive @\w+ regex would split).
export function extractMentionLabels(doc) {
  if (!doc || typeof doc !== 'object') return []
  const labels = new Set()
  function walk(node) {
    if (!node) return
    if (node.type === 'mention' && (node.attrs?.label || node.attrs?.id)) {
      labels.add(node.attrs.label || node.attrs.id)
    }
    if (Array.isArray(node.content)) node.content.forEach(walk)
  }
  walk(doc)
  return Array.from(labels)
}

// Suggestion list — keyboard-navigable popup that opens when the user
// types '@'. Renders inline as a tippy.js tooltip. We fetch teammates
// once on first open and filter client-side (the team is small enough
// that a 50-row fetch is fine; if it ever isn't, swap to a query
// debounce here).
function SuggestionList({ items, command }) {
  return (
    <div className="rounded-lg border border-valence-border bg-valence-elevated shadow-valence-lg overflow-hidden min-w-[240px]">
      {items.length === 0 ? (
        <div className="px-3 py-2 text-xs text-valence-muted">No matches</div>
      ) : (
        items.map((item, i) => (
          <button
            key={item.id}
            type="button"
            onClick={() => command(item)}
            className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs hover:bg-valence-blue-soft/60 transition"
          >
            <span className="grid h-6 w-6 place-items-center rounded-full bg-valence-blue-soft text-[10px] font-semibold text-valence-blue shrink-0">
              {(item.label || item.email || '?').slice(0,2).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-valence-text truncate">{item.label || item.email}</p>
              {item.title && <p className="text-[10px] text-valence-muted truncate">{item.title}</p>}
            </div>
          </button>
        ))
      )}
    </div>
  )
}

// Cache invalidates on every auth state change so signing out + back in
// as a different user (or in a different org) doesn't leak the previous
// session's teammates into the mention popup. Subscribed once at module
// load — supabase-js handles re-subscription on its own.
let teammatesCache = null
if (typeof window !== 'undefined' && supabase?.auth?.onAuthStateChange) {
  supabase.auth.onAuthStateChange(() => { teammatesCache = null })
}
async function fetchTeammates() {
  if (teammatesCache) return teammatesCache
  if (!isSupabaseConfigured) return []
  try {
    const { data } = await supabase
      .from('seats')
      .select('user_id, email, full_name, title')
      .eq('active', true)
      .limit(50)
    teammatesCache = (data || [])
      .filter(s => s.user_id) // some seats are placeholder rows without an auth user
      .map(s => ({
        id:    s.user_id,
        label: s.full_name || s.email || 'Unnamed',
        email: s.email,
        title: s.title
      }))
    return teammatesCache
  } catch {
    return []
  }
}

export default function MentionEditor({ value, onChange, onSubmit, placeholder = 'Write something… type @ to mention a teammate' }) {
  // Hold a ref to the latest onSubmit so the editor extension can call
  // the current handler without re-creating the editor on every render.
  const submitRef = useRef(onSubmit)
  useEffect(() => { submitRef.current = onSubmit }, [onSubmit])

  // Normalise the `value` prop: pass through TipTap JSON if it's an
  // object, otherwise treat as plain text seed. Captured at first mount;
  // see the useEffect below for the controlled-re-sync path.
  const initialContent = useMemo(() => {
    if (value && typeof value === 'object') return value
    if (typeof value === 'string' && value.trim()) return value
    return ''
  }, []) // intentionally empty — editor content is uncontrolled after mount

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Keep StarterKit lean — partners don't need headings/code/etc
        // in a comment box.
        heading:    false,
        codeBlock:  false,
        blockquote: false,
        horizontalRule: false
      }),
      Mention.configure({
        HTMLAttributes: { class: 'inline-block rounded bg-valence-blue-soft px-1 text-valence-blue font-semibold' },
        renderText:    ({ node }) => `@${node.attrs.label || node.attrs.id}`,
        suggestion: {
          char: '@',
          items: async ({ query }) => {
            const list = await fetchTeammates()
            const q = (query || '').toLowerCase()
            if (!q) return list.slice(0, 6)
            return list.filter(t =>
              (t.label || '').toLowerCase().includes(q) ||
              (t.email || '').toLowerCase().includes(q)
            ).slice(0, 6)
          },
          render: () => {
            let component, popup
            return {
              onStart: (props) => {
                component = new ReactRenderer(SuggestionList, { props, editor: props.editor })
                if (!props.clientRect) return
                popup = tippy('body', {
                  getReferenceClientRect: props.clientRect,
                  appendTo: () => document.body,
                  content: component.element,
                  showOnCreate: true,
                  interactive: true,
                  trigger: 'manual',
                  placement: 'bottom-start'
                })
              },
              onUpdate: (props) => {
                component?.updateProps(props)
                if (props.clientRect) popup?.[0]?.setProps({ getReferenceClientRect: props.clientRect })
              },
              onKeyDown: (props) => {
                if (props.event.key === 'Escape') { popup?.[0]?.hide(); return true }
                return component?.ref?.onKeyDown?.(props) || false
              },
              onExit: () => { popup?.[0]?.destroy(); component?.destroy() }
            }
          }
        }
      })
    ],
    content: initialContent,
    editorProps: {
      attributes: {
        class: 'min-h-[80px] max-h-[280px] overflow-y-auto rounded-lg border border-valence-border bg-valence-surface px-3 py-2.5 text-sm leading-relaxed text-valence-text focus:outline-none focus:border-valence-blue/40 focus:bg-valence-elevated transition prose prose-sm',
        'data-placeholder': placeholder
      },
      // Cmd/Ctrl+Enter → submit. ProseMirror keymaps fall through if not
      // handled; we return true on submit so the default Enter handling
      // is preserved for new paragraphs.
      handleKeyDown(view, event) {
        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
          const json = editor?.getJSON()
          const text = editor?.getText() || ''
          submitRef.current?.({
            json,
            text,
            html: editor?.getHTML() || '',
            mentionedUserIds: extractMentionedUserIds(json)
          })
          return true
        }
        return false
      }
    },
    onUpdate: ({ editor }) => {
      const json = editor.getJSON()
      onChange?.({
        json,
        text: editor.getText(),
        html: editor.getHTML(),
        mentionedUserIds: extractMentionedUserIds(json)
      })
    }
  })

  // Cleanup on unmount.
  useEffect(() => () => editor?.destroy(), [editor])

  // Controlled re-sync: when the parent passes a fresh `value` (e.g. user
  // navigated between two KB notes that share this editor instance), push
  // the new content in without losing the user's caret if they're mid-
  // type. Equality check on JSON.stringify is cheap — the doc is small.
  useEffect(() => {
    if (!editor || !value) return
    const incoming = typeof value === 'object' ? value : null
    if (!incoming) return
    const current = editor.getJSON()
    if (JSON.stringify(current) === JSON.stringify(incoming)) return
    editor.commands.setContent(incoming, false)   // false = don't fire onUpdate
  }, [value, editor])

  return <EditorContent editor={editor} />
}

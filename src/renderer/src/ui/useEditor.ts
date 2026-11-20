import { useSyncExternalStore } from 'react'
import { editor } from '@core/editor'

/** Re-render the component whenever the editor changes. */
export function useEditor() {
  useSyncExternalStore(editor.subscribe, editor.getVersion)
  return editor
}

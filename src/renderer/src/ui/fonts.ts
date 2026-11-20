import { useEffect, useState } from 'react'
import { platform } from '../platform'
import { editor } from '@core/editor'

let families: string[] | null = null
let loading: Promise<string[]> | null = null
const listeners = new Set<(f: string[]) => void>()

export function loadFonts(): Promise<string[]> {
  if (families) return Promise.resolve(families)
  if (!loading) {
    loading = platform.listFonts().then((fonts) => {
      const set = new Set(fonts.map((f) => f.family))
      families = [...set].sort((a, b) => a.localeCompare(b))
      listeners.forEach((l) => l(families!))
      return families
    }).catch(() => (families = []))
  }
  return loading
}

export function useFontFamilies(): string[] {
  const [list, setList] = useState<string[]>(families ?? [])
  useEffect(() => {
    listeners.add(setList)
    loadFonts().then(setList)
    return () => { listeners.delete(setList) }
  }, [])
  return list
}

/** When web fonts finish loading, text must be measured again. */
if (typeof document !== 'undefined' && document.fonts) {
  document.fonts.addEventListener?.('loadingdone', () => {
    editor.measurer.reset()
    editor.text.invalidate()
    editor.touch()
  })
}

/** Make sure a font used in the document is loaded before measuring. */
export function ensureFont(family: string): void {
  if (!document.fonts?.load) return
  const specs = [`16px "${family}"`, `bold 16px "${family}"`, `italic 16px "${family}"`]
  Promise.all(specs.map((s) => document.fonts.load(s))).then(() => {
    editor.measurer.reset()
    editor.text.invalidate()
    editor.touch()
  }).catch(() => {})
}

export const FONT_SIZES = ['8', '9', '10', '10.5', '11', '12', '14', '16', '18', '20', '24', '28', '36', '48', '72', '96', '120', '144', '200', '288', '400', '500']

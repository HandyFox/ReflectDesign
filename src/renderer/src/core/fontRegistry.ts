// Fonts loaded by ReflectDesign itself (installed from Google Fonts). They are
// registered with the page so they work immediately, and embedded into print
// and PDF output so the printing engine always has them.

import type { GoogleFontFile } from '@shared/api'
import type { RDocument, SceneObject } from './model/types'

const files: GoogleFontFile[] = []
const listeners = new Set<() => void>()

export function onFontsChanged(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export async function registerFontFiles(list: GoogleFontFile[]): Promise<void> {
  for (const f of list) {
    if (files.some((x) => x.family === f.family && x.weight === f.weight && x.italic === f.italic)) continue
    try {
      const face = new FontFace(f.family, f.bytes as BufferSource, { weight: String(f.weight), style: f.italic ? 'italic' : 'normal' })
      await face.load()
      document.fonts.add(face)
      files.push(f)
    } catch (e) {
      console.warn('Could not load font', f.family, e)
    }
  }
  listeners.forEach((l) => l())
}

export function registeredFamilies(): string[] {
  return [...new Set(files.map((f) => f.family))]
}

function base64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

/** @font-face rules for registered fonts that the document uses. */
export function fontFaceCss(doc: RDocument): string {
  const used = new Set<string>()
  for (const story of Object.values(doc.stories)) for (const p of story.paragraphs) for (const r of p.runs) used.add(r.style.font)
  // Calendars draw their own text.
  const walk = (list: SceneObject[]) => list.forEach((o) => {
    if (o.type === 'calendar') { used.add(o.style.font); used.add(o.style.titleFont) }
    else if (o.type === 'group') walk(o.children)
  })
  for (const p of [...doc.pages, ...doc.masters]) walk(p.objects)
  return files
    .filter((f) => used.has(f.family))
    .map((f) => `@font-face { font-family: "${f.family}"; font-weight: ${f.weight}; font-style: ${f.italic ? 'italic' : 'normal'}; src: url(data:font/ttf;base64,${base64(f.bytes)}); }`)
    .join('\n')
}

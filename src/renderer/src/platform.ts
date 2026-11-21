// Access to the desktop shell. In Electron this is window.reflect (preload);
// in the browser test mode we fall back to downloads and file pickers.

import type { OpenedFile, PickedImage, ReflectAPI, SystemFont, TemplateInfo } from '@shared/api'

function pickFiles(accept: string, multiple: boolean): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.multiple = multiple
    input.onchange = () => resolve(Array.from(input.files ?? []))
    input.oncancel = () => resolve([])
    input.click()
  })
}

function download(bytes: Uint8Array, name: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

/** Browser test mode: use the browser's print dialog ("Save as PDF"). */
function printInIframe(html: string): void {
  const frame = document.createElement('iframe')
  frame.style.cssText = 'position:fixed;width:0;height:0;border:0;left:-10px'
  document.body.appendChild(frame)
  frame.srcdoc = html
  frame.onload = () => {
    frame.contentWindow?.print()
    setTimeout(() => frame.remove(), 60000)
  }
}

const BROWSER_TEMPLATES_KEY = 'reflectdesign.templates'

const browserApi: ReflectAPI = {
  platform: 'web',
  async openDocument(): Promise<OpenedFile | null> {
    const [f] = await pickFiles('.rdx,.rdt', false)
    if (!f) return null
    return { path: null, name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }
  },
  async saveDocument(bytes, _path, suggestedName, kind = 'rdx') {
    const name = suggestedName.endsWith(`.${kind}`) ? suggestedName : `${suggestedName}.${kind}`
    download(bytes, name, 'application/x-reflectdesign')
    return name
  },
  // The browser test mode can't reopen files by path, so it has no recent list.
  async listRecent() {
    return []
  },
  async openRecent() {
    return null
  },
  async removeRecent() {},
  async pickImages(): Promise<PickedImage[]> {
    const files = await pickFiles('image/*', true)
    return Promise.all(files.map(async (f) => ({ name: f.name, mime: f.type || 'image/png', bytes: new Uint8Array(await f.arrayBuffer()) })))
  },
  async saveExport(bytes, suggestedName, _filterName, ext) {
    download(bytes, suggestedName, ext === 'pdf' ? 'application/pdf' : `image/${ext}`)
    return suggestedName
  },
  async exportPdf(html) {
    printInIframe(html)
    return 'print dialog'
  },
  async printHtml(html) {
    printInIframe(html)
    return true
  },
  async listFonts(): Promise<SystemFont[]> {
    // Chromium's Local Font Access API, when allowed.
    const q = (window as any).queryLocalFonts
    if (typeof q === 'function') {
      try {
        const fonts = await q()
        return fonts.map((f: any) => ({ family: f.family, style: f.style, weight: /bold/i.test(f.style) ? 700 : 400, italic: /italic/i.test(f.style), path: '' }))
      } catch { /* permission denied */ }
    }
    return ['Arial', 'Calibri', 'Cambria', 'Comic Sans MS', 'Courier New', 'Georgia', 'Impact', 'Times New Roman', 'Trebuchet MS', 'Verdana']
      .map((family) => ({ family, style: 'Regular', weight: 400, italic: false, path: '' }))
  },
  async listGoogleFonts() {
    throw new Error('Google Fonts can be installed in the desktop app.')
  },
  async installGoogleFont() {
    throw new Error('Google Fonts can be installed in the desktop app.')
  },
  async installedGoogleFonts() {
    return []
  },
  async readFontFile() {
    return new Uint8Array()
  },
  async listTemplates(): Promise<TemplateInfo[]> {
    try {
      return JSON.parse(localStorage.getItem(BROWSER_TEMPLATES_KEY) ?? '[]')
    } catch {
      return []
    }
  },
  async readTemplate() {
    return new Uint8Array()
  },
  async saveTemplate(bytes, name) {
    download(bytes, `${name}.rdt`, 'application/x-reflectdesign-template')
    return name
  },
  async askUnsaved(name) {
    return window.confirm(`${name} has unsaved changes. Discard them?`) ? 'discard' : 'cancel'
  },
  setDirty() {},
  setTitle(title) { document.title = title },
  onAppCommand() {},
  forceClose() {}
}

export const platform: ReflectAPI = window.reflect ?? browserApi
export const isDesktop = !!window.reflect

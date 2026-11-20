// .rdx (publication) and .rdt (template) files are zip archives:
//
//   mimetype            "application/x-reflectdesign"
//   document.json       the RDocument
//   assets/<id>.<ext>   pictures at full resolution
//   fonts/<file>        embedded fonts (later milestone)
//   thumbnail.png       first-page preview (optional)
//   template.json       { name, category, description } (templates only)

import JSZip from 'jszip'
import type { AssetData, RDocument } from '../model/types'
import { DOC_VERSION } from '../model/types'
import { migrate } from './migrate'

export const MIME = 'application/x-reflectdesign'

export interface TemplateMeta {
  name: string
  category: string
  description: string
}

export interface PackageInput {
  doc: RDocument
  assets: Map<string, AssetData>
  thumbnail?: Uint8Array
  template?: TemplateMeta
}

const EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/bmp': 'bmp',
  'image/svg+xml': 'svg'
}

export async function writePackage({ doc, assets, thumbnail, template }: PackageInput): Promise<Uint8Array> {
  const zip = new JSZip()
  zip.file('mimetype', MIME, { compression: 'STORE' })
  zip.file('document.json', JSON.stringify(doc))
  for (const id of Object.keys(doc.assets)) {
    const a = assets.get(id)
    if (!a) continue
    // Pictures are already compressed; storing them is faster.
    zip.file(`assets/${id}.${EXT[a.info.mime] ?? 'bin'}`, a.bytes, { compression: 'STORE' })
  }
  if (thumbnail) zip.file('thumbnail.png', thumbnail, { compression: 'STORE' })
  if (template) zip.file('template.json', JSON.stringify(template))
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } })
}

export interface ReadResult {
  doc: RDocument
  assets: Map<string, AssetData>
  template: TemplateMeta | null
}

export async function readPackage(bytes: Uint8Array): Promise<ReadResult> {
  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(bytes)
  } catch {
    throw new Error('This file is not a ReflectDesign publication or it is damaged.')
  }
  const docFile = zip.file('document.json')
  if (!docFile) throw new Error('This file is missing its document data.')
  const raw = JSON.parse(await docFile.async('string'))
  if (typeof raw.version === 'number' && raw.version > DOC_VERSION) {
    throw new Error('This publication was made with a newer version of ReflectDesign. Please update the app to open it.')
  }
  const doc = migrate(raw)
  const assets = new Map<string, AssetData>()
  const files = zip.folder('assets')
  if (files) {
    const entries: Array<[string, JSZip.JSZipObject]> = []
    files.forEach((path, file) => { if (!file.dir) entries.push([path, file]) })
    await Promise.all(entries.map(async ([path, file]) => {
      const id = path.replace(/\.[^.]+$/, '')
      const info = doc.assets[id]
      if (!info) return
      assets.set(id, { info, bytes: await file.async('uint8array') })
    }))
  }
  const tpl = zip.file('template.json')
  const template = tpl ? (JSON.parse(await tpl.async('string')) as TemplateMeta) : null
  return { doc, assets, template }
}

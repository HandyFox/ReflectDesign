import { app } from 'electron'
import { readdir, readFile } from 'node:fs/promises'
import { join, basename } from 'node:path'
import JSZip from 'jszip'
import type { TemplateInfo } from '@shared/api'

export function personalTemplateDir(): string {
  return join(app.getPath('userData'), 'templates')
}

function builtInTemplateDir(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'templates')
    : join(app.getAppPath(), 'resources', 'templates')
}

async function readInfo(path: string, builtIn: boolean): Promise<TemplateInfo | null> {
  try {
    const zip = await JSZip.loadAsync(await readFile(path))
    const metaFile = zip.file('template.json')
    const meta = metaFile ? JSON.parse(await metaFile.async('string')) : {}
    const thumbFile = zip.file('thumbnail.png')
    const thumbnail = thumbFile ? `data:image/png;base64,${await thumbFile.async('base64')}` : undefined
    return {
      id: `${builtIn ? 'b' : 'p'}:${basename(path)}`,
      name: meta.name ?? basename(path, '.rdt'),
      category: meta.category ?? (builtIn ? 'Featured' : 'Personal'),
      description: meta.description ?? '',
      builtIn,
      path,
      thumbnail
    }
  } catch {
    return null
  }
}

async function listDir(dir: string, builtIn: boolean): Promise<TemplateInfo[]> {
  let names: string[] = []
  try {
    names = (await readdir(dir)).filter((n) => n.toLowerCase().endsWith('.rdt'))
  } catch {
    return []
  }
  const infos = await Promise.all(names.map((n) => readInfo(join(dir, n), builtIn)))
  return infos.filter((i): i is TemplateInfo => i !== null)
}

export async function listTemplates(): Promise<TemplateInfo[]> {
  const [builtIn, personal] = await Promise.all([
    listDir(builtInTemplateDir(), true),
    listDir(personalTemplateDir(), false)
  ])
  return [...builtIn, ...personal]
}

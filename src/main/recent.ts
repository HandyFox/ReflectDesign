// File › Open › Recent: the publications opened or saved most recently.
// The list lives in recent-files.json in the app's user-data folder.

import { app } from 'electron'
import { readFile, stat } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import JSZip from 'jszip'
import type { RecentFile } from '@shared/api'
import { writeFileAtomic } from './atomic'

const MAX = 20

interface Entry { path: string; opened: string }

function listFile(): string {
  return join(app.getPath('userData'), 'recent-files.json')
}

async function load(): Promise<Entry[]> {
  try {
    const data = JSON.parse(await readFile(listFile(), 'utf8'))
    return Array.isArray(data) ? data.filter((e) => e && typeof e.path === 'string') : []
  } catch {
    return []
  }
}

async function store(entries: Entry[]): Promise<void> {
  try {
    await writeFileAtomic(listFile(), JSON.stringify(entries.slice(0, MAX), null, 1))
  } catch { /* the recent list must never break opening or saving */ }
}

// One change at a time, so quick open+save pairs don't overwrite each other.
let queue: Promise<unknown> = Promise.resolve()
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const p = queue.then(fn, fn)
  queue = p.catch(() => {})
  return p
}

const samePath = (a: string, b: string) => (process.platform === 'linux' ? a === b : a.toLowerCase() === b.toLowerCase())

/** Put a file at the top of the list. */
export function addRecent(path: string): Promise<void> {
  app.addRecentDocument(path)
  return serial(async () => {
    const entries = (await load()).filter((e) => !samePath(e.path, path))
    entries.unshift({ path, opened: new Date().toISOString() })
    await store(entries)
  })
}

/** Remove one file, or clear the whole list when path is null. */
export function removeRecent(path: string | null): Promise<void> {
  return serial(async () => {
    if (path === null) {
      app.clearRecentDocuments()
      await store([])
      return
    }
    await store((await load()).filter((e) => !samePath(e.path, path)))
  })
}

export function isRecent(path: string): Promise<boolean> {
  return load().then((entries) => entries.some((e) => samePath(e.path, path)))
}

async function thumbnailOf(path: string): Promise<string | undefined> {
  try {
    const zip = await JSZip.loadAsync(await readFile(path))
    const thumb = zip.file('thumbnail.png')
    return thumb ? `data:image/png;base64,${await thumb.async('base64')}` : undefined
  } catch {
    return undefined
  }
}

/** The list for the Open screen. Files that no longer exist are left out. */
export async function listRecent(): Promise<RecentFile[]> {
  const entries = await load()
  const out = await Promise.all(entries.map(async (e): Promise<RecentFile | null> => {
    try {
      if (!(await stat(e.path)).isFile()) return null
    } catch {
      return null
    }
    return { path: e.path, name: basename(e.path), folder: dirname(e.path), opened: e.opened, thumbnail: await thumbnailOf(e.path) }
  }))
  return out.filter((r): r is RecentFile => r !== null)
}

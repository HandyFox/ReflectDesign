// Google Fonts: browse the catalogue and install fonts for this user.
// On Linux, fonts go to ~/.local/share/fonts so every app can use them.
// Elsewhere they are kept in ReflectDesign's own folder and loaded at start-up.

import { app, net } from 'electron'
import { execFile } from 'node:child_process'
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { GoogleFontFile, GoogleFontInfo } from '@shared/api'

const METADATA_URL = 'https://fonts.google.com/metadata/fonts'
const CACHE_DAYS = 7

function fontDir(): string {
  return process.platform === 'linux'
    ? join(homedir(), '.local', 'share', 'fonts', 'ReflectDesign Google Fonts')
    : join(app.getPath('userData'), 'google-fonts')
}

function safeName(family: string): string {
  return family.replace(/[^\w\- ]+/g, '').trim()
}

export async function listGoogleFonts(): Promise<GoogleFontInfo[]> {
  const cache = join(app.getPath('userData'), 'google-fonts-catalog.json')
  try {
    const s = await stat(cache)
    if (Date.now() - s.mtimeMs < CACHE_DAYS * 86400000) return JSON.parse(await readFile(cache, 'utf8'))
  } catch { /* no cache yet */ }
  try {
    const res = await net.fetch(METADATA_URL)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    // The response starts with an anti-JSON-hijacking prefix.
    const text = (await res.text()).replace(/^\)\]\}'\s*/, '')
    const data = JSON.parse(text)
    const list: GoogleFontInfo[] = (data.familyMetadataList ?? []).map((f: any) => ({
      family: f.family,
      category: f.category ?? 'Other',
      popularity: f.popularity ?? 9999,
      variants: Object.keys(f.fonts ?? { '400': {} })
    }))
    list.sort((a, b) => a.popularity - b.popularity)
    await writeFile(cache, JSON.stringify(list)).catch(() => {})
    return list
  } catch (e) {
    // Offline: fall back to an old cache if there is one.
    try { return JSON.parse(await readFile(cache, 'utf8')) } catch { throw e }
  }
}

/** Pick regular, bold, italic and bold italic (or the nearest that exist). */
function chooseVariants(variants: string[]): Array<{ weight: number; italic: boolean }> {
  const parsed = variants.map((v) => ({ weight: parseInt(v, 10) || 400, italic: v.endsWith('i') }))
  const pick = (weight: number, italic: boolean) => {
    const same = parsed.filter((p) => p.italic === italic)
    if (!same.length) return null
    return same.reduce((best, p) => (Math.abs(p.weight - weight) < Math.abs(best.weight - weight) ? p : best))
  }
  const out = [pick(400, false), pick(700, false), pick(400, true), pick(700, true)].filter((p): p is { weight: number; italic: boolean } => !!p)
  const seen = new Set<string>()
  return out.filter((p) => { const k = `${p.weight}${p.italic}`; if (seen.has(k)) return false; seen.add(k); return true })
}

export async function installGoogleFont(family: string, variants: string[]): Promise<GoogleFontFile[]> {
  const chosen = chooseVariants(variants.length ? variants : ['400'])
  const axis = chosen.some((c) => c.italic)
    ? `ital,wght@${chosen.map((c) => `${c.italic ? 1 : 0},${c.weight}`).sort().join(';')}`
    : `wght@${chosen.map((c) => c.weight).sort((a, b) => a - b).join(';')}`
  const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, '+')}:${axis}`
  // An unrecognised user agent gets plain TrueType files, which every app can use.
  const css = await (await net.fetch(url, { headers: { 'User-Agent': 'curl/8.5.0' } })).text()
  const faces = [...css.matchAll(/@font-face\s*{([^}]*)}/g)].map((m) => {
    const body = m[1]
    return {
      italic: /font-style:\s*italic/.test(body),
      weight: parseInt(body.match(/font-weight:\s*(\d+)/)?.[1] ?? '400', 10),
      src: body.match(/src:\s*url\(([^)]+)\)/)?.[1]
    }
  }).filter((f) => f.src)
  if (!faces.length) throw new Error(`Google Fonts didn't return any files for "${family}".`)
  const dir = join(fontDir(), safeName(family))
  await mkdir(dir, { recursive: true })
  const files: GoogleFontFile[] = []
  for (const f of faces) {
    const res = await net.fetch(f.src!)
    if (!res.ok) continue
    const bytes = new Uint8Array(await res.arrayBuffer())
    const ext = f.src!.includes('.otf') ? 'otf' : 'ttf'
    const path = join(dir, `${safeName(family).replace(/ /g, '')}-${f.weight}${f.italic ? 'Italic' : ''}.${ext}`)
    await writeFile(path, bytes)
    files.push({ family, weight: f.weight, italic: f.italic, path, bytes })
  }
  await writeFile(join(dir, 'family.json'), JSON.stringify({ family, files: files.map(({ bytes: _b, ...rest }) => rest) }))
  if (process.platform === 'linux') execFile('fc-cache', ['-f', join(homedir(), '.local', 'share', 'fonts')], () => {})
  return files
}

/** Fonts installed from Google, so they can be loaded right away (and on Windows/macOS at all). */
export async function installedGoogleFonts(): Promise<GoogleFontFile[]> {
  const out: GoogleFontFile[] = []
  let dirs: string[] = []
  try { dirs = await readdir(fontDir()) } catch { return out }
  for (const d of dirs) {
    try {
      const meta = JSON.parse(await readFile(join(fontDir(), d, 'family.json'), 'utf8'))
      for (const f of meta.files) out.push({ ...f, bytes: new Uint8Array(await readFile(f.path)) })
    } catch { /* not ours or damaged */ }
  }
  return out
}

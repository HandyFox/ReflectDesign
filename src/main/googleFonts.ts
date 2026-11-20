// Google Fonts: browse the catalogue and install fonts for this user.
// On Linux, fonts go to ~/.local/share/fonts so every app can use them.
// Elsewhere they are kept in ReflectDesign's own folder and loaded at start-up.
//
// Two sources are tried, so one being blocked or changed doesn't break the
// feature: Google Fonts itself, then Fontsource (an open mirror of the same
// Google fonts served from jsDelivr).

import { app, net } from 'electron'
import { execFile } from 'node:child_process'
import { appendFile, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { GoogleFontFile, GoogleFontInfo } from '@shared/api'

const GOOGLE_METADATA = 'https://fonts.google.com/metadata/fonts'
const FONTSOURCE_LIST = 'https://api.fontsource.org/v1/fonts?type=google'
const FONTSOURCE_FONT = 'https://api.fontsource.org/v1/fonts/'
const CACHE_DAYS = 7
const TIMEOUT_MS = 30000

function fontDir(): string {
  return process.platform === 'linux'
    ? join(homedir(), '.local', 'share', 'fonts', 'ReflectDesign Google Fonts')
    : join(app.getPath('userData'), 'google-fonts')
}

function safeName(family: string): string {
  return family.replace(/[^\w\- ]+/g, '').trim()
}

function errText(e: unknown): string {
  const err = e as { message?: string; cause?: { message?: string; code?: string } }
  const cause = err?.cause ? ` (${err.cause.code ?? err.cause.message ?? ''})` : ''
  return `${err?.message ?? String(e)}${cause}`
}

async function log(msg: string): Promise<void> {
  try {
    await appendFile(join(app.getPath('userData'), 'google-fonts.log'), `${new Date().toISOString()} ${msg}\n`)
  } catch { /* logging must never break anything */ }
}

/**
 * GET a URL. Tries Chromium's network stack first (uses the system proxy),
 * then Node's own fetch. Throws with the reasons from both if both fail.
 */
async function httpGet(url: string, headers: Record<string, string> = {}): Promise<Response> {
  const errors: string[] = []
  const attempts: Array<[string, () => Promise<Response>]> = [
    ['electron', () => net.fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) } as RequestInit)],
    ['node', () => globalThis.fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) })]
  ]
  for (const [name, attempt] of attempts) {
    try {
      const res = await attempt()
      if (res.ok) return res
      errors.push(`${name}: HTTP ${res.status}`)
    } catch (e) {
      errors.push(`${name}: ${errText(e)}`)
    }
  }
  const msg = `${url} → ${errors.join('; ')}`
  await log(msg)
  throw new Error(msg)
}

const CATEGORY: Record<string, string> = {
  'sans-serif': 'Sans Serif',
  serif: 'Serif',
  display: 'Display',
  handwriting: 'Handwriting',
  monospace: 'Monospace'
}

function fontsourceId(family: string): string {
  return family.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

async function fromGoogle(): Promise<GoogleFontInfo[]> {
  const res = await httpGet(GOOGLE_METADATA)
  // Older responses start with an anti-JSON-hijacking prefix.
  const text = (await res.text()).replace(/^\)\]\}'\s*/, '')
  const data = JSON.parse(text)
  const list: GoogleFontInfo[] = (data.familyMetadataList ?? []).map((f: any) => ({
    family: f.family,
    id: fontsourceId(f.family),
    category: CATEGORY[String(f.category).toLowerCase()] ?? f.category ?? 'Other',
    popularity: f.popularity ?? 9999,
    variants: Object.keys(f.fonts ?? { '400': {} })
  }))
  if (!list.length) throw new Error('Google Fonts returned an empty list')
  return list.sort((a, b) => a.popularity - b.popularity)
}

async function fromFontsource(): Promise<GoogleFontInfo[]> {
  const res = await httpGet(FONTSOURCE_LIST)
  const data = (await res.json()) as any[]
  const list: GoogleFontInfo[] = data.map((f, i) => ({
    family: f.family,
    id: f.id,
    category: CATEGORY[f.category] ?? 'Other',
    popularity: 10000 + i,
    variants: (f.weights as number[]).flatMap((w) => (f.styles as string[]).map((s) => `${w}${s === 'italic' ? 'i' : ''}`))
  }))
  if (!list.length) throw new Error('Fontsource returned an empty list')
  return list.sort((a, b) => a.family.localeCompare(b.family))
}

export async function listGoogleFonts(): Promise<GoogleFontInfo[]> {
  const cache = join(app.getPath('userData'), 'google-fonts-catalog.json')
  try {
    const s = await stat(cache)
    if (Date.now() - s.mtimeMs < CACHE_DAYS * 86400000) {
      const cached = JSON.parse(await readFile(cache, 'utf8'))
      if (Array.isArray(cached) && cached.length) return cached
    }
  } catch { /* no cache yet */ }
  const problems: string[] = []
  for (const source of [fromGoogle, fromFontsource]) {
    try {
      const list = await source()
      await writeFile(cache, JSON.stringify(list)).catch(() => {})
      return list
    } catch (e) {
      problems.push(errText(e))
    }
  }
  // Offline: fall back to an old cache if there is one.
  try {
    const cached = JSON.parse(await readFile(cache, 'utf8'))
    if (Array.isArray(cached) && cached.length) return cached
  } catch { /* none */ }
  throw new Error(problems.join(' | '))
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

interface FaceUrl { weight: number; italic: boolean; url: string }

/** TrueType file URLs from Google's CSS API (an unknown user agent gets .ttf files). */
async function googleFaces(family: string, chosen: Array<{ weight: number; italic: boolean }>): Promise<FaceUrl[]> {
  const axis = chosen.some((c) => c.italic)
    ? `ital,wght@${chosen.map((c) => `${c.italic ? 1 : 0},${c.weight}`).sort().join(';')}`
    : `wght@${chosen.map((c) => c.weight).sort((a, b) => a - b).join(';')}`
  const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, '+')}:${axis}`
  const css = await (await httpGet(url, { 'User-Agent': 'curl/8.5.0' })).text()
  const faces = [...css.matchAll(/@font-face\s*{([^}]*)}/g)].map((m) => {
    const body = m[1]
    return {
      italic: /font-style:\s*italic/.test(body),
      weight: parseInt(body.match(/font-weight:\s*(\d+)/)?.[1] ?? '400', 10),
      url: body.match(/src:\s*url\(([^)]+)\)\s*format\(['"]?(truetype|opentype)/)?.[1] ?? ''
    }
  }).filter((f) => f.url)
  if (!faces.length) throw new Error('Google Fonts did not offer TrueType files')
  return faces
}

/** TrueType file URLs from Fontsource (Latin characters). */
async function fontsourceFaces(id: string, chosen: Array<{ weight: number; italic: boolean }>): Promise<FaceUrl[]> {
  const data = (await (await httpGet(FONTSOURCE_FONT + encodeURIComponent(id))).json()) as any
  const subset = data.defSubset ?? 'latin'
  const out: FaceUrl[] = []
  for (const c of chosen) {
    const v = data.variants?.[String(c.weight)]?.[c.italic ? 'italic' : 'normal']
    const url = v?.[subset]?.url?.ttf ?? v?.latin?.url?.ttf ?? (Object.values(v ?? {})[0] as any)?.url?.ttf
    if (url) out.push({ weight: c.weight, italic: c.italic, url })
  }
  if (!out.length) throw new Error('Fontsource has no TrueType files for this font')
  return out
}

export async function installGoogleFont(family: string, variants: string[], id?: string): Promise<GoogleFontFile[]> {
  const chosen = chooseVariants(variants.length ? variants : ['400'])
  const problems: string[] = []
  let faces: FaceUrl[] = []
  for (const source of [() => googleFaces(family, chosen), () => fontsourceFaces(id ?? fontsourceId(family), chosen)]) {
    try {
      faces = await source()
      break
    } catch (e) {
      problems.push(errText(e))
    }
  }
  if (!faces.length) throw new Error(problems.join(' | '))

  const dir = join(fontDir(), safeName(family))
  await mkdir(dir, { recursive: true })
  const files: GoogleFontFile[] = []
  for (const f of faces) {
    try {
      const bytes = new Uint8Array(await (await httpGet(f.url)).arrayBuffer())
      const ext = /\.otf(\?|$)/.test(f.url) ? 'otf' : 'ttf'
      const path = join(dir, `${safeName(family).replace(/ /g, '')}-${f.weight}${f.italic ? 'Italic' : ''}.${ext}`)
      await writeFile(path, bytes)
      files.push({ family, weight: f.weight, italic: f.italic, path, bytes })
    } catch (e) {
      problems.push(errText(e))
    }
  }
  if (!files.length) throw new Error(problems.join(' | ') || 'No font files could be downloaded')
  await writeFile(join(dir, 'family.json'), JSON.stringify({ family, files: files.map(({ bytes: _b, ...rest }) => rest) }))
  if (process.platform === 'linux') execFile('fc-cache', ['-f', join(homedir(), '.local', 'share', 'fonts')], () => {})
  return files
}

/** Fonts previously installed from Google, so they can be loaded right away (and on Windows/macOS at all). */
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

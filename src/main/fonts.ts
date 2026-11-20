import { execFile } from 'node:child_process'
import { readdir, stat } from 'node:fs/promises'
import { join, basename, extname } from 'node:path'
import { homedir } from 'node:os'
import type { SystemFont } from '@shared/api'

const FONT_EXTS = new Set(['.ttf', '.otf', '.ttc'])

function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { maxBuffer: 64 * 1024 * 1024 }, (err, stdout) => {
      if (err) reject(err)
      else resolve(stdout)
    })
  })
}

/** fontconfig weight scale → CSS weight. */
function fcWeightToCss(w: number): number {
  if (w <= 0) return 100
  if (w <= 40) return 200
  if (w <= 50) return 300
  if (w <= 80) return 400
  if (w <= 100) return 500
  if (w <= 180) return 600
  if (w <= 200) return 700
  if (w <= 205) return 800
  return 900
}

export function parseFcList(out: string): SystemFont[] {
  const fonts: SystemFont[] = []
  for (const line of out.split('\n')) {
    if (!line.trim()) continue
    const [family, style, weight, slant, file] = line.split('\t')
    if (!family || !file || !FONT_EXTS.has(extname(file).toLowerCase())) continue
    fonts.push({
      family: family.trim(),
      style: (style || 'Regular').trim(),
      weight: fcWeightToCss(Number(weight) || 80),
      italic: Number(slant) > 0,
      path: file.trim()
    })
  }
  return dedupe(fonts)
}

function dedupe(fonts: SystemFont[]): SystemFont[] {
  const seen = new Set<string>()
  return fonts
    .filter((f) => {
      const key = `${f.family}|${f.style}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => a.family.localeCompare(b.family) || a.weight - b.weight)
}

async function scanDir(dir: string, out: SystemFont[], depth = 0): Promise<void> {
  if (depth > 4) return
  let entries: string[]
  try {
    entries = await readdir(dir)
  } catch {
    return
  }
  for (const name of entries) {
    const full = join(dir, name)
    try {
      const s = await stat(full)
      if (s.isDirectory()) await scanDir(full, out, depth + 1)
      else if (FONT_EXTS.has(extname(name).toLowerCase())) {
        // Without fontconfig we only know the file name; the renderer reads the
        // real family/style names from the font file itself.
        const base = basename(name, extname(name))
        const italic = /italic|oblique/i.test(base)
        const bold = /bold/i.test(base)
        out.push({ family: base.replace(/[-_](regular|bold|italic|bolditalic)$/i, ''), style: base, weight: bold ? 700 : 400, italic, path: full })
      }
    } catch {
      /* unreadable entry */
    }
  }
}

export async function listSystemFonts(): Promise<SystemFont[]> {
  try {
    const out = await run('fc-list', ['--format', '%{family[0]}\t%{style[0]}\t%{weight}\t%{slant}\t%{file}\n'])
    return parseFcList(out)
  } catch {
    // No fontconfig (Windows / macOS): scan the usual folders.
    const dirs =
      process.platform === 'win32'
        ? [join(process.env.WINDIR ?? 'C:\\Windows', 'Fonts'), join(process.env.LOCALAPPDATA ?? '', 'Microsoft', 'Windows', 'Fonts')]
        : ['/Library/Fonts', '/System/Library/Fonts', join(homedir(), 'Library', 'Fonts')]
    const out: SystemFont[] = []
    for (const d of dirs) await scanDir(d, out)
    return dedupe(out)
  }
}

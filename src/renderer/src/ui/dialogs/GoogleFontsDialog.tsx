import { useEffect, useMemo, useState } from 'react'
import { Check, Download, Loader2 } from 'lucide-react'
import type { GoogleFontInfo } from '@shared/api'
import * as cmd from '@core/commands'
import { registerFontFiles, registeredFamilies } from '@core/fontRegistry'
import { platform } from '../../platform'
import { useFontFamilies } from '../fonts'
import { hasText } from '../ribbon/groups'

const CATEGORIES = ['All', 'Sans Serif', 'Serif', 'Display', 'Handwriting', 'Monospace']
const PAGE = 60
const previewed = new Set<string>()

/** Load just enough of a font to draw its preview (Google subsets it to the given text). */
function loadPreview(family: string, sample: string): void {
  const key = `${family}|${sample}`
  if (previewed.has(key)) return
  previewed.add(key)
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, '+')}&text=${encodeURIComponent([...new Set(family + sample)].join(''))}&display=swap`
  document.head.appendChild(link)
}

export function GoogleFontsDialog({ onClose }: { onClose: () => void }) {
  const [all, setAll] = useState<GoogleFontInfo[] | null>(null)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('All')
  const [sample, setSample] = useState('Welcome Back!')
  const [limit, setLimit] = useState(PAGE)
  const [busy, setBusy] = useState<string | null>(null)
  const installedSystem = useFontFamilies()
  const [installed, setInstalled] = useState(() => new Set(registeredFamilies()))

  useEffect(() => {
    platform.listGoogleFonts().then(setAll).catch((e) => setError(
      /desktop app/.test(String(e?.message)) ? e.message : 'Could not reach Google Fonts. Check your internet connection and try again.'
    ))
  }, [])

  const shown = useMemo(() => {
    if (!all) return []
    const q = query.trim().toLowerCase()
    return all.filter((f) => (category === 'All' || f.category.toLowerCase() === category.toLowerCase())
      && (!q || f.family.toLowerCase().includes(q)))
  }, [all, query, category])

  const visible = shown.slice(0, limit)
  useEffect(() => { visible.forEach((f) => loadPreview(f.family, sample)) }, [visible, sample])

  const install = async (f: GoogleFontInfo, use: boolean) => {
    setBusy(f.family)
    setError('')
    try {
      const files = await platform.installGoogleFont(f.family, f.variants)
      await registerFontFiles(files)
      setInstalled(new Set(registeredFamilies()))
      if (use && hasText()) cmd.formatText('Font', { font: f.family })
    } catch (e) {
      setError(`Couldn't install ${f.family}: ${(e as Error).message}`)
    } finally {
      setBusy(null)
    }
  }

  const isInstalled = (family: string) => installed.has(family) || installedSystem.includes(family)

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="dialog gfonts" role="dialog" aria-label="Google Fonts" onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}>
        <div className="dialog-title"><span>Google Fonts</span><button className="dialog-x" onClick={onClose} aria-label="Close">✕</button></div>
        <div className="dialog-body">
          <div className="gf-controls">
            <input className="gf-search" placeholder="Search fonts" value={query} onChange={(e) => { setQuery(e.target.value); setLimit(PAGE) }} autoFocus />
            <select value={category} onChange={(e) => { setCategory(e.target.value); setLimit(PAGE) }}>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
            <input className="gf-sample" value={sample} onChange={(e) => setSample(e.target.value)} placeholder="Preview text" title="Preview text" />
          </div>
          {error && <div className="error">{error}</div>}
          <div className="gf-list">
            {!all && !error && <div className="muted gf-loading"><Loader2 size={16} className="spin" /> Loading the Google Fonts catalogue…</div>}
            {visible.map((f) => (
              <div key={f.family} className="gf-row">
                <div className="gf-name">
                  <div className="gf-sample-text" style={{ fontFamily: `"${f.family}", sans-serif` }}>{sample || f.family}</div>
                  <div className="gf-meta">{f.family} · {f.category} · {f.variants.length} style{f.variants.length > 1 ? 's' : ''}</div>
                </div>
                {isInstalled(f.family) ? (
                  <div className="gf-actions">
                    <span className="gf-installed"><Check size={14} /> Installed</span>
                    {hasText() && <button className="btn" onClick={() => cmd.formatText('Font', { font: f.family })}>Use</button>}
                  </div>
                ) : (
                  <div className="gf-actions">
                    <button className="btn" disabled={!!busy} onClick={() => install(f, false)}>
                      {busy === f.family ? <Loader2 size={13} className="spin" /> : <Download size={13} />} Install
                    </button>
                    {hasText() && <button className="btn primary" disabled={!!busy} onClick={() => install(f, true)}>Install &amp; Use</button>}
                  </div>
                )}
              </div>
            ))}
            {shown.length > limit && <button className="btn gf-more" onClick={() => setLimit(limit + PAGE)}>Show more ({shown.length - limit} left)</button>}
            {all && shown.length === 0 && <div className="muted gf-loading">No fonts match “{query}”.</div>}
          </div>
          <p className="muted gf-note">Fonts are free to use under open licenses. Installed fonts appear in the font list of every app.</p>
        </div>
        <div className="dialog-buttons"><button className="btn" onClick={onClose}>Close</button></div>
      </div>
    </div>
  )
}

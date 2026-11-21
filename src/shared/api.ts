// The bridge between the editor (renderer) and the desktop shell (main process).
// In Electron it is provided by the preload script; in the browser test mode a
// fallback implementation is used (see renderer/src/platform.ts).

export interface OpenedFile {
  path: string | null
  name: string
  bytes: Uint8Array
}

export interface PickedImage {
  name: string
  mime: string
  bytes: Uint8Array
}

export interface SystemFont {
  family: string
  style: string
  weight: number
  italic: boolean
  path: string
}

export interface GoogleFontInfo {
  family: string
  /** Fontsource id, used by the backup download source. */
  id?: string
  category: string
  popularity: number
  /** e.g. "400", "700", "400i" */
  variants: string[]
}

export interface GoogleFontFile {
  family: string
  weight: number
  italic: boolean
  path: string
  bytes: Uint8Array
}

export interface TemplateInfo {
  id: string
  name: string
  category: string
  description: string
  builtIn: boolean
  path: string
  thumbnail?: string // data URL
}

export interface RecentFile {
  path: string
  name: string
  /** Folder the file is in (for display). */
  folder: string
  /** When it was last opened or saved (ISO time). */
  opened: string
  /** First-page preview (data URL), if the file has one. */
  thumbnail?: string
}

export interface ReflectAPI {
  platform: string
  /** Show an Open dialog for .rdx/.rdt files. */
  openDocument(): Promise<OpenedFile | null>
  /** Save bytes. If path is null a Save As dialog is shown. Returns the saved path. */
  saveDocument(bytes: Uint8Array, path: string | null, suggestedName: string, kind?: 'rdx' | 'rdt'): Promise<string | null>
  /** Recently opened or saved files, newest first (missing files are left out). */
  listRecent(): Promise<RecentFile[]>
  /** Open a file from the recent list. Returns null (and drops it from the list) if it no longer exists. */
  openRecent(path: string): Promise<OpenedFile | null>
  /** Remove one file from the recent list, or clear the list when path is null. */
  removeRecent(path: string | null): Promise<void>
  /** Pick one or more image files. */
  pickImages(): Promise<PickedImage[]>
  /** Save an exported file (PDF/PNG/JPEG) with a Save dialog. */
  saveExport(bytes: Uint8Array, suggestedName: string, filterName: string, ext: string): Promise<string | null>
  /**
   * Turn print-ready HTML (sheets of SVG) into a PDF and save it. The page size
   * comes from the HTML's @page rule. Returns the saved path, or null if cancelled.
   */
  exportPdf(html: string, suggestedName: string): Promise<string | null>
  /** Open the system print dialog for print-ready HTML. Paper size in points. */
  printHtml(html: string, paperWidth: number, paperHeight: number): Promise<boolean>
  /** Installed fonts. */
  listFonts(): Promise<SystemFont[]>
  readFontFile(path: string): Promise<Uint8Array>
  /** Google Fonts catalogue (needs internet the first time). */
  listGoogleFonts(): Promise<GoogleFontInfo[]>
  /** Download and install a Google font for this user. */
  installGoogleFont(family: string, variants: string[], id?: string): Promise<GoogleFontFile[]>
  /** Fonts previously installed from Google. */
  installedGoogleFonts(): Promise<GoogleFontFile[]>
  /** Templates (built-in + personal). */
  listTemplates(): Promise<TemplateInfo[]>
  readTemplate(path: string): Promise<Uint8Array>
  saveTemplate(bytes: Uint8Array, name: string): Promise<string | null>
  /** Ask Save / Don't Save / Cancel before replacing a publication with unsaved changes. */
  askUnsaved(name: string): Promise<'save' | 'discard' | 'cancel'>
  /** Ask whether to close with unsaved changes. */
  setDirty(dirty: boolean): void
  setTitle(title: string): void
  /** Commands sent from the shell (e.g. 'save-and-close', 'open-path'). */
  onAppCommand(cb: (cmd: string, arg?: unknown) => void): void
  /** Close the window without asking again (after a save). */
  forceClose(): void
}

declare global {
  interface Window {
    reflect?: ReflectAPI
  }
}

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

export interface TemplateInfo {
  id: string
  name: string
  category: string
  description: string
  builtIn: boolean
  path: string
  thumbnail?: string // data URL
}

export interface ReflectAPI {
  platform: string
  /** Show an Open dialog for .rdx/.rdt files. */
  openDocument(): Promise<OpenedFile | null>
  /** Save bytes. If path is null a Save As dialog is shown. Returns the saved path. */
  saveDocument(bytes: Uint8Array, path: string | null, suggestedName: string, kind?: 'rdx' | 'rdt'): Promise<string | null>
  /** Pick one or more image files. */
  pickImages(): Promise<PickedImage[]>
  /** Save an exported file (PDF/PNG/JPEG) with a Save dialog. */
  saveExport(bytes: Uint8Array, suggestedName: string, filterName: string, ext: string): Promise<string | null>
  /** Installed fonts. */
  listFonts(): Promise<SystemFont[]>
  readFontFile(path: string): Promise<Uint8Array>
  /** Templates (built-in + personal). */
  listTemplates(): Promise<TemplateInfo[]>
  readTemplate(path: string): Promise<Uint8Array>
  saveTemplate(bytes: Uint8Array, name: string): Promise<string | null>
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

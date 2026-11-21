import { contextBridge, ipcRenderer } from 'electron'
import type { ReflectAPI } from '../shared/api'

const api: ReflectAPI = {
  platform: process.platform,
  openDocument: () => ipcRenderer.invoke('open-document'),
  saveDocument: (bytes, path, suggestedName, kind) => ipcRenderer.invoke('save-document', bytes, path, suggestedName, kind),
  listRecent: () => ipcRenderer.invoke('recent-list'),
  openRecent: (path) => ipcRenderer.invoke('recent-open', path),
  removeRecent: (path) => ipcRenderer.invoke('recent-remove', path),
  pickImages: () => ipcRenderer.invoke('pick-images'),
  saveExport: (bytes, suggestedName, filterName, ext) => ipcRenderer.invoke('save-export', bytes, suggestedName, filterName, ext),
  exportPdf: (html, suggestedName) => ipcRenderer.invoke('export-pdf', html, suggestedName),
  printHtml: (html, w, h) => ipcRenderer.invoke('print-html', html, w, h),
  listFonts: () => ipcRenderer.invoke('list-fonts'),
  readFontFile: (path) => ipcRenderer.invoke('read-font-file', path),
  listGoogleFonts: () => ipcRenderer.invoke('gfonts-list'),
  installGoogleFont: (family, variants, id) => ipcRenderer.invoke('gfonts-install', family, variants, id),
  installedGoogleFonts: () => ipcRenderer.invoke('gfonts-installed'),
  listTemplates: () => ipcRenderer.invoke('list-templates'),
  readTemplate: (path) => ipcRenderer.invoke('read-template', path),
  saveTemplate: (bytes, name) => ipcRenderer.invoke('save-template', bytes, name),
  askUnsaved: (name) => ipcRenderer.invoke('ask-unsaved', name),
  setDirty: (dirty) => ipcRenderer.send('set-dirty', dirty),
  setTitle: (title) => ipcRenderer.send('set-title', title),
  onAppCommand: (cb) => {
    ipcRenderer.on('app-command', (_e, cmd: string, arg?: unknown) => cb(cmd, arg))
  },
  forceClose: () => ipcRenderer.send('force-close')
}

contextBridge.exposeInMainWorld('reflect', api)

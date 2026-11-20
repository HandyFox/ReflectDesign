import { contextBridge, ipcRenderer } from 'electron'
import type { ReflectAPI } from '../shared/api'

const api: ReflectAPI = {
  platform: process.platform,
  openDocument: () => ipcRenderer.invoke('open-document'),
  saveDocument: (bytes, path, suggestedName, kind) => ipcRenderer.invoke('save-document', bytes, path, suggestedName, kind),
  pickImages: () => ipcRenderer.invoke('pick-images'),
  saveExport: (bytes, suggestedName, filterName, ext) => ipcRenderer.invoke('save-export', bytes, suggestedName, filterName, ext),
  listFonts: () => ipcRenderer.invoke('list-fonts'),
  readFontFile: (path) => ipcRenderer.invoke('read-font-file', path),
  listTemplates: () => ipcRenderer.invoke('list-templates'),
  readTemplate: (path) => ipcRenderer.invoke('read-template', path),
  saveTemplate: (bytes, name) => ipcRenderer.invoke('save-template', bytes, name),
  setDirty: (dirty) => ipcRenderer.send('set-dirty', dirty),
  setTitle: (title) => ipcRenderer.send('set-title', title),
  onAppCommand: (cb) => {
    ipcRenderer.on('app-command', (_e, cmd: string, arg?: unknown) => cb(cmd, arg))
  },
  forceClose: () => ipcRenderer.send('force-close')
}

contextBridge.exposeInMainWorld('reflect', api)

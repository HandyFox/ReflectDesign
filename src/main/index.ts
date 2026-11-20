import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron'
import { join, basename } from 'node:path'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { listSystemFonts } from './fonts'
import { listTemplates, personalTemplateDir } from './templates'

let mainWindow: BrowserWindow | null = null
let dirty = false
let pendingOpenPath: string | null = null

const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg']

function mimeFor(ext: string): string {
  switch (ext.toLowerCase()) {
    case 'png': return 'image/png'
    case 'jpg':
    case 'jpeg': return 'image/jpeg'
    case 'gif': return 'image/gif'
    case 'webp': return 'image/webp'
    case 'bmp': return 'image/bmp'
    case 'svg': return 'image/svg+xml'
    default: return 'application/octet-stream'
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'ReflectDesign',
    backgroundColor: '#f3f3f3',
    autoHideMenuBar: true,
    icon: join(app.getAppPath(), 'resources', 'icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  // The ribbon replaces the classic menu bar, like Publisher.
  Menu.setApplicationMenu(null)

  mainWindow.on('close', (e) => {
    if (!dirty || !mainWindow) return
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: 'warning',
      buttons: ['Save', "Don't Save", 'Cancel'],
      defaultId: 0,
      cancelId: 2,
      title: 'ReflectDesign',
      message: 'Do you want to save the changes you made to this publication?'
    })
    if (choice === 1) return
    e.preventDefault()
    if (choice === 0) mainWindow.webContents.send('app-command', 'save-and-close')
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('did-finish-load', () => {
    if (pendingOpenPath) {
      sendOpenPath(pendingOpenPath)
      pendingOpenPath = null
    }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

async function sendOpenPath(path: string): Promise<void> {
  if (!mainWindow) return
  const bytes = await readFile(path)
  mainWindow.webContents.send('app-command', 'open-file', {
    path,
    name: basename(path),
    bytes: new Uint8Array(bytes)
  })
}

function registerIpc(): void {
  ipcMain.handle('open-document', async () => {
    if (!mainWindow) return null
    const res = await dialog.showOpenDialog(mainWindow, {
      title: 'Open Publication',
      properties: ['openFile'],
      filters: [
        { name: 'ReflectDesign Files', extensions: ['rdx', 'rdt'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })
    if (res.canceled || res.filePaths.length === 0) return null
    const path = res.filePaths[0]
    const bytes = await readFile(path)
    app.addRecentDocument(path)
    return { path, name: basename(path), bytes: new Uint8Array(bytes) }
  })

  ipcMain.handle('save-document', async (_e, bytes: Uint8Array, path: string | null, suggestedName: string, kind: 'rdx' | 'rdt' = 'rdx') => {
    if (!mainWindow) return null
    let target = path
    if (!target) {
      const res = await dialog.showSaveDialog(mainWindow, {
        title: kind === 'rdt' ? 'Save as Template' : 'Save As',
        defaultPath: suggestedName,
        filters: kind === 'rdt'
          ? [{ name: 'ReflectDesign Template', extensions: ['rdt'] }]
          : [{ name: 'ReflectDesign Publication', extensions: ['rdx'] }]
      })
      if (res.canceled || !res.filePath) return null
      target = res.filePath
    }
    await writeFile(target, Buffer.from(bytes))
    app.addRecentDocument(target)
    return target
  })

  ipcMain.handle('pick-images', async () => {
    if (!mainWindow) return []
    const res = await dialog.showOpenDialog(mainWindow, {
      title: 'Insert Picture',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Pictures', extensions: IMAGE_EXTS }]
    })
    if (res.canceled) return []
    return Promise.all(
      res.filePaths.map(async (p) => {
        const ext = p.split('.').pop() ?? ''
        return { name: basename(p), mime: mimeFor(ext), bytes: new Uint8Array(await readFile(p)) }
      })
    )
  })

  ipcMain.handle('save-export', async (_e, bytes: Uint8Array, suggestedName: string, filterName: string, ext: string) => {
    if (!mainWindow) return null
    const res = await dialog.showSaveDialog(mainWindow, {
      title: 'Export',
      defaultPath: suggestedName,
      filters: [{ name: filterName, extensions: [ext] }]
    })
    if (res.canceled || !res.filePath) return null
    await writeFile(res.filePath, Buffer.from(bytes))
    return res.filePath
  })

  ipcMain.handle('list-fonts', () => listSystemFonts())
  ipcMain.handle('read-font-file', async (_e, path: string) => new Uint8Array(await readFile(path)))

  ipcMain.handle('list-templates', () => listTemplates())
  ipcMain.handle('read-template', async (_e, path: string) => new Uint8Array(await readFile(path)))
  ipcMain.handle('save-template', async (_e, bytes: Uint8Array, name: string) => {
    const dir = personalTemplateDir()
    await mkdir(dir, { recursive: true })
    const safe = name.replace(/[^\w\- ]+/g, '').trim() || 'Template'
    const target = join(dir, `${safe}.rdt`)
    await writeFile(target, Buffer.from(bytes))
    return target
  })

  ipcMain.on('set-dirty', (_e, value: boolean) => { dirty = value })
  ipcMain.on('set-title', (_e, title: string) => { mainWindow?.setTitle(title) })
  ipcMain.on('force-close', () => {
    dirty = false
    mainWindow?.close()
  })
}

// A file passed on the command line (double-clicked in the file manager).
const argPath = process.argv.slice(1).find((a) => /\.(rdx|rdt)$/i.test(a))
if (argPath) pendingOpenPath = argPath

app.whenReady().then(() => {
  registerIpc()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('open-file', (e, path) => {
  e.preventDefault()
  if (mainWindow) sendOpenPath(path)
  else pendingOpenPath = path
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

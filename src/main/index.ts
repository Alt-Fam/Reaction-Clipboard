import electron from 'electron'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { ClipboardAdapter } from './clipboard.js'
import { registerIpc } from './ipc.js'
import { configureAppPaths } from './paths.js'
import { Repository } from './repository.js'
import { lockDownSession, lockDownWindow } from './security.js'
import { StorageService } from './storage.js'
import { WebMediaDropService } from './web-media.js'

const { app, BrowserWindow, net, protocol } = electron

// The offline app stores no browser credentials, so avoid Chromium's macOS Keychain prompt.
if (process.platform === 'darwin') app.commandLine.appendSwitch('use-mock-keychain')

protocol.registerSchemesAsPrivileged([
  { scheme: 'reaction-media', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }
])

const paths = configureAppPaths()
const storage = new StorageService(paths.media)
let repository: Repository

app.whenReady().then(() => {
  repository = new Repository(paths.database, storage)
  registerIpc(repository, storage, new WebMediaDropService(storage), new ClipboardAdapter(repository), paths)
  lockDownSession()
  protocol.handle('reaction-media', async (request) => {
    const url = new URL(request.url)
    const id = url.hostname === 'item' ? url.pathname.slice(1) : ''
    const response = await net.fetch(pathToFileURL(repository.getManagedMediaPath(id)).toString())
    const headers = new Headers(response.headers)
    headers.set('Access-Control-Allow-Origin', '*')
    return new Response(response.body, { status: response.status, headers })
  })
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => app.quit())
app.on('before-quit', () => repository?.close())

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 720,
    minHeight: 520,
    title: 'Reaction Clipboard',
    icon: app.isPackaged ? path.join(process.resourcesPath, 'icon.ico') : path.join(__dirname, '../../build/icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  })
  lockDownWindow(window)
  if (process.env.ELECTRON_RENDERER_URL) window.loadURL(process.env.ELECTRON_RENDERER_URL)
  else window.loadFile(path.join(__dirname, '../renderer/index.html'))
}

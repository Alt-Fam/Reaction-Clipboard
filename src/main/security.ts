import type { BrowserWindow } from 'electron'
import electron from 'electron'

const { session } = electron

export function lockDownSession(): void {
  const current = session.defaultSession
  current.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  current.setPermissionCheckHandler(() => false)
  current.setSpellCheckerEnabled(false)
  current.webRequest.onBeforeRequest((details, callback) => {
    try {
      const url = new URL(details.url)
      const remote = ['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol)
      const allowedDevAsset = !import.meta.env.PROD && ['127.0.0.1', 'localhost'].includes(url.hostname)
      callback({ cancel: remote && !allowedDevAsset })
    } catch {
      callback({ cancel: true })
    }
  })
}

export function lockDownWindow(window: BrowserWindow): void {
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event, url) => {
    if (url !== window.webContents.getURL()) event.preventDefault()
  })
}

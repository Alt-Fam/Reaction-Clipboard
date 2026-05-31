import electron from 'electron'
import type { ImportMediaInput } from '../shared/types.js'
import { idSchema, copyItemSchema, createTextSchema, importMediaSchema, renameTagSchema, updateItemSchema } from '../shared/validation.js'
import { ClipboardAdapter } from './clipboard.js'
import type { AppPaths } from './paths.js'
import { Repository } from './repository.js'
import { StorageService } from './storage.js'
import { WebMediaDropService } from './web-media.js'

const { dialog, ipcMain, shell } = electron

export function registerIpc(repository: Repository, storage: StorageService, webMedia: WebMediaDropService, clipboard: ClipboardAdapter, paths: AppPaths): void {
  ipcMain.handle('items:list', () => repository.listItems())
  ipcMain.handle('tags:list', () => repository.listTags())
  ipcMain.handle('media:choose', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Reaction media', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }]
    })
    return result.canceled ? null : storage.inspect(result.filePaths[0])
  })
  ipcMain.handle('media:inspect', (_event, sourcePath: unknown) => storage.inspect(parsePath(sourcePath)))
  ipcMain.handle('media:inspect-dropped', (_event, input: unknown) => {
    const parsed = parseDroppedInspection(input)
    return storage.inspectDropped(parsed.token, parsed.fileName, parsed.sizeBytes, parsed.header)
  })
  ipcMain.handle('media:inspect-web', (_event, url: unknown) => webMedia.inspect(parseUrl(url)))
  ipcMain.handle('items:create-text', (_event, input: unknown) => repository.createText(createTextSchema.parse(input)))
  ipcMain.handle('items:import-media', (_event, input: unknown) => repository.importMedia(importMediaSchema.parse(input)))
  ipcMain.handle('items:import-dropped-media', (_event, input: unknown) => {
    const parsed = parseDroppedImport(input)
    return repository.importDroppedMedia(importMediaSchema.parse(parsed), parsed.fileName, parsed.bytes)
  })
  ipcMain.handle('items:import-web-media', (_event, input: unknown) => {
    const parsed = importMediaSchema.parse(input)
    const media = webMedia.take(parsed)
    return repository.importDroppedMedia(parsed, media.fileName, media.bytes)
  })
  ipcMain.handle('items:update', (_event, input: unknown) => repository.updateItem(updateItemSchema.parse(input)))
  ipcMain.handle('items:delete', (_event, id: unknown) => repository.deleteItem(idSchema.parse(id)))
  ipcMain.handle('tags:rename', (_event, input: unknown) => {
    const parsed = renameTagSchema.parse(input)
    repository.renameTag(parsed.id, parsed.name)
  })
  ipcMain.handle('tags:delete', (_event, id: unknown) => repository.deleteTag(idSchema.parse(id)))
  ipcMain.handle('clipboard:copy', (_event, input: unknown) => clipboard.copy(copyItemSchema.parse(input)))
  ipcMain.handle('settings:open-data-folder', async () => {
    const error = await shell.openPath(paths.root)
    if (error) throw new Error(error)
  })
}

function parsePath(value: unknown): string {
  if (typeof value !== 'string' || !value) throw new Error('A selected file path is required.')
  return value
}

function parseUrl(value: unknown): string {
  if (typeof value !== 'string' || !value) throw new Error('A dropped image URL is required.')
  return value
}

function parseDroppedInspection(value: unknown): { token: string; fileName: string; sizeBytes: number; header: Uint8Array } {
  if (!isRecord(value) || typeof value.token !== 'string' || typeof value.fileName !== 'string' || typeof value.sizeBytes !== 'number' || !(value.header instanceof Uint8Array)) {
    throw new Error('Invalid dropped file metadata.')
  }
  return { token: value.token, fileName: value.fileName, sizeBytes: value.sizeBytes, header: value.header }
}

function parseDroppedImport(value: unknown): ImportMediaInput & { fileName: string; bytes: Uint8Array } {
  if (!isRecord(value) || typeof value.fileName !== 'string' || !(value.bytes instanceof Uint8Array)) {
    throw new Error('Invalid dropped file contents.')
  }
  return { ...value, fileName: value.fileName, bytes: value.bytes } as ImportMediaInput & { fileName: string; bytes: Uint8Array }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

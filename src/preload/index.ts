import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { ReactionClipboardApi } from '../shared/types.js'

const droppedFiles = new Map<string, File>()
const droppedWebUrls = new Set<string>()

const api: ReactionClipboardApi = {
  listItems: () => ipcRenderer.invoke('items:list'),
  listTags: () => ipcRenderer.invoke('tags:list'),
  chooseMediaFile: () => ipcRenderer.invoke('media:choose'),
  inspectDroppedFile: async (file) => {
    const sourcePath = webUtils.getPathForFile(file)
    if (sourcePath) return ipcRenderer.invoke('media:inspect', sourcePath)
    const token = crypto.randomUUID()
    droppedFiles.set(token, file)
    return ipcRenderer.invoke('media:inspect-dropped', {
      token,
      fileName: file.name,
      sizeBytes: file.size,
      header: new Uint8Array(await file.slice(0, 16).arrayBuffer())
    })
  },
  inspectDroppedUrl: async (url) => {
    const selected = await ipcRenderer.invoke('media:inspect-web', url)
    droppedWebUrls.add(selected.sourcePath)
    return selected
  },
  createText: (input) => ipcRenderer.invoke('items:create-text', input),
  importMedia: async (input) => {
    if (droppedWebUrls.delete(input.sourcePath)) return ipcRenderer.invoke('items:import-web-media', input)
    const file = droppedFiles.get(input.sourcePath)
    if (!file) return ipcRenderer.invoke('items:import-media', input)
    droppedFiles.delete(input.sourcePath)
    return ipcRenderer.invoke('items:import-dropped-media', {
      ...input,
      fileName: file.name,
      bytes: new Uint8Array(await file.arrayBuffer())
    })
  },
  updateItem: (input) => ipcRenderer.invoke('items:update', input),
  deleteItem: (id) => ipcRenderer.invoke('items:delete', id),
  renameTag: (id, name) => ipcRenderer.invoke('tags:rename', { id, name }),
  deleteTag: (id) => ipcRenderer.invoke('tags:delete', id),
  copyItem: (input) => ipcRenderer.invoke('clipboard:copy', input),
  openDataFolder: () => ipcRenderer.invoke('settings:open-data-folder')
}

contextBridge.exposeInMainWorld('reactionClipboard', api)

import { randomUUID } from 'node:crypto'
import { copyFile, mkdir, open, rename, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { detectMediaFormat, LARGE_FILE_BYTES, mimeTypeFor } from '../shared/media.js'
import type { MediaSelection } from '../shared/types.js'
import { isPathInside } from './path-containment.js'

export interface ManagedMedia {
  relativePath: string
  absolutePath: string
  mimeType: string
  sizeBytes: number
  type: 'image' | 'gif'
}

export class StorageService {
  constructor(private readonly mediaRoot: string) {}

  async inspect(sourcePath: string): Promise<MediaSelection> {
    const details = await stat(sourcePath)
    if (!details.isFile()) throw new Error('The selected path is not a readable file.')
    const handle = await open(sourcePath, 'r')
    try {
      const header = Buffer.alloc(16)
      await handle.read(header, 0, header.length, 0)
      const format = detectMediaFormat(sourcePath, header)
      return {
        sourcePath,
        fileName: path.basename(sourcePath),
        mimeType: mimeTypeFor(format),
        sizeBytes: details.size,
        type: format === 'gif' ? 'gif' : 'image',
        requiresLargeFileConfirmation: details.size > LARGE_FILE_BYTES
      }
    } finally {
      await handle.close()
    }
  }

  inspectDropped(token: string, fileName: string, sizeBytes: number, header: Uint8Array): MediaSelection {
    const format = detectMediaFormat(fileName, header)
    return {
      sourcePath: token,
      fileName,
      mimeType: mimeTypeFor(format),
      sizeBytes,
      type: format === 'gif' ? 'gif' : 'image',
      requiresLargeFileConfirmation: sizeBytes > LARGE_FILE_BYTES
    }
  }

  async import(sourcePath: string, allowLargeFile: boolean): Promise<ManagedMedia> {
    const selected = await this.inspect(sourcePath)
    if (selected.requiresLargeFileConfirmation && !allowLargeFile) {
      throw new Error('This file is larger than 100 MB. Confirm the import to continue.')
    }
    await mkdir(this.mediaRoot, { recursive: true })
    const extension = path.extname(sourcePath).toLocaleLowerCase()
    const relativePath = `${randomUUID()}${extension}`
    const absolutePath = this.resolve(relativePath)
    const temporaryPath = `${absolutePath}.tmp`
    try {
      await copyFile(sourcePath, temporaryPath)
      await rename(temporaryPath, absolutePath)
    } catch (error) {
      await rm(temporaryPath, { force: true })
      throw new Error(`Could not create the managed media copy: ${message(error)}`)
    }
    return { relativePath, absolutePath, mimeType: selected.mimeType, sizeBytes: selected.sizeBytes, type: selected.type }
  }

  async importDropped(fileName: string, bytes: Uint8Array, allowLargeFile: boolean): Promise<ManagedMedia> {
    const selected = this.inspectDropped('dropped-file', fileName, bytes.byteLength, bytes.subarray(0, 16))
    if (selected.requiresLargeFileConfirmation && !allowLargeFile) {
      throw new Error('This file is larger than 100 MB. Confirm the import to continue.')
    }
    await mkdir(this.mediaRoot, { recursive: true })
    const extension = path.extname(fileName).toLocaleLowerCase()
    const relativePath = `${randomUUID()}${extension}`
    const absolutePath = this.resolve(relativePath)
    const temporaryPath = `${absolutePath}.tmp`
    try {
      await open(temporaryPath, 'wx').then(async (handle) => {
        try { await handle.writeFile(bytes) } finally { await handle.close() }
      })
      await rename(temporaryPath, absolutePath)
    } catch (error) {
      await rm(temporaryPath, { force: true })
      throw new Error(`Could not create the managed media copy: ${message(error)}`)
    }
    return { relativePath, absolutePath, mimeType: selected.mimeType, sizeBytes: selected.sizeBytes, type: selected.type }
  }

  async remove(relativePath: string): Promise<void> {
    await rm(this.resolve(relativePath), { force: true })
  }

  resolve(relativePath: string): string {
    const candidate = path.resolve(this.mediaRoot, relativePath)
    if (!isPathInside(this.mediaRoot, candidate)) throw new Error('Invalid managed media path.')
    return candidate
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

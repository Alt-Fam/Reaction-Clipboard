import electron from 'electron'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { detectMediaSignature, LARGE_FILE_BYTES, preferredExtensionFor } from '../shared/media.js'
import type { ImportMediaInput, MediaSelection } from '../shared/types.js'
import { StorageService } from './storage.js'

const { app, session } = electron
const MAX_REDIRECTS = 5

interface PendingWebMedia {
  fileName: string
  bytes: Uint8Array
}

export class WebMediaDropService {
  private readonly downloads = session.fromPartition('reaction-web-media', { cache: false })
  private readonly pending = new Map<string, PendingWebMedia>()

  constructor(private readonly storage: StorageService) {}

  async inspect(input: string): Promise<MediaSelection> {
    const url = parseWebUrl(input)
    const bytes = await this.download(url)
    const format = detectMediaSignature(bytes.subarray(0, 16))
    if (!format) throw new Error('The dropped URL did not return a supported image.')
    const fileName = nameFor(url, preferredExtensionFor(format))
    const token = `web:${randomUUID()}`
    this.pending.set(token, { fileName, bytes })
    while (this.pending.size > 4) this.pending.delete(this.pending.keys().next().value!)
    return this.storage.inspectDropped(token, fileName, bytes.byteLength, bytes.subarray(0, 16))
  }

  take(input: ImportMediaInput): PendingWebMedia {
    const media = this.pending.get(input.sourcePath)
    if (!media) throw new Error('The dropped web image is no longer available. Drop it again.')
    this.pending.delete(input.sourcePath)
    return media
  }

  private async download(initialUrl: URL): Promise<Uint8Array> {
    let url = initialUrl
    try {
      for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
        const response = await this.downloads.fetch(url.toString(), { redirect: 'manual' })
        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get('location')
          if (!location || redirects === MAX_REDIRECTS) throw new Error('The dropped image URL redirected too many times.')
          url = parseWebUrl(new URL(location, url).toString())
          continue
        }
        if (!response.ok) throw new Error(`The dropped image URL returned HTTP ${response.status}.`)
        return await readLimitedBody(response)
      }
      throw new Error('The dropped image URL redirected too many times.')
    } finally {
      await this.downloads.closeAllConnections()
    }
  }
}

function parseWebUrl(input: string): URL {
  let url: URL
  try {
    url = new URL(input)
  } catch {
    throw new Error('The dropped image URL is invalid.')
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Only HTTP or HTTPS image URLs can be dropped.')
  }
  if (app.isPackaged && isLocalHostname(url.hostname)) {
    throw new Error('Local network image URLs cannot be dropped.')
  }
  return url
}

async function readLimitedBody(response: Response): Promise<Uint8Array> {
  const declaredSize = Number(response.headers.get('content-length'))
  if (Number.isFinite(declaredSize) && declaredSize > LARGE_FILE_BYTES) throw new Error('Dropped web images must be 100 MB or smaller.')
  if (!response.body) throw new Error('The dropped image URL returned an empty response.')
  const chunks: Uint8Array[] = []
  let size = 0
  for await (const chunk of response.body) {
    size += chunk.byteLength
    if (size > LARGE_FILE_BYTES) throw new Error('Dropped web images must be 100 MB or smaller.')
    chunks.push(chunk)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

function nameFor(url: URL, extension: string): string {
  const baseName = path.posix.basename(decodeURIComponent(url.pathname)).replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 220)
  const stem = baseName.replace(/\.[^.]*$/, '') || 'dropped-image'
  return `${stem}${extension}`
}

function isLocalHostname(hostname: string): boolean {
  const normalized = hostname.toLocaleLowerCase().replace(/^\[(.*)\]$/, '$1')
  return normalized === 'localhost' || normalized.endsWith('.localhost') || normalized.endsWith('.local') ||
    normalized === '::1' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe80:') ||
    /^(0|10|127|169\.254|192\.168)\./.test(normalized) || /^172\.(1[6-9]|2\d|3[01])\./.test(normalized)
}

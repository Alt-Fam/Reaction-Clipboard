export const LARGE_FILE_BYTES = 100 * 1024 * 1024

const formats = {
  png: { mimeType: 'image/png', extensions: ['.png'] },
  jpeg: { mimeType: 'image/jpeg', extensions: ['.jpg', '.jpeg'] },
  webp: { mimeType: 'image/webp', extensions: ['.webp'] },
  gif: { mimeType: 'image/gif', extensions: ['.gif'] }
} as const

export type MediaFormat = keyof typeof formats

export function detectMediaFormat(filePath: string, header: Uint8Array): MediaFormat {
  let format: MediaFormat | undefined
  if (header.length >= 8 && header.slice(0, 8).join(',') === '137,80,78,71,13,10,26,10') format = 'png'
  if (header.length >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) format = 'jpeg'
  if (header.length >= 12 && text(header.slice(0, 4)) === 'RIFF' && text(header.slice(8, 12)) === 'WEBP') format = 'webp'
  if (header.length >= 6 && ['GIF87a', 'GIF89a'].includes(text(header.slice(0, 6)))) format = 'gif'
  const extension = filePath.slice(filePath.lastIndexOf('.')).toLocaleLowerCase()
  if (!format || !formats[format].extensions.includes(extension as never)) {
    throw new Error('Unsupported media file. Choose a PNG, JPG, JPEG, WebP, or GIF file.')
  }
  return format
}

export function mimeTypeFor(format: MediaFormat): string {
  return formats[format].mimeType
}

function text(bytes: Uint8Array): string {
  return String.fromCharCode(...bytes)
}

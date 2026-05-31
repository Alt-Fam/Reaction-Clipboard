import { describe, expect, it } from 'vitest'
import { detectMediaFormat, detectMediaSignature, LARGE_FILE_BYTES, preferredExtensionFor } from '../src/shared/media.js'
import { isPathInside } from '../src/main/path-containment.js'

describe('media validation', () => {
  it('recognizes supported signatures paired with extensions', () => {
    expect(detectMediaFormat('a.png', Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]))).toBe('png')
    expect(detectMediaFormat('a.gif', Uint8Array.from(Buffer.from('GIF89a')))).toBe('gif')
  })
  it('rejects extension spoofing', () => expect(() => detectMediaFormat('a.png', Uint8Array.from(Buffer.from('GIF89a')))).toThrow(/Unsupported/))
  it('detects a signature without a file extension', () => expect(preferredExtensionFor(detectMediaSignature(Uint8Array.from(Buffer.from('GIF89a')))!)).toBe('.gif'))
  it('defines the warning boundary above 100 MB', () => expect(LARGE_FILE_BYTES).toBe(104_857_600))
})

describe('managed path containment', () => {
  it('accepts children and rejects escape attempts', () => {
    expect(isPathInside('C:/data/media', 'C:/data/media/item.png')).toBe(true)
    expect(isPathInside('C:/data/media', 'C:/data/escape.png')).toBe(false)
  })
})

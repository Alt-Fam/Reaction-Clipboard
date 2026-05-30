import { clipboard, nativeImage } from 'electron'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import type { ClipboardResult, CopyItemInput } from '../shared/types.js'
import { Repository } from './repository.js'

export class ClipboardAdapter {
  constructor(private readonly repository: Repository) {}

  copy(input: CopyItemInput): ClipboardResult {
    const item = this.repository.getItem(input.id)
    if (item.type === 'text') {
      clipboard.writeText(item.text || '')
      return { message: `Copied: ${item.name}` }
    }
    const mediaPath = this.repository.getManagedMediaPath(input.id)
    if (item.type === 'gif' && process.platform === 'win32' && writeWindowsFileReference(mediaPath)) {
      return { message: `Copied: ${item.name}` }
    }
    let image = nativeImage.createFromPath(mediaPath)
    if (image.isEmpty() && input.fallbackPngDataUrl) image = nativeImage.createFromDataURL(input.fallbackPngDataUrl)
    if (image.isEmpty()) throw new Error('The stored image could not be copied.')
    clipboard.writeImage(image)
    return { message: item.type === 'gif' ? `Copied still image: ${item.name}` : `Copied: ${item.name}` }
  }
}

function writeWindowsFileReference(filePath: string): boolean {
  try {
    const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    const script = [
      'Add-Type -AssemblyName System.Windows.Forms',
      '$files = New-Object System.Collections.Specialized.StringCollection',
      '[void]$files.Add($env:REACTION_CLIPBOARD_FILE_PATH)',
      '[System.Windows.Forms.Clipboard]::SetFileDropList($files)'
    ].join('; ')
    execFileSync(powershell, ['-NoProfile', '-NonInteractive', '-STA', '-Command', script], {
      env: { ...process.env, REACTION_CLIPBOARD_FILE_PATH: filePath },
      stdio: 'ignore',
      windowsHide: true
    })
    return true
  } catch {
    return false
  }
}

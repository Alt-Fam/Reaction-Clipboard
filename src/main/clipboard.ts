import electron from 'electron'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import type { ClipboardResult, CopyItemInput } from '../shared/types.js'
import { Repository } from './repository.js'

const { clipboard, nativeImage } = electron

export class ClipboardAdapter {
  constructor(private readonly repository: Repository) {}

  copy(input: CopyItemInput): ClipboardResult {
    const item = this.repository.getItem(input.id)
    if (item.type === 'text') {
      clipboard.writeText(item.text || '')
      return { message: `Copied: ${item.name}` }
    }
    const mediaPath = this.repository.getManagedMediaPath(input.id)
    if (item.type === 'gif' && writeGifFileReference(mediaPath)) {
      return { message: `Copied: ${item.name}` }
    }
    let image = nativeImage.createFromPath(mediaPath)
    if (image.isEmpty() && input.fallbackPngDataUrl) image = nativeImage.createFromDataURL(input.fallbackPngDataUrl)
    if (image.isEmpty()) throw new Error('The stored image could not be copied.')
    clipboard.writeImage(image)
    return { message: item.type === 'gif' ? `Copied still image: ${item.name}` : `Copied: ${item.name}` }
  }
}

function writeGifFileReference(filePath: string): boolean {
  if (process.platform === 'win32') return writeWindowsFileReference(filePath)
  if (process.platform === 'darwin') return writeMacFileReference(filePath)
  return false
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

function writeMacFileReference(filePath: string): boolean {
  try {
    const script = [
      'ObjC.import("AppKit")',
      'function run(argv) {',
      '  const pasteboard = $.NSPasteboard.generalPasteboard',
      '  pasteboard.clearContents',
      '  const url = $.NSURL.fileURLWithPath($(argv[0]))',
      '  if (!pasteboard.writeObjects($([url]))) throw new Error("Could not write file URL")',
      '}'
    ].join('\n')
    execFileSync('/usr/bin/osascript', ['-l', 'JavaScript', '-e', script, '--', filePath], {
      stdio: 'ignore'
    })
    return true
  } catch {
    return false
  }
}

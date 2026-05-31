import { _electron as electron, expect, test } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import os from 'node:os'
import path from 'node:path'

test('supports the text workflow and blocks remote fetches', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'reaction-clipboard-e2e-'))
  const { ELECTRON_RUN_AS_NODE: _electronRunAsNode, ...env } = process.env
  const app = await electron.launch({ args: ['.'], env: { ...env, REACTION_CLIPBOARD_DATA_DIR: root } })
  try {
    const page = await app.firstWindow()
    await expect(page.getByRole('heading', { name: 'Reaction Clipboard' })).toBeVisible()
    await expect.poll(() => page.evaluate(() => typeof window.reactionClipboard)).toBe('object')
    await expect(page.getByText('Your reaction library is empty')).toBeVisible()
    expect(await page.evaluate(async () => fetch('https://example.com').then(() => 'allowed').catch(() => 'blocked'))).toBe('blocked')
    await page.getByRole('button', { name: 'Add Item' }).click()
    await page.getByLabel('Name').fill('Victory')
    await page.getByLabel('Text').fill('we did it')
    await page.getByPlaceholder('New tag').fill('celebration')
    await page.getByRole('button', { name: 'Add tag' }).click()
    await page.getByRole('button', { name: 'Save' }).click()
    await page.getByText('Victory').click()
    await expect(page.getByText('Copied: Victory')).toBeVisible()
    await page.getByRole('button', { name: 'Edit Victory' }).click()
    await page.getByLabel('Name').fill('Big victory')
    await page.getByRole('button', { name: 'Save' }).click()
    await page.getByRole('button', { name: 'Manage tags' }).click()
    await page.getByRole('button', { name: 'Rename' }).click()
    await page.getByLabel('Rename celebration').fill('winner')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('button', { name: 'winner' })).toBeVisible()
    await page.getByRole('button', { name: 'Close' }).click()
    await page.reload()
    await expect(page.getByText('Big victory')).toBeVisible()
    await page.getByRole('button', { name: 'Delete Big victory' }).click()
    await page.getByRole('button', { name: 'Confirm delete' }).click()
    await expect(page.getByText('Your reaction library is empty')).toBeVisible()
  } finally {
    await app.close()
    rmSync(root, { recursive: true, force: true })
  }
})

test('imports media dropped into the add-item form', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'reaction-clipboard-e2e-'))
  const sourcePath = path.join(root, 'dropped.png')
  writeFileSync(sourcePath, Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]))
  const { ELECTRON_RUN_AS_NODE: _electronRunAsNode, ...env } = process.env
  const app = await electron.launch({ args: ['.'], env: { ...env, REACTION_CLIPBOARD_DATA_DIR: root } })
  try {
    const page = await app.firstWindow()
    await page.evaluate(() => {
      const input = document.createElement('input')
      input.id = 'native-drop-input'
      input.type = 'file'
      input.hidden = true
      document.body.append(input)
    })
    await page.locator('#native-drop-input').setInputFiles(sourcePath)
    await page.locator('html').evaluate((element) => {
      const file = document.querySelector<HTMLInputElement>('#native-drop-input')!.files![0]
      const dataTransfer = new DataTransfer()
      dataTransfer.items.add(file)
      ;(window as typeof window & { testDropData?: DataTransfer }).testDropData = dataTransfer
      element.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer }))
      element.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer }))
    })
    await page.locator('html').evaluate((element) => {
      const dataTransfer = (window as typeof window & { testDropData?: DataTransfer }).testDropData!
      element.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }))
    })
    await page.getByLabel('Name').fill('Dropped image')
    const dropzone = page.locator('.dropzone')
    await expect(dropzone).toContainText('dropped.png')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Dropped image')).toBeVisible()
  } finally {
    await app.close()
    rmSync(root, { recursive: true, force: true })
  }
})

test('copies macOS GIFs as file attachments', async () => {
  test.skip(process.platform !== 'darwin', 'macOS-specific pasteboard regression')
  const root = mkdtempSync(path.join(os.tmpdir(), 'reaction-clipboard-e2e-'))
  const sourcePath = path.join(root, 'animated.gif')
  writeFileSync(sourcePath, Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64'))
  const { ELECTRON_RUN_AS_NODE: _electronRunAsNode, ...env } = process.env
  const app = await electron.launch({ args: ['.'], env: { ...env, REACTION_CLIPBOARD_DATA_DIR: root } })
  try {
    const page = await app.firstWindow()
    await page.evaluate(() => {
      const input = document.createElement('input')
      input.id = 'native-drop-input'
      input.type = 'file'
      input.hidden = true
      document.body.append(input)
    })
    await page.locator('#native-drop-input').setInputFiles(sourcePath)
    await page.locator('html').evaluate((element) => {
      const file = document.querySelector<HTMLInputElement>('#native-drop-input')!.files![0]
      const dataTransfer = new DataTransfer()
      dataTransfer.items.add(file)
      element.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }))
    })
    await page.getByLabel('Name').fill('Animated GIF')
    await page.getByRole('button', { name: 'Save' }).click()
    await page.locator('.card').click()
    await expect(page.getByText('Copied: Animated GIF')).toBeVisible()
    const pasteboardTypes = execFileSync('/usr/bin/osascript', [
      '-l',
      'JavaScript',
      '-e',
      'ObjC.import("AppKit"); function run() { return ObjC.deepUnwrap($.NSPasteboard.generalPasteboard.types).join("\\n") }'
    ], { encoding: 'utf8' })
    expect(pasteboardTypes).toContain('public.file-url')
    expect(pasteboardTypes).toContain('NSFilenamesPboardType')
  } finally {
    await app.close()
    rmSync(root, { recursive: true, force: true })
  }
})

test('imports an image URL dragged from a web page', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'reaction-clipboard-e2e-'))
  const bytes = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3])
  const server = createServer((request, response) => {
    if (request.url !== '/web-image') {
      response.writeHead(200, { 'Content-Type': 'text/html' })
      response.end('<p>not an image</p>')
      return
    }
    response.writeHead(200, { 'Content-Type': 'image/png' })
    response.write(bytes.subarray(0, 8))
    setTimeout(() => response.end(bytes.subarray(8)), 50)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Could not start the web-drop test server.')
  const { ELECTRON_RUN_AS_NODE: _electronRunAsNode, ...env } = process.env
  const app = await electron.launch({ args: ['.'], env: { ...env, REACTION_CLIPBOARD_DATA_DIR: root } })
  try {
    const page = await app.firstWindow()
    const url = `http://127.0.0.1:${address.port}/web-image`
    await page.locator('html').evaluate((element, droppedUrl) => {
      const dataTransfer = new DataTransfer()
      dataTransfer.setData('text/uri-list', new URL('/wrapped-page', droppedUrl).toString())
      dataTransfer.setData('text/html', `<a href="/wrapped-page"><img src="${droppedUrl}"></a>`)
      ;(window as typeof window & { testDropData?: DataTransfer }).testDropData = dataTransfer
      element.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer }))
      element.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer }))
    }, url)
    await page.locator('html').evaluate((element) => {
      const dataTransfer = (window as typeof window & { testDropData?: DataTransfer }).testDropData!
      element.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }))
    })
    await page.getByLabel('Name').fill('Web image')
    await expect(page.locator('.dropzone')).toContainText('web-image.png')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Web image')).toBeVisible()
  } finally {
    await app.close()
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
    rmSync(root, { recursive: true, force: true })
  }
})

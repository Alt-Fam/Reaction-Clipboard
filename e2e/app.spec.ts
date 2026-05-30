import { _electron as electron, expect, test } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
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
    page.once('dialog', (dialog) => dialog.accept())
    await page.getByRole('button', { name: 'Delete Big victory' }).click()
    await expect(page.getByText('Your reaction library is empty')).toBeVisible()
  } finally {
    await app.close()
    rmSync(root, { recursive: true, force: true })
  }
})

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Repository } from '../src/main/repository.js'
import { StorageService } from '../src/main/storage.js'

const roots: string[] = []

describe('Repository', () => {
  afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })))

  it('persists text items, reuses normalized tags, and manages tag metadata', () => {
    const { repository, database, storage } = setup()
    repository.createText({ name: 'First', text: 'hello', tags: [' Funny '] })
    repository.createText({ name: 'Second', text: 'world', tags: ['funny'] })
    expect(repository.listItems()).toHaveLength(2)
    expect(repository.listTags()).toMatchObject([{ name: 'Funny', usageCount: 2 }])
    const tag = repository.listTags()[0]
    repository.renameTag(tag.id, 'Humor')
    expect(repository.listTags()[0].name).toBe('Humor')
    repository.close()
    const reopened = new Repository(database, storage)
    expect(reopened.listItems()).toHaveLength(2)
    reopened.deleteTag(tag.id)
    expect(reopened.listItems().every((item) => item.tags.length === 0)).toBe(true)
    reopened.close()
  })

  it('copies imports into managed storage and leaves originals unchanged on deletion', async () => {
    const { root, repository } = setup()
    const original = path.join(root, 'source.png')
    const bytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3])
    writeFileSync(original, bytes)
    const created = await repository.importMedia({ name: 'Image', tags: [], sourcePath: original, allowLargeFile: false })
    expect(readFileSync(repository.getManagedMediaPath(created.id))).toEqual(bytes)
    await repository.deleteItem(created.id)
    expect(readFileSync(original)).toEqual(bytes)
    expect(repository.listItems()).toHaveLength(0)
    repository.close()
  })

  it('imports validated dropped bytes into managed storage', async () => {
    const { repository } = setup()
    const bytes = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 4, 5, 6])
    const created = await repository.importDroppedMedia({ name: 'Dropped', tags: ['local'], sourcePath: 'token', allowLargeFile: false }, 'dropped.png', bytes)
    expect(readFileSync(repository.getManagedMediaPath(created.id))).toEqual(Buffer.from(bytes))
    expect(created.tags[0].name).toBe('local')
    repository.close()
  })
})

function setup() {
  const root = path.join(os.tmpdir(), `reaction-clipboard-${crypto.randomUUID()}`)
  roots.push(root)
  const media = path.join(root, 'media')
  mkdirSync(media, { recursive: true })
  const database = path.join(root, 'database.sqlite')
  const storage = new StorageService(media)
  return { root, database, storage, repository: new Repository(database, storage) }
}

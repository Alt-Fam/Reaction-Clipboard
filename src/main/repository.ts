import { randomUUID } from 'node:crypto'
import { rm } from 'node:fs/promises'
import { DatabaseSync } from 'node:sqlite'
import type { CreateTextInput, ImportMediaInput, Item, Tag, UpdateItemInput } from '../shared/types.js'
import { normalizeTag } from '../shared/search.js'
import { StorageService } from './storage.js'

interface ItemRow {
  id: string
  type: Item['type']
  name: string
  text_content: string | null
  media_path: string | null
  media_mime_type: string | null
  media_size_bytes: number | null
  created_at: string
  updated_at: string
}

interface TagRow {
  id: string
  name: string
  usage_count: number
}

export class Repository {
  private readonly db: DatabaseSync

  constructor(databasePath: string, private readonly storage: StorageService) {
    this.db = new DatabaseSync(databasePath)
    this.db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;')
    this.migrate()
  }

  close(): void {
    this.db.close()
  }

  listItems(): Item[] {
    const rows = this.db.prepare('SELECT * FROM items ORDER BY created_at DESC').all() as unknown as ItemRow[]
    return rows.map((row) => this.toItem(row))
  }

  listTags(): Tag[] {
    const rows = this.db.prepare(`
      SELECT tags.id, tags.name, COUNT(item_tags.item_id) AS usage_count
      FROM tags LEFT JOIN item_tags ON item_tags.tag_id = tags.id
      GROUP BY tags.id ORDER BY tags.name COLLATE NOCASE
    `).all() as unknown as TagRow[]
    return rows.map((tag) => ({ id: tag.id, name: tag.name, usageCount: tag.usage_count }))
  }

  createText(input: CreateTextInput): Item {
    const id = randomUUID()
    const now = new Date().toISOString()
    this.transaction(() => {
      this.db.prepare('INSERT INTO items(id, type, name, text_content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(id, 'text', input.name.trim(), input.text, now, now)
      this.setItemTags(id, input.tags)
    })
    return this.getItem(id)
  }

  async importMedia(input: ImportMediaInput): Promise<Item> {
    const media = await this.storage.import(input.sourcePath, input.allowLargeFile)
    return this.createMediaItem(input, media)
  }

  async importDroppedMedia(input: ImportMediaInput, fileName: string, bytes: Uint8Array): Promise<Item> {
    const media = await this.storage.importDropped(fileName, bytes, input.allowLargeFile)
    return this.createMediaItem(input, media)
  }

  private async createMediaItem(input: ImportMediaInput, media: Awaited<ReturnType<StorageService['import']>>): Promise<Item> {
    const id = randomUUID()
    const now = new Date().toISOString()
    try {
      this.transaction(() => {
        this.db.prepare(`
          INSERT INTO items(id, type, name, media_path, media_mime_type, media_size_bytes, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, media.type, input.name.trim(), media.relativePath, media.mimeType, media.sizeBytes, now, now)
        this.setItemTags(id, input.tags)
      })
      return this.getItem(id)
    } catch (error) {
      await rm(media.absolutePath, { force: true })
      throw error
    }
  }

  updateItem(input: UpdateItemInput): Item {
    const existing = this.getItemRow(input.id)
    if (existing.type === 'text' && input.text === undefined) throw new Error('Text content is required.')
    const now = new Date().toISOString()
    this.transaction(() => {
      if (existing.type === 'text') {
        this.db.prepare('UPDATE items SET name = ?, text_content = ?, updated_at = ? WHERE id = ?')
          .run(input.name.trim(), input.text!, now, input.id)
      } else {
        this.db.prepare('UPDATE items SET name = ?, updated_at = ? WHERE id = ?').run(input.name.trim(), now, input.id)
      }
      this.db.prepare('DELETE FROM item_tags WHERE item_id = ?').run(input.id)
      this.setItemTags(input.id, input.tags)
    })
    return this.getItem(input.id)
  }

  async deleteItem(id: string): Promise<void> {
    const item = this.getItemRow(id)
    if (item.media_path) await this.storage.remove(item.media_path)
    this.db.prepare('DELETE FROM items WHERE id = ?').run(id)
  }

  renameTag(id: string, name: string): void {
    const trimmed = name.trim()
    try {
      const result = this.db.prepare('UPDATE tags SET name = ?, normalized_name = ? WHERE id = ?').run(trimmed, normalizeTag(trimmed), id)
      if (!result.changes) throw new Error('Tag not found.')
    } catch (error) {
      if (String(error).includes('UNIQUE')) throw new Error('A tag with that name already exists.')
      throw error
    }
  }

  deleteTag(id: string): void {
    const result = this.db.prepare('DELETE FROM tags WHERE id = ?').run(id)
    if (!result.changes) throw new Error('Tag not found.')
  }

  getManagedMediaPath(id: string): string {
    const mediaPath = this.getItemRow(id).media_path
    if (!mediaPath) throw new Error('Item does not contain media.')
    return this.storage.resolve(mediaPath)
  }

  getItem(id: string): Item {
    return this.toItem(this.getItemRow(id))
  }

  private getItemRow(id: string): ItemRow {
    const row = this.db.prepare('SELECT * FROM items WHERE id = ?').get(id) as unknown as ItemRow | undefined
    if (!row) throw new Error('Item not found.')
    return row
  }

  private toItem(row: ItemRow): Item {
    const tagRows = this.db.prepare(`
      SELECT tags.id, tags.name, COUNT(item_tags.item_id) AS usage_count
      FROM tags JOIN item_tags ON item_tags.tag_id = tags.id WHERE item_tags.item_id = ?
      GROUP BY tags.id ORDER BY tags.name COLLATE NOCASE
    `).all(row.id) as unknown as TagRow[]
    const tags = tagRows.map((tag) => ({ id: tag.id, name: tag.name, usageCount: tag.usage_count }))
    return {
      id: row.id, type: row.type, name: row.name, tags,
      ...(row.text_content !== null ? { text: row.text_content } : {}),
      ...(row.media_path !== null ? {
        mediaUrl: `reaction-media://item/${row.id}`,
        mediaMimeType: row.media_mime_type || undefined,
        mediaSizeBytes: row.media_size_bytes || undefined
      } : {}),
      createdAt: row.created_at, updatedAt: row.updated_at
    }
  }

  private setItemTags(itemId: string, names: string[]): void {
    for (const name of [...new Set(names.map((value) => value.trim()).filter(Boolean))]) {
      const normalized = normalizeTag(name)
      let tag = this.db.prepare('SELECT id FROM tags WHERE normalized_name = ?').get(normalized) as { id: string } | undefined
      if (!tag) {
        tag = { id: randomUUID() }
        this.db.prepare('INSERT INTO tags(id, name, normalized_name) VALUES (?, ?, ?)').run(tag.id, name, normalized)
      }
      this.db.prepare('INSERT OR IGNORE INTO item_tags(item_id, tag_id) VALUES (?, ?)').run(itemId, tag.id)
    }
  }

  private transaction(action: () => void): void {
    this.db.exec('BEGIN')
    try {
      action()
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_version(version INTEGER NOT NULL);
      INSERT INTO schema_version(version) SELECT 1 WHERE NOT EXISTS (SELECT 1 FROM schema_version);
      CREATE TABLE IF NOT EXISTS items(
        id TEXT PRIMARY KEY, type TEXT NOT NULL CHECK(type IN ('text', 'image', 'gif')),
        name TEXT NOT NULL, text_content TEXT, media_path TEXT, media_mime_type TEXT,
        media_size_bytes INTEGER, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS tags(id TEXT PRIMARY KEY, name TEXT NOT NULL, normalized_name TEXT NOT NULL UNIQUE);
      CREATE TABLE IF NOT EXISTS item_tags(
        item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
        tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
        PRIMARY KEY(item_id, tag_id)
      );
      CREATE INDEX IF NOT EXISTS idx_items_created_at ON items(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_item_tags_tag_id ON item_tags(tag_id);
    `)
  }
}

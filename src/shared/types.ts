export type ItemType = 'text' | 'image' | 'gif'
export type TypeFilter = 'all' | ItemType

export interface Tag {
  id: string
  name: string
  usageCount: number
}

export interface Item {
  id: string
  type: ItemType
  name: string
  tags: Tag[]
  text?: string
  mediaUrl?: string
  mediaMimeType?: string
  mediaSizeBytes?: number
  createdAt: string
  updatedAt: string
}

export interface MediaSelection {
  sourcePath: string
  fileName: string
  mimeType: string
  sizeBytes: number
  type: Exclude<ItemType, 'text'>
  requiresLargeFileConfirmation: boolean
}

export interface CreateTextInput {
  name: string
  text: string
  tags: string[]
}

export interface ImportMediaInput {
  name: string
  tags: string[]
  sourcePath: string
  allowLargeFile: boolean
}

export interface UpdateItemInput {
  id: string
  name: string
  tags: string[]
  text?: string
}

export interface ClipboardResult {
  message: string
}

export interface CopyItemInput {
  id: string
  fallbackPngDataUrl?: string
}

export interface ReactionClipboardApi {
  listItems(): Promise<Item[]>
  listTags(): Promise<Tag[]>
  chooseMediaFile(): Promise<MediaSelection | null>
  inspectDroppedFile(file: File): Promise<MediaSelection>
  createText(input: CreateTextInput): Promise<Item>
  importMedia(input: ImportMediaInput): Promise<Item>
  updateItem(input: UpdateItemInput): Promise<Item>
  deleteItem(id: string): Promise<void>
  renameTag(id: string, name: string): Promise<void>
  deleteTag(id: string): Promise<void>
  copyItem(input: CopyItemInput): Promise<ClipboardResult>
  openDataFolder(): Promise<void>
}

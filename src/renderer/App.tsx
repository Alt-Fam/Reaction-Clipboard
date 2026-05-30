import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { filterItems } from '../shared/search'
import type { Item, MediaSelection, Tag, TypeFilter } from '../shared/types'

type Panel = 'add' | 'tags' | 'settings' | null

export function App() {
  const [items, setItems] = useState<Item[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [query, setQuery] = useState('')
  const [type, setType] = useState<TypeFilter>('all')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [panel, setPanel] = useState<Panel>(null)
  const [editing, setEditing] = useState<Item | null>(null)
  const [deleting, setDeleting] = useState<Item | null>(null)
  const [toast, setToast] = useState('')
  const [error, setError] = useState('')
  const [copyingId, setCopyingId] = useState<string | null>(null)

  const refresh = async () => {
    try {
      const [nextItems, nextTags] = await Promise.all([window.reactionClipboard.listItems(), window.reactionClipboard.listTags()])
      setItems(nextItems)
      setTags(nextTags)
    } catch (reason) {
      setError(message(reason))
    }
  }
  useEffect(() => { void refresh() }, [])
  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(() => setToast(''), 2200)
    return () => window.clearTimeout(timeout)
  }, [toast])

  const visibleItems = useMemo(() => filterItems(items, query, type, selectedTags), [items, query, type, selectedTags])
  const filtered = Boolean(query || type !== 'all' || selectedTags.length)
  const clearFilters = () => { setQuery(''); setType('all'); setSelectedTags([]) }
  const toggleTag = (name: string) => setSelectedTags((current) => current.includes(name) ? current.filter((tag) => tag !== name) : [...current, name])
  const removeItem = async (item: Item) => {
    await attempt(async () => {
      await window.reactionClipboard.deleteItem(item.id)
      await refresh()
      setDeleting(null)
    }, setError)
  }
  const copy = async (item: Item) => {
    if (copyingId) return
    setCopyingId(item.id)
    setToast(item.type === 'gif' ? `Copying GIF: ${item.name}` : `Copying: ${item.name}`)
    await attempt(async () => {
      const fallbackPngDataUrl = item.type === 'text' ? undefined : await createFallbackPng(item.mediaUrl)
      setToast((await window.reactionClipboard.copyItem({ id: item.id, fallbackPngDataUrl })).message)
    }, setError)
    setCopyingId(null)
  }

  return <main>
    <header>
      <div><p className="eyebrow">Local reaction library</p><h1>Reaction Clipboard</h1></div>
      <nav><button className="quiet" onClick={() => setPanel('tags')}>Manage tags</button><button className="quiet" onClick={() => setPanel('settings')}>Settings</button><button onClick={() => setPanel('add')}>Add Item</button></nav>
    </header>
    <section className="controls">
      <input autoFocus aria-label="Search" placeholder="Search names and tags" value={query} onChange={(event) => setQuery(event.target.value)} />
      <div className="segmented">{(['all', 'text', 'image', 'gif'] as TypeFilter[]).map((value) => <button className={type === value ? 'active' : ''} key={value} onClick={() => setType(value)}>{label(value)}</button>)}</div>
      {filtered && <button className="link" onClick={clearFilters}>Clear filters</button>}
    </section>
    {tags.length > 0 && <section className="chips">{tags.map((tag) => <button className={selectedTags.includes(tag.name) ? 'chip active' : 'chip'} key={tag.id} onClick={() => toggleTag(tag.name)}>{tag.name}</button>)}</section>}
    {items.length === 0 ? <Empty title="Your reaction library is empty" action="Add your first item" onClick={() => setPanel('add')} /> :
      visibleItems.length === 0 ? <Empty title="No matching items" action="Clear filters" onClick={clearFilters} /> :
      <section className="grid">{visibleItems.map((item) => <Card key={item.id} item={item} copying={copyingId === item.id} onCopy={() => copy(item)} onEdit={() => setEditing(item)} onDelete={() => setDeleting(item)} />)}</section>}
    {panel === 'add' && <ItemForm title="Add item" tags={tags} onClose={() => setPanel(null)} onSaved={async () => { await refresh(); setPanel(null) }} />}
    {editing && <ItemForm title="Edit item" tags={tags} item={editing} onClose={() => setEditing(null)} onSaved={async () => { await refresh(); setEditing(null) }} />}
    {deleting && <DeleteItemDialog item={deleting} onClose={() => setDeleting(null)} onConfirm={() => void removeItem(deleting)} />}
    {panel === 'tags' && <TagPanel tags={tags} onClose={() => setPanel(null)} onChanged={refresh} />}
    {panel === 'settings' && <Settings onClose={() => setPanel(null)} />}
    {toast && <div className="toast">{toast}</div>}
    {error && <div className="error-toast">{error}<button onClick={() => setError('')}>Dismiss</button></div>}
  </main>
}

function DeleteItemDialog({ item, onClose, onConfirm }: { item: Item; onClose(): void; onConfirm(): void }) {
  return <Modal title="Delete item" onClose={onClose}><p>Delete <strong>{item.name}</strong>?</p><p className="note">This permanently removes its managed copy. Imported source files are never deleted.</p><footer><button className="quiet" onClick={onClose}>Cancel</button><button onClick={onConfirm}>Confirm delete</button></footer></Modal>
}

function Card({ item, copying, onCopy, onEdit, onDelete }: { item: Item; copying: boolean; onCopy(): void; onEdit(): void; onDelete(): void }) {
  return <article className={copying ? 'card copying' : 'card'} tabIndex={0} aria-busy={copying} onClick={onCopy} onKeyDown={(event) => { if (event.key === 'Enter') onCopy() }}>
    <div className="preview">{item.type === 'text' ? <p>{item.text}</p> : item.type === 'gif' ? <VisibleGif item={item} /> : <img src={item.mediaUrl} alt="" />}</div>
    <div className="card-info"><strong title={item.name}>{item.name}</strong><span>{item.type === 'gif' ? 'GIF' : item.type}</span></div>
    <div className="card-tags">{item.tags.map((tag) => <small key={tag.id}>{tag.name}</small>)}</div>
    <div className="card-actions"><button aria-label={`Edit ${item.name}`} onClick={(event) => { event.stopPropagation(); onEdit() }}>Edit</button><button aria-label={`Delete ${item.name}`} onClick={(event) => { event.stopPropagation(); onDelete() }}>Delete</button></div>
  </article>
}

function VisibleGif({ item }: { item: Item }) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { rootMargin: '80px' })
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])
  return <div ref={ref} className="gif-slot">{visible && <img src={item.mediaUrl} alt="" />}</div>
}

function ItemForm({ title, tags, item, onClose, onSaved }: { title: string; tags: Tag[]; item?: Item; onClose(): void; onSaved(): void }) {
  const [mode, setMode] = useState<'text' | 'media'>(item?.type === 'text' || !item ? 'text' : 'media')
  const [name, setName] = useState(item?.name || '')
  const [text, setText] = useState(item?.text || '')
  const [selectedTags, setSelectedTags] = useState(item?.tags.map((tag) => tag.name) || [])
  const [newTag, setNewTag] = useState('')
  const [media, setMedia] = useState<MediaSelection | null>(null)
  const [error, setError] = useState('')
  const [confirmLargeFile, setConfirmLargeFile] = useState(false)
  const existingMedia = item && item.type !== 'text'
  const availableTags = [
    ...tags,
    ...selectedTags
      .filter((name) => !tags.some((tag) => tag.name.toLocaleLowerCase() === name.toLocaleLowerCase()))
      .map((name) => ({ id: `new:${name.toLocaleLowerCase()}`, name, usageCount: 0 }))
  ]
  const addTag = () => {
    const trimmed = newTag.trim()
    if (trimmed && !selectedTags.some((tag) => tag.toLocaleLowerCase() === trimmed.toLocaleLowerCase())) setSelectedTags([...selectedTags, trimmed])
    setNewTag('')
  }
  const selectFile = async () => {
    setConfirmLargeFile(false)
    setMedia(await window.reactionClipboard.chooseMediaFile())
  }
  const dropFile = async (event: React.DragEvent) => {
    event.preventDefault()
    const file = event.dataTransfer.files[0]
    if (file) await attempt(async () => {
      setConfirmLargeFile(false)
      setMedia(await window.reactionClipboard.inspectDroppedFile(file))
    }, setError)
  }
  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (!item && mode === 'media' && media?.requiresLargeFileConfirmation && !confirmLargeFile) {
      setConfirmLargeFile(true)
      return
    }
    await attempt(async () => {
      if (item) await window.reactionClipboard.updateItem({ id: item.id, name, tags: selectedTags, ...(item.type === 'text' ? { text } : {}) })
      else if (mode === 'text') await window.reactionClipboard.createText({ name, text, tags: selectedTags })
      else {
        if (!media) throw new Error('Choose a media file first.')
        await window.reactionClipboard.importMedia({ name, tags: selectedTags, sourcePath: media.sourcePath, allowLargeFile: confirmLargeFile })
      }
      onSaved()
    }, setError)
  }
  return <Modal title={title} onClose={onClose}><form onSubmit={save}>
    {!item && <div className="segmented"><button type="button" className={mode === 'text' ? 'active' : ''} onClick={() => setMode('text')}>Text</button><button type="button" className={mode === 'media' ? 'active' : ''} onClick={() => setMode('media')}>Media</button></div>}
    <label>Name<input required value={name} onChange={(event) => setName(event.target.value)} /></label>
    {(mode === 'text' && !existingMedia) && <label>Text<textarea required rows={7} value={text} onChange={(event) => setText(event.target.value)} /></label>}
    {(mode === 'media' && !existingMedia) && <div className="dropzone" onDragOver={(event) => event.preventDefault()} onDrop={dropFile}><button type="button" onClick={selectFile}>Choose media file</button><span>{media ? media.fileName : 'or drop one file here'}</span></div>}
    {existingMedia && <p className="note">To replace media, delete this item and add a new one.</p>}
    <fieldset><legend>Tags</legend><div className="chips">{availableTags.map((tag) => <button type="button" className={selectedTags.includes(tag.name) ? 'chip active' : 'chip'} key={tag.id} onClick={() => setSelectedTags((current) => current.includes(tag.name) ? current.filter((name) => name !== tag.name) : [...current, tag.name])}>{tag.name}</button>)}</div>
      <div className="inline"><input placeholder="New tag" value={newTag} onChange={(event) => setNewTag(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addTag() } }} /><button type="button" onClick={addTag}>Add tag</button></div>
    </fieldset>
    {confirmLargeFile && <div className="warning"><p>This file is larger than 100 MB. Import it anyway?</p><div className="inline"><button type="button" className="quiet" onClick={() => setConfirmLargeFile(false)}>Cancel</button><button type="submit">Confirm import</button></div></div>}
    {error && <p className="form-error">{error}</p>}<footer><button type="button" className="quiet" onClick={onClose}>Cancel</button><button>Save</button></footer>
  </form></Modal>
}

function TagPanel({ tags, onClose, onChanged }: { tags: Tag[]; onClose(): void; onChanged(): void }) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const edit = (tag: Tag) => {
    setEditingId(tag.id)
    setName(tag.name)
    setError('')
  }
  const rename = async (tag: Tag) => {
    await attempt(async () => {
      await window.reactionClipboard.renameTag(tag.id, name)
      await onChanged()
      setEditingId(null)
    }, setError)
  }
  const remove = async (tag: Tag) => {
    await attempt(async () => {
      await window.reactionClipboard.deleteTag(tag.id)
      await onChanged()
      setDeletingId(null)
    }, setError)
  }
  return <Modal title="Manage tags" onClose={onClose}>{tags.length ? <div className="tag-list">{tags.map((tag) => <div key={tag.id}>{editingId === tag.id ?
    <form className="inline tag-rename" onSubmit={(event) => { event.preventDefault(); void rename(tag) }}><input aria-label={`Rename ${tag.name}`} value={name} onChange={(event) => setName(event.target.value)} autoFocus /><button>Save</button><button type="button" className="quiet" onClick={() => setEditingId(null)}>Cancel</button></form> :
    deletingId === tag.id ?
      <><span>Delete <strong>{tag.name}</strong> from all items?</span><span><button onClick={() => void remove(tag)}>Confirm delete</button><button className="quiet" onClick={() => setDeletingId(null)}>Cancel</button></span></> :
      <><span><strong>{tag.name}</strong> <small>{tag.usageCount} item{tag.usageCount === 1 ? '' : 's'}</small></span><span><button onClick={() => edit(tag)}>Rename</button><button onClick={() => setDeletingId(tag.id)}>Delete</button></span></>}</div>)}</div> : <p>No tags yet.</p>}{error && <p className="form-error">{error}</p>}</Modal>
}

function Settings({ onClose }: { onClose(): void }) {
  return <Modal title="Settings" onClose={onClose}><p className="note">Do not modify stored files while Reaction Clipboard is running.</p><button onClick={() => window.reactionClipboard.openDataFolder()}>Open Data Folder</button></Modal>
}

function Modal({ title, onClose, children }: { title: string; onClose(): void; children: React.ReactNode }) {
  return <div className="backdrop" onMouseDown={onClose}><section className="modal" onMouseDown={(event) => event.stopPropagation()}><header><h2>{title}</h2><button className="quiet" aria-label="Close" onClick={onClose}>Close</button></header>{children}</section></div>
}

function Empty({ title, action, onClick }: { title: string; action: string; onClick(): void }) {
  return <section className="empty"><h2>{title}</h2><button onClick={onClick}>{action}</button></section>
}

async function attempt(action: () => Promise<void>, setError: (value: string) => void): Promise<void> {
  try { await action() } catch (reason) { setError(message(reason)) }
}
function message(reason: unknown): string { return reason instanceof Error ? reason.message : String(reason) }
function label(type: TypeFilter): string { return ({ all: 'All', text: 'Text', image: 'Images', gif: 'GIFs' })[type] }

async function createFallbackPng(mediaUrl?: string): Promise<string | undefined> {
  if (!mediaUrl) return undefined
  const image = new Image()
  image.crossOrigin = 'anonymous'
  image.src = mediaUrl
  await image.decode()
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  canvas.getContext('2d')?.drawImage(image, 0, 0)
  return canvas.toDataURL('image/png')
}

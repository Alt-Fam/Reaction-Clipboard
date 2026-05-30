import type { Item, TypeFilter } from './types.js'

export function normalizeTag(name: string): string {
  return name.trim().toLocaleLowerCase()
}

export function filterItems(
  items: Item[],
  query: string,
  type: TypeFilter,
  selectedTags: string[]
): Item[] {
  const tokens = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
  const normalizedTags = selectedTags.map(normalizeTag)

  return items.filter((item) => {
    if (type !== 'all' && item.type !== type) return false
    const itemTags = item.tags.map((tag) => normalizeTag(tag.name))
    if (!normalizedTags.every((tag) => itemTags.includes(tag))) return false
    const searchable = [item.name, ...item.tags.map((tag) => tag.name)].join(' ').toLocaleLowerCase()
    return tokens.every((token) => searchable.includes(token))
  })
}

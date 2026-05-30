import { describe, expect, it } from 'vitest'
import { filterItems, normalizeTag } from '../src/shared/search.js'
import type { Item } from '../src/shared/types.js'

const items: Item[] = [
  item('1', 'image', 'angry red cartoon mouse', ['Funny']),
  item('2', 'gif', 'mouse stare', ['red', 'Reaction']),
  item('3', 'text', 'agreement', ['reaction'])
]

describe('search and filtering', () => {
  it('normalizes tag whitespace and casing', () => expect(normalizeTag(' Funny ')).toBe('funny'))
  it('requires every token across item name and tags', () => expect(filterItems(items, 'red mouse', 'all', []).map(({ id }) => id)).toEqual(['1', '2']))
  it('combines type and multi-tag filters with AND behavior', () => expect(filterItems(items, '', 'gif', ['RED', 'reaction']).map(({ id }) => id)).toEqual(['2']))
})

function item(id: string, type: Item['type'], name: string, names: string[]): Item {
  return { id, type, name, tags: names.map((tag, index) => ({ id: `${id}-${index}`, name: tag, usageCount: 1 })), createdAt: '', updatedAt: '' }
}

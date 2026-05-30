import type { ReactionClipboardApi } from '../shared/types'

declare global {
  interface Window {
    reactionClipboard: ReactionClipboardApi
  }
}

export {}

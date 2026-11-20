import type { Id, RDocument, TextBoxObject } from '../model/types'
import { chainOf, getObject } from '../model/ops'
import type { Measurer, StoryLayout } from './layout'
import { layoutStory } from './layout'
import { buildWrapFn } from './wrap'
import type { AssetStore } from '../assets'

/** Caches story layouts for one document version. */
export class TextEngine {
  private cache = new Map<Id, StoryLayout>()
  private version = -1

  /** Pictures, for wrapping text around their visible outline. */
  assets?: AssetStore

  constructor(public measurer: Measurer) {}

  invalidate(): void {
    this.cache.clear()
    this.version = -1
  }

  sync(version: number): void {
    if (version !== this.version) {
      this.cache.clear()
      this.version = version
    }
  }

  chain(doc: RDocument, storyId: Id): TextBoxObject[] {
    return chainOf(doc, storyId)
      .map((id) => getObject(doc, id))
      .filter((o): o is TextBoxObject => !!o && o.type === 'text')
  }

  layout(doc: RDocument, storyId: Id): StoryLayout | null {
    let l = this.cache.get(storyId)
    if (!l) {
      const story = doc.stories[storyId]
      if (!story) return null
      const chain = this.chain(doc, storyId)
      l = layoutStory(story, chain, this.measurer, buildWrapFn(doc, chain, this.assets))
      this.cache.set(storyId, l)
    }
    return l
  }

  /** Grow Text Box to Fit: resize boxes to their text. Returns true if anything changed. */
  applyGrowBoxes(doc: RDocument): boolean {
    let changed = false
    for (const storyId of Object.keys(doc.stories)) {
      const chain = this.chain(doc, storyId)
      const head = chain[0]
      if (!head || head.autofit !== 'growBox') continue
      const l = layoutStory(doc.stories[storyId], chain, this.measurer)
      const h = Math.max(head.margins.top + head.margins.bottom + 6, Math.ceil(l.neededHeight * 100) / 100)
      if (Math.abs(h - head.height) > 0.01) {
        head.height = h
        changed = true
      }
    }
    if (changed) this.invalidate()
    return changed
  }
}

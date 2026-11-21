import type { AssetData, AssetInfo, Id } from './model/types'
import { newId } from './model/factory'

/** Keeps picture bytes and decoded images outside the (undoable) document. */
export class AssetStore {
  private data = new Map<Id, AssetData>()
  private images = new Map<Id, CanvasImageSource>()
  private pending = new Map<Id, Promise<void>>()
  onLoaded: (() => void) | null = null

  get all(): Map<Id, AssetData> {
    return this.data
  }

  replaceAll(map: Map<Id, AssetData>): void {
    this.data = new Map(map)
    this.images.clear()
    this.pending.clear()
    for (const id of this.data.keys()) this.decode(id)
  }

  /** Add picture data that already has an id (e.g. pasted from another publication). */
  put(data: AssetData): void {
    this.data.set(data.info.id, data)
    this.decode(data.info.id)
  }

  get(id: Id): AssetData | undefined {
    return this.data.get(id)
  }

  image(id: Id): CanvasImageSource | undefined {
    const img = this.images.get(id)
    if (!img && this.data.has(id) && !this.pending.has(id)) this.decode(id)
    return img
  }

  /** Add an image file; returns its info once decoded (so pixel size is known). */
  async add(name: string, mime: string, bytes: Uint8Array): Promise<AssetInfo> {
    const id = newId('a')
    const info: AssetInfo = { id, name, mime, pixelWidth: 0, pixelHeight: 0 }
    this.data.set(id, { info, bytes })
    await this.decode(id)
    const img = this.images.get(id) as (ImageBitmap | HTMLImageElement | undefined)
    if (img) {
      info.pixelWidth = 'naturalWidth' in img ? img.naturalWidth : img.width
      info.pixelHeight = 'naturalHeight' in img ? img.naturalHeight : img.height
    }
    return info
  }

  private decode(id: Id): Promise<void> {
    const existing = this.pending.get(id)
    if (existing) return existing
    const a = this.data.get(id)
    if (!a) return Promise.resolve()
    const p = (async () => {
      const blob = new Blob([a.bytes as BlobPart], { type: a.info.mime })
      const url = URL.createObjectURL(blob)
      try {
        const img = new Image()
        img.decoding = 'async'
        img.src = url
        await img.decode()
        // SVGs without an intrinsic size get a sensible default.
        if (!img.naturalWidth) { img.width = 300; img.height = 300 }
        this.images.set(id, img)
        this.onLoaded?.()
      } catch {
        /* unsupported or damaged image: leave as placeholder */
      } finally {
        // The decoded image keeps its pixels; the blob URL isn't needed any more.
        URL.revokeObjectURL(url)
      }
    })()
    this.pending.set(id, p)
    return p
  }
}

import { rename, rm, writeFile } from 'node:fs/promises'

/**
 * Write a file without ever leaving a half-written one behind: write a
 * temporary file next to it, then rename it over the old one. If the app
 * crashes or the disk fills up mid-save, the previous version is untouched.
 */
export async function writeFileAtomic(target: string, data: Uint8Array | string): Promise<void> {
  const tmp = `${target}.${process.pid}.${Date.now()}.tmp`
  try {
    await writeFile(tmp, data)
    await rename(tmp, target)
  } catch (e) {
    await rm(tmp, { force: true }).catch(() => {})
    throw e
  }
}

/**
 * A suggested file name that is safe to offer in a save dialog: a slash
 * would be read as a folder ("Tabloid / Ledger" → a "Tabloid " folder), so
 * slashes and other characters that file systems reject become dashes.
 */
export function safeFileName(name: string): string {
  const cleaned = name
    .replace(/\s*[/\\]\s*/g, '-')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f:*?"<>|]/g, '-')
    .trim()
  return cleaned.replace(/^\.+/, '') || 'Untitled'
}

import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@core': resolve(import.meta.dirname, 'src/renderer/src/core'),
      '@ui': resolve(import.meta.dirname, 'src/renderer/src/ui'),
      '@shared': resolve(import.meta.dirname, 'src/shared'),
      // Hunspell files for spell check (the package only exports a Node loader).
      'dictionary-en-files': resolve(import.meta.dirname, 'node_modules/dictionary-en')
    }
  },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' }
})

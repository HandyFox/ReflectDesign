import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

const alias = {
  '@core': resolve(import.meta.dirname, 'src/renderer/src/core'),
  '@ui': resolve(import.meta.dirname, 'src/renderer/src/ui'),
  '@shared': resolve(import.meta.dirname, 'src/shared'),
  // Hunspell files for spell check (the package only exports a Node loader).
  'dictionary-en-files': resolve(import.meta.dirname, 'node_modules/dictionary-en')
}

export default defineConfig({
  main: { resolve: { alias } },
  preload: {
    resolve: { alias },
    build: { rollupOptions: { output: { format: 'cjs', entryFileNames: '[name].cjs' } } }
  },
  renderer: {
    root: resolve(import.meta.dirname, 'src/renderer'),
    resolve: { alias },
    plugins: [react()]
  }
})

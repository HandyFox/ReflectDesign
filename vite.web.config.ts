// Runs the editor UI in a normal browser (no Electron) for quick testing.
// File and font features fall back to browser equivalents.
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: resolve(import.meta.dirname, 'src/renderer'),
  resolve: {
    alias: {
      '@core': resolve(import.meta.dirname, 'src/renderer/src/core'),
      '@ui': resolve(import.meta.dirname, 'src/renderer/src/ui'),
      '@shared': resolve(import.meta.dirname, 'src/shared')
    }
  },
  plugins: [react()],
  build: { outDir: resolve(import.meta.dirname, 'dist-web'), emptyOutDir: true },
  server: { port: 5199 }
})

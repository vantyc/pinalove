import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  root: path.resolve(__dirname),
  base: '/pinalove/',
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '../shared'),
    },
  },
  build: {
    outDir: path.resolve(__dirname, '../dist/frontend'),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/pinalove/api': 'http://127.0.0.1:8787',
      '/pinalove/healthz': 'http://127.0.0.1:8787',
    },
  },
})

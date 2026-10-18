import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  plugins: [tailwindcss(), react()],
  server: { port: 3000 },
  resolve: { alias: { '@': path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'soft-matter/src') } },
  build: {
    rollupOptions: {
      input: {
        hub: fileURLToPath(new URL('./index.html', import.meta.url)),
        softMatter: fileURLToPath(new URL('./soft-matter/index.html', import.meta.url)),
        liquidReality: fileURLToPath(new URL('./liquid-reality/index.html', import.meta.url)),
      },
    },
  },
})

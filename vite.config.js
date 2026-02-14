import { defineConfig } from 'vite'
import { copyFileSync, mkdirSync } from 'fs'
import { resolve } from 'path'

export default defineConfig({
  base: '/joanne_val/',
  build: {
    rollupOptions: {
      output: {
        // Copy assets after build
        assetFileNames: 'assets/[name]-[hash][extname]'
      }
    }
  },
  publicDir: 'public' // We'll move assets here
})

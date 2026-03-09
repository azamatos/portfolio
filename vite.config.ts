import { defineConfig } from 'vite'
import path from 'path'

export default defineConfig({
  root: '.',

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@components': path.resolve(__dirname, './src/components'),
    }
  },

  server: {
    port: 4000,
    open: true
  },

  build: {
    outDir: 'dist',
    sourcemap: true
  }
})
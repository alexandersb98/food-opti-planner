/// <reference types="vitest/config" />
import { quasar, transformAssetUrls } from '@quasar/vite-plugin'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vue({ template: { transformAssetUrls } }), quasar()],
  server: {
    // The FastAPI dev server: uvicorn --factory server.app:create_app --reload
    proxy: { '/api': 'http://localhost:8000' },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['src/test-setup.ts'],
    server: { deps: { inline: ['quasar'] } },
  },
})

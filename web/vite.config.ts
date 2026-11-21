/// <reference types="vitest/config" />
import { quasar, transformAssetUrls } from '@quasar/vite-plugin'
import react from '@vitejs/plugin-react'
import vue from '@vitejs/plugin-vue'
import { defineConfig, type Plugin } from 'vite'

// The React app (src/app/, entry next/index.html) runs beside the Vue app
// under this base path until it replaces it (ticket 42). Keep in step with
// src/app/base.ts.
const reactBase = '/next'

/** In the dev server, answer every path under the React base path that is
 * not a file with the React entry, so deep links (/next/recipes/3) load the
 * React app; everything else is left to Vite, which serves Vue. */
function reactFallback(): Plugin {
  return {
    name: 'react-app-fallback',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const [path, query] = (req.url ?? '').split(/\?(.*)/s, 2)
        const underBase = path === reactBase || path.startsWith(`${reactBase}/`)
        if (underBase && !/\.[a-z0-9]+$/i.test(path)) {
          req.url = `${reactBase}/index.html${query ? `?${query}` : ''}`
        }
        next()
      })
    },
  }
}

export default defineConfig({
  plugins: [
    vue({ template: { transformAssetUrls } }),
    quasar(),
    react({ include: /\/src\/app\/.*\.tsx?$/ }),
    reactFallback(),
  ],
  server: {
    // The FastAPI dev server: uvicorn --factory server.app:create_app --reload
    proxy: { '/api': 'http://localhost:8000' },
  },
  // The production build is the Vue app alone (index.html, served at "/");
  // the React entry is dev-only until the swap.
  test: {
    environment: 'jsdom',
    setupFiles: ['src/test-setup.ts'],
    server: { deps: { inline: ['quasar'] } },
  },
})

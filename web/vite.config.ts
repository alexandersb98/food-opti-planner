/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The app (src/app/, entry index.html) is served at "/". The dev server
// answers every path that is not a file with index.html, so deep links
// (/recipes/3) load the app; the server does the same in production.
// The type specimen (/specimen) is in dev builds only (src/app/routes.tsx).
export default defineConfig({
  plugins: [react()],
  server: {
    // The FastAPI dev server: uvicorn --factory server.app:create_app --reload
    // PLANNER_API lets parallel checkouts each use their own backend port.
    proxy: { '/api': process.env.PLANNER_API ?? 'http://localhost:8000' },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['src/test-setup.ts'],
  },
})

import { defineConfig } from '@playwright/test'

// End-to-end tests: the built app (the container in CI) in a phone-sized
// browser. They expect an empty database and the login password in
// E2E_PASSWORD. Run with: npm run e2e
export default defineConfig({
  testDir: 'e2e',
  testMatch: '*.e2e.ts',
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:8080',
    viewport: { width: 390, height: 844 },
    trace: 'retain-on-failure',
  },
})

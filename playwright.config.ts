import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  use: {
    baseURL: 'http://127.0.0.1:5173/draft-pattern-log/',
    browserName: 'chromium',
    channel: 'chrome',
    viewport: { width: 1280, height: 900 },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --port 5173 --strictPort',
    url: 'http://127.0.0.1:5173/draft-pattern-log/',
    reuseExistingServer: true,
    timeout: 30_000,
  },
})

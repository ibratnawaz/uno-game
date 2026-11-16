import { defineConfig } from '@playwright/test';

// Uses the locally installed Google Chrome (no browser download). Set E2E_CHANNEL=chromium
// after `npx playwright install chromium` to use Playwright's own build instead.
const channel = process.env.E2E_CHANNEL === 'chromium' ? undefined : 'chrome';

export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:4173', channel, trace: 'retain-on-failure' },
  webServer: {
    command:
      'npm run build && PORT=4173 DISCONNECT_GRACE_SECONDS=1 DATA_DIR=$(mktemp -d) npx tsx server/index.ts',
    url: 'http://localhost:4173/healthz',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});

import { defineConfig, devices } from "@playwright/test";

const frontendBaseURL =
  process.env.E2E_FRONTEND_BASE_URL ?? "http://127.0.0.1:3000";
const browserChannel = process.env.E2E_BROWSER_CHANNEL;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["html"], ["list"]] : "list",
  use: {
    baseURL: frontendBaseURL,
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1",
    url: frontendBaseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      VITE_API_BASE_URL:
        process.env.VITE_API_BASE_URL ??
        process.env.E2E_API_BASE_URL ??
        "http://127.0.0.1:8080",
      VITE_ENABLE_DEV_TOOLS: process.env.VITE_ENABLE_DEV_TOOLS ?? "true",
    },
  },
  projects: [
    {
      name: browserChannel ?? "chromium",
      use: {
        ...devices["Desktop Chrome"],
        ...(browserChannel ? { channel: browserChannel } : {}),
      },
    },
  ],
});

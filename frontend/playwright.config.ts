import { defineConfig, devices } from "@playwright/test";

const frontendPort = process.env.PLAYWRIGHT_PORT || "5178";

const apiPort = process.env.PLAYWRIGHT_API_PORT || "3001";

const baseURL = `http://127.0.0.1:${frontendPort}`;

const apiURL = `http://127.0.0.1:${apiPort}`;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  timeout: 30000,
  use: { baseURL, trace: "retain-on-failure" },
  webServer: [
    {
      command:
        process.env.PLAYWRIGHT_API_BINARY ||
        "cargo run --manifest-path ../backend/Cargo.toml --locked",
      env: { BIND_ADDRESS: `127.0.0.1:${apiPort}` },
      url: `${apiURL}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 300000,
    },
    {
      command: `npm run dev -- --port ${frontendPort} --strictPort`,
      env: { API_URL: apiURL },
      url: baseURL,
      reuseExistingServer: !process.env.CI,
    },
  ],
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});

import { defineConfig, devices } from "@playwright/test";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3010";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  expect: { timeout: 15_000, toHaveScreenshot: { animations: "disabled", maxDiffPixelRatio: 0.01 } },
  use: { baseURL, trace: "retain-on-failure", screenshot: "only-on-failure", video: "retain-on-failure", actionTimeout: 15_000 },
  webServer: process.env.E2E_BASE_URL ? undefined : {
    command: "npm run dev -- -p 3010",
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    { name: "chromium-desktop", use: { ...devices["Desktop Chrome"] }, testIgnore: /(responsive|visual-regression)\.spec\.ts/ },
    { name: "chromium-mobile", use: { ...devices["Pixel 7"] }, testMatch: /responsive\.spec\.ts/ },
    { name: "visual-chromium", use: { ...devices["Desktop Chrome"] }, testMatch: /visual-regression\.spec\.ts/ },
    { name: "visual-firefox", use: { browserName: "firefox", viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 }, testMatch: /visual-regression\.spec\.ts/ },
    { name: "visual-webkit", use: { ...devices["iPhone 13"] }, testMatch: /visual-regression\.spec\.ts/ },
  ],
});

// @ts-check
const fs = require("fs");
const { defineConfig } = require("@playwright/test");

// لو فيه Chromium متثبّت مسبقًا في البيئة (زي بيئة التطوير دي) استخدمه بدل ما
// Playwright يحاول ينزّل نسخة جديدة تتطابق مع رقم إصدار الـ npm package بالظبط.
const preinstalled = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome", "/opt/pw-browsers/chromium/chrome-linux/chrome"]
  .find((p) => fs.existsSync(p));

module.exports = defineConfig({
  testDir: "./tests",
  timeout: 30000,
  webServer: {
    command: "python3 -m http.server 8787",
    port: 8787,
    reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL: "http://localhost:8787",
    ...(preinstalled ? { launchOptions: { executablePath: preinstalled } } : {}),
  },
});

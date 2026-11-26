import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  // One Electron app at a time: the tests move a real window on a shared display.
  workers: 1,
  timeout: 60_000,
  reporter: "list",
});

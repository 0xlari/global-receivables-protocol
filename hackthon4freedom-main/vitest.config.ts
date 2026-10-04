import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@protocol": fileURLToPath(new URL("./packages/protocol/src", import.meta.url)),
      "@nostr": fileURLToPath(new URL("./packages/nostr/src", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    fileParallelism: false,
    hookTimeout: 30_000,
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}", "packages/*/src/**/*.test.{ts,tsx}"],
    maxWorkers: 1,
    testTimeout: 15_000,
  },
});

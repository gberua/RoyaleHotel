import "dotenv/config";
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tests/support/empty.ts", import.meta.url)),
    },
  },
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    environment: "node",
    // Integration tests run against a separate database, never the dev data
    env: { DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgresql://localhost:5432/royale_hotel_test" }, // set TEST_DATABASE_URL in .env
    fileParallelism: false,
    testTimeout: 60_000,
  },
});

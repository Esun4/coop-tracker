import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    // Server Actions and pure logic run in Node, not jsdom.
    environment: "node",
    // Load the throwaway test DB connection (and crypto key) before anything
    // imports src/lib/prisma.ts, which reads DATABASE_URL at module load.
    setupFiles: ["./tests/setup.ts"],
    // Integration tests share one Postgres container; keep them in a single
    // worker so per-test TRUNCATE doesn't race across parallel forks.
    fileParallelism: false,
    hookTimeout: 20000,
  },
});

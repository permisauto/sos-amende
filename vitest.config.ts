import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\/prisma\/(.*)$/, replacement: path.resolve(__dirname, "prisma/$1") },
      { find: /^@\/(.*)$/, replacement: path.resolve(__dirname, "src/$1") },
    ],
  },
  test: {
    include: ["src/**/*.test.ts"],
    globals: true,
  },
});
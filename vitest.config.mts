import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    server: {
      deps: {
        // next-auth ships ESM that imports "next/server" without an
        // extension; Node's resolver rejects that when the package is
        // externalized. Inlining lets Vite resolve those imports.
        inline: ["next-auth", "@auth/core"],
      },
    },
  },
});

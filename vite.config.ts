import { defineConfig } from "vitest/config";

// Site estático: `base: "./"` funciona em qualquer subcaminho (GitHub Pages em
// /mo-baile-web/). O servidor de desenvolvimento só escuta nesta máquina.
export default defineConfig({
  base: "./",
  server: { host: "127.0.0.1", strictPort: false },
  preview: { host: "127.0.0.1" },
  build: { outDir: "dist", sourcemap: false, assetsInlineLimit: 0 },
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
  },
});

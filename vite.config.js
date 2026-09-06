import { defineConfig } from "vite";

export default defineConfig({
  plugins: [],
  base: "./",
  server: {
    port: 5173,
    open: false,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});

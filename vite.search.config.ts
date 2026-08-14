import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist-search",
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: { input: "search.html" },
  },
});

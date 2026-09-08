import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: "/join/",
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true
  }
});

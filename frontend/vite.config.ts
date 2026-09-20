import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          motion: ["framer-motion", "motion/react"],
          charts: ["d3-scale", "d3-shape"],
          react: ["react", "react-dom", "react-dom/client"],
        },
      },
    },
  },
  server: {
    port: 5178,
    proxy: { "/api": process.env.API_URL || "http://127.0.0.1:3001" },
  },
});

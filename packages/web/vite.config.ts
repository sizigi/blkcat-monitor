import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      includeAssets: [
        "favicon.png",
        "favicon.gif",
        "blkcat.png",
        "blk_cat_cry.gif",
        "apple-touch-icon.png",
      ],
      manifest: {
        name: "BLKCAT Monitor",
        short_name: "BLKCAT",
        description: "Real-time CLI session monitor for Claude, Codex, and Gemini",
        display: "standalone",
        orientation: "any",
        start_url: "/",
        theme_color: "#0d1117",
        background_color: "#0d1117",
        icons: [
          { src: "pwa-icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "pwa-icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        navigateFallback: "index.html",
        runtimeCaching: [
          {
            urlPattern: /^https?:\/\/.*\/ws\//,
            handler: "NetworkOnly",
          },
          {
            urlPattern: /^https?:\/\/.*\/api\//,
            handler: "NetworkOnly",
          },
        ],
      },
    }),
  ],
  server: {
    host: "0.0.0.0",
    proxy: {
      "/ws": { target: "http://localhost:3000", ws: true },
      "/api": { target: "http://localhost:3000" },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
  },
});

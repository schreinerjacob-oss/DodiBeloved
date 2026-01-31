import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import fs from "fs";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

/** At build time, inject cache version into sw.js so each deploy gets a new cache. */
function swCacheVersion() {
  return {
    name: "sw-cache-version",
    closeBundle() {
      const outDir = path.resolve(import.meta.dirname, "dist/public");
      const swPath = path.join(outDir, "sw.js");
      if (!fs.existsSync(swPath)) return;
      const version = String(Date.now());
      let content = fs.readFileSync(swPath, "utf8");
      content = content.replace(/__CACHE_VERSION__/g, version);
      fs.writeFileSync(swPath, content);
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
    swCacheVersion(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer(),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    host: "0.0.0.0",
    port: 5000,
    allowedHosts: [
      "localhost",
      ".localhost",
      ".replit.app", // Replit Deployments
      ".repl.co", // Replit classic dev/live
      "frontend_web", // Replit internal proxy
    ],
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});

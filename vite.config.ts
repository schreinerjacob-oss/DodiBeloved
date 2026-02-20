import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import fs from "fs";

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

/** Load Replit plugins only when running on Replit (optional for Vercel/local). */
async function replitPlugins(): Promise<unknown[]> {
  if (process.env.NODE_ENV === "production" || process.env.REPL_ID === undefined) {
    return [];
  }
  try {
    const [runtimeErrorOverlay, cartographer, devBanner] = await Promise.all([
      import("@replit/vite-plugin-runtime-error-modal").then((m) => m.default()),
      import("@replit/vite-plugin-cartographer").then((m) => m.cartographer()),
      import("@replit/vite-plugin-dev-banner").then((m) => m.devBanner()),
    ]);
    return [runtimeErrorOverlay, cartographer, devBanner];
  } catch {
    return [];
  }
}

export default defineConfig(async () => ({
  plugins: [react(), swCacheVersion(), ...(await replitPlugins())],
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
      ".vercel.app",
      ".replit.app",
      ".repl.co",
      "frontend_web",
    ],
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
}));

import react from "@vitejs/plugin-react";
import { cpSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";

// The public Apps download page lives in ../apps-site/apps (one copy). This plugin serves it at /apps while developing
// and copies it into the build, so admin.deploymentportal.in/apps shows it without keeping a second copy.
const appsDir = resolve(__dirname, "../apps-site/apps");

function appsPage(): Plugin {
  return {
    name: "apps-page",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url && /^\/apps\/?(\?.*)?$/.test(req.url)) {
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.end(readFileSync(resolve(appsDir, "index.html")));
          return;
        }
        next();
      });
    },
    closeBundle() {
      if (existsSync(appsDir)) cpSync(appsDir, resolve(__dirname, "dist/apps"), { recursive: true });
    },
  };
}

export default defineConfig({ plugins: [react(), appsPage()] });

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [react(), cloudflare()],
  server: {
    port: 5173,
    strictPort: true,
    fs: {
      deny: [
        // Retain Vite's defaults when extending its filesystem denylist.
        ".env",
        ".env.*",
        "*.{crt,pem,key,p12,pfx,cer,der}",
        ".npmrc",
        ".yarnrc.yml",
        "**/.git/**",
        ".dev.vars*",
        ".local-*.json",
        ".pilot-*.json",
        "**/.wrangler/**",
        "**/.npm-cache/**",
        "**/.playwright-cli/**",
        "**/output/**",
      ],
    },
  },
});

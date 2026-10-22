import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer, type ViteDevServer } from "vite";
import config from "../vite.config";

describe("development filesystem boundary", () => {
  let server: ViteDevServer;
  let root: string;
  let base: string;
  const marker = "synthetic-private-marker";
  const privateFiles = [
    ".dev.vars", ".dev.vars.production", ".pilot-admin.json",
    ".pilot-browser.json", ".local-access.json", ".local-browser.json",
    ".wrangler/state/session.json", ".npm-cache/log.txt",
    ".playwright-cli/session.json", "output/session.json",
    ".env", ".env.local", ".npmrc", ".yarnrc.yml", "secret.pem", ".git/config",
  ];

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), "ai-coach-dev-files-"));
    for (const file of privateFiles) {
      await mkdir(path.dirname(path.join(root, file)), { recursive: true });
      await writeFile(path.join(root, file), marker);
    }
    await mkdir(path.join(root, "src"));
    await writeFile(path.join(root, "src/main.js"), "export const publicValue = 42;");
    await writeFile(path.join(root, "index.html"), '<html><body><script type="module" src="/src/main.js"></script></body></html>');
    // Exercise the real configured Vite filesystem boundary with synthetic
    // files, without starting a Worker or loading actual runtime credentials.
    server = await createServer({
      configFile: false, root, publicDir: false, logLevel: "silent",
      server: { ...config.server, host: "127.0.0.1", port: 0 },
    });
    await server.listen();
    const address = server.httpServer!.address();
    if (!address || typeof address === "string") throw new Error("Missing test listener");
    base = "http://127.0.0.1:" + address.port;
  });

  afterAll(async () => {
    await server?.close();
    if (root) {
      const resolved = path.resolve(root);
      if (
        path.dirname(resolved) !== path.resolve(tmpdir()) ||
        !path.basename(resolved).startsWith("ai-coach-dev-files-")
      ) throw new Error("Unexpected test fixture directory");
      await rm(resolved, { recursive: true, force: true });
    }
  });

  it("denies private files through static, raw, encoded and absolute paths", async () => {
    for (const file of privateFiles) {
      const urls = [
        "/" + file,
        "/" + file + "?raw",
        "/" + file.replaceAll(".", "%2e"),
        "/@fs/" + path.join(root, file).replaceAll("\\", "/"),
        "/@fs/" + path.join(root, file).replaceAll("\\", "/") + "?raw",
      ];
      await Promise.all(urls.map(async (url) => {
        const response = await fetch(base + url);
        expect(response.status, url).toBe(403);
        expect(await response.text(), url).not.toContain(marker);
      }));
    }
  }, 15000);

  it("keeps ordinary HTML, source modules and the HMR client available", async () => {
    for (const url of ["/index.html", "/src/main.js", "/@vite/client"]) {
      expect((await fetch(base + url)).status, url).toBe(200);
    }
  });
});

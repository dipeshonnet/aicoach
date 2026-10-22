import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = new URL("../", import.meta.url);
const variables = Object.fromEntries(
  readFileSync(new URL(".dev.vars", root), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [
        l.slice(0, i).trim(),
        l
          .slice(i + 1)
          .trim()
          .replace(/^['"]|['"]$/g, ""),
      ];
    }),
);
if (!variables.GROQ_API_KEY)
  throw new Error("Configure GROQ_API_KEY privately in .dev.vars first.");
const privatePath = new URL(".pilot-runtime.json", root);
const runtime = existsSync(privatePath)
  ? JSON.parse(readFileSync(privatePath, "utf8"))
  : {
      authSecret: randomBytes(32).toString("base64url"),
      bootstrapToken: randomBytes(32).toString("base64url"),
    };
writeFileSync(privatePath, JSON.stringify(runtime), { mode: 0o600 });
const secrets = {
  BETTER_AUTH_SECRET: runtime.authSecret,
  ...(!runtime.initialized ? { BOOTSTRAP_TOKEN: runtime.bootstrapToken } : {}),
  GROQ_API_KEY: variables.GROQ_API_KEY,
};
const child = spawn(
  process.execPath,
  [
    fileURLToPath(new URL("node_modules/wrangler/bin/wrangler.js", root)),
    "secret",
    "bulk",
    "--name",
    "ai-coach-pilot",
  ],
  {
    cwd: fileURLToPath(root),
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      WRANGLER_LOG_PATH: fileURLToPath(new URL(".wrangler/logs", root)),
      WRANGLER_SEND_METRICS: "false",
    },
    windowsHide: true,
  },
);
let output = "";
child.stdout.on("data", (chunk) => (output += chunk));
child.stderr.on("data", (chunk) => (output += chunk));
child.stdin.end(JSON.stringify(secrets));
const code = await new Promise((resolve, reject) => {
  child.on("error", reject);
  child.on("close", resolve);
});
if (code !== 0) {
  for (const secret of Object.values(secrets))
    output = output.split(secret).join("[redacted]");
  console.error(output);
  process.exitCode = 1;
} else
  console.log("Configured hosted runtime secrets. Secret values are hidden.");

import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
const path = new URL("../.dev.vars", import.meta.url);
let text = existsSync(path) ? readFileSync(path, "utf8") : "";
for (const name of ["BETTER_AUTH_SECRET", "BOOTSTRAP_TOKEN"]) {
  const existing =
    text
      .match(new RegExp("^" + name + "=(.*)$", "m"))?.[1]
      ?.trim()
      .replace(/^['"]|['"]$/g, "") || "";
  if (existing.length < 32 || existing.startsWith("generate-")) {
    text = text.replace(new RegExp("^" + name + "=.*(?:\r?\n|$)", "m"), "");
    text += "\n" + name + "=" + randomBytes(32).toString("base64url") + "\n";
  }
}
if (!/^GROQ_API_KEY=.+$/m.test(text) && process.env.GROQ_API_KEY)
  text += "\nGROQ_API_KEY=" + process.env.GROQ_API_KEY + "\n";
if (!/^APP_URL=/m.test(text)) text += "\nAPP_URL=http://127.0.0.1:5173\n";
writeFileSync(path, text.trim() + "\n", { mode: 0o600 });
console.log(
  "Local configuration is ready in .dev.vars. Secret values are hidden.",
);
console.log(
  "Groq key: " +
    (/^GROQ_API_KEY=.+$/m.test(text)
      ? "present (not validated)"
      : "not configured"),
);

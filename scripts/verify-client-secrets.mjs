import { readFileSync, readdirSync } from "node:fs";
const env = readFileSync(new URL("../.dev.vars", import.meta.url), "utf8");
const names = ["GROQ_API_KEY", "BETTER_AUTH_SECRET", "BOOTSTRAP_TOKEN"];
const values = env
  .split(/\r?\n/)
  .flatMap((line) => {
    const i = line.indexOf("=");
    return names.includes(line.slice(0, i).trim())
      ? [
          line
            .slice(i + 1)
            .trim()
            .replace(/^['"]|['"]$/g, ""),
        ]
      : [];
  })
  .filter((value) => value.length > 10);
const walk = (url) =>
  readdirSync(url, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? walk(new URL(entry.name + "/", url))
      : [new URL(entry.name, url)],
  );
for (const path of walk(new URL("../dist/client/", import.meta.url))) {
  const text = readFileSync(path, "utf8");
  if (values.some((value) => text.includes(value)))
    throw new Error("A secret was found in a client build artifact.");
}
console.log("Client build verified: runtime secret values are absent.");

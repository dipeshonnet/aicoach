import { readFileSync, writeFileSync } from "node:fs";
const hosted = process.argv.includes("--hosted"),
  learner = process.argv.includes("--learner");
const base = hosted
  ? "https://ai-coach-pilot.dipeshonnet.workers.dev"
  : "http://127.0.0.1:5173";
const credentials = JSON.parse(
  readFileSync(
    new URL(
      "../" +
        (hosted
          ? learner
            ? ".pilot-learner.json"
            : ".pilot-admin.json"
          : learner
            ? ".local-learner.json"
            : ".local-access.json"),
      import.meta.url,
    ),
    "utf8",
  ),
);
const response = await fetch(base + "/api/auth/sign-in/email", {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: base },
  body: JSON.stringify({
    email: credentials.email,
    password: credentials.password,
  }),
});
if (!response.ok) {
  console.error("Local browser sign-in failed (HTTP " + response.status + ").");
  process.exit(1);
}
const cookies = response.headers.getSetCookie().map((line) => {
  const pair = line.split(";")[0],
    index = pair.indexOf("=");
  return {
    name: pair.slice(0, index),
    value: pair.slice(index + 1),
    domain: new URL(base).hostname,
    path: "/",
    httpOnly: true,
    secure: hosted,
    sameSite: "Lax",
    expires: -1,
  };
});
writeFileSync(
  new URL(
    "../" +
      (hosted
        ? learner
          ? ".pilot-learner-browser.json"
          : ".pilot-browser.json"
        : ".local-browser.json"),
    import.meta.url,
  ),
  JSON.stringify({ cookies, origins: [] }),
  { mode: 0o600 },
);
console.log("Private local browser state saved; cookie values are hidden.");

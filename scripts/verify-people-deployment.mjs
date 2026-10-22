import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const base = "https://ai-coach-pilot.dipeshonnet.workers.dev";
async function signIn(file) {
  const { email, password } = JSON.parse(readFileSync(new URL("../" + file, import.meta.url), "utf8"));
  const response = await fetch(base + "/api/auth/sign-in/email", {
    method: "POST", headers: { Origin: base, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  assert(response.ok, "Production sign-in failed.");
  return response.headers.getSetCookie().map((cookie) => cookie.split(";")[0]).join("; ");
}
async function importRequest(cookie, csv) {
  return fetch(base + "/api/users/import", {
    method: "POST", headers: { Origin: base, Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ csv }),
  });
}
assert.equal((await fetch(base + "/api/health")).status, 200);
assert.equal((await importRequest("", "name,email")).status, 401);
const admin = await signIn(".pilot-admin.json");
// Invalid structure exercises the deployed route without creating or updating people.
const invalid = await importRequest(admin, "name,email\nBroken");
assert.equal(invalid.status, 400);
assert.match((await invalid.json()).error, /wrong number of columns/);
const learner = await signIn(".pilot-learner.json");
assert.equal((await importRequest(learner, "name,email\nExample,example@example.com")).status, 403);
console.log("Production people import checks passed: health, admin validation, session requirement, and agent denial. No people were changed.");

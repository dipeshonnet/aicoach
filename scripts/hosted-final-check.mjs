import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const base = "https://ai-coach-pilot.dipeshonnet.workers.dev";
const read = (name) =>
  JSON.parse(readFileSync(new URL("../" + name, import.meta.url), "utf8"));
async function session(credentials) {
  const signed = await fetch(base + "/api/auth/sign-in/email", {
    method: "POST",
    headers: { Origin: base, "Content-Type": "application/json" },
    body: JSON.stringify({
      email: credentials.email,
      password: credentials.password,
    }),
  });
  assert(signed.ok, "Hosted sign-in failed.");
  const cookie = signed.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  return async (path) => {
    const response = await fetch(base + "/api" + path, {
      headers: { Origin: base, Cookie: cookie },
    });
    assert(response.ok, "Hosted read failed at " + path);
    return response.json();
  };
}
const status = await (await fetch(base + "/api/setup/status")).json();
assert.equal(status.needsSetup, false);
assert.equal(status.bootstrapConfigured, false);
const admin = await session(read(".pilot-admin.json"));
const learner = await session(read(".pilot-learner.json"));
const staff = await admin("/overview"),
  progress = await learner("/overview");
assert.equal(staff.user.role, "admin");
assert.equal(staff.aiConfigured, true);
assert(
  progress.assignments.length >= 2 &&
    progress.assignments.every((a) => a.completed),
);
const front = progress.assignments.find((a) => a.office === "front");
assert.deepEqual([...front.completedChannels].sort(), ["chat", "voice"]);
const attempt = progress.attempts.find(
  (a) => a.mode === "assessment" && a.status === "approved",
);
assert(attempt);
assert(!("reviewContext" in (await learner("/attempts/" + attempt.id))));
assert((await admin("/attempts/" + attempt.id)).reviewContext.reference);
console.log(
  "Final hosted checks passed: authentication, AI configuration, trainer reference access, learner redaction, retained approvals and completion, and disabled initial setup.",
);

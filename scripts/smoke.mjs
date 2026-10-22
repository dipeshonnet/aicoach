import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
const base = process.env.COACH_TEST_URL || "http://127.0.0.1:5173";
assert(
  new URL(base).hostname === "127.0.0.1" ||
    new URL(base).hostname === "localhost",
  "Smoke data is only created on a local server.",
);
const env = Object.fromEntries(
  readFileSync(new URL("../.dev.vars", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1).replace(/^['"]|['"]$/g, "")];
    }),
);
const statePath = new URL("../.local-access.json", import.meta.url);
let admin = existsSync(statePath)
  ? JSON.parse(readFileSync(statePath, "utf8"))
  : {
      email: "pilot-admin@example.test",
      password: randomBytes(24).toString("base64url"),
    };
function browser() {
  let cookie = "";
  return async (path, method = "GET", body, expected = 200) => {
    const response = await fetch(base + "/api" + path, {
      method,
      headers: {
        Origin: base,
        ...(cookie ? { Cookie: cookie } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const setCookies = response.headers.getSetCookie();
    if (setCookies.length)
      cookie = setCookies.map((c) => c.split(";")[0]).join("; ");
    assert(
      response.headers.get("content-type")?.includes("application/json"),
      "Non-JSON response for " +
        method +
        " " +
        path +
        " (HTTP " +
        response.status +
        ")",
    );
    const result = await response.json();
    assert.equal(
      response.status,
      expected,
      "Unexpected status for " +
        method +
        " " +
        path +
        ": " +
        String(result.error || result.message || "Unexpected response"),
    );
    return result;
  };
}
const manager = browser(),
  publicApi = browser();
const status = await publicApi("/setup/status");
if (status.needsSetup) {
  await publicApi(
    "/setup",
    "POST",
    { name: "Pilot Admin", ...admin, token: env.BOOTSTRAP_TOKEN },
    201,
  );
  writeFileSync(statePath, JSON.stringify(admin), { mode: 0o600 });
}
await manager("/auth/sign-in/email", "POST", admin);
const overview = await manager("/overview");
assert.equal(overview.user.role, "admin");
assert(overview.scenarios.length >= 2);
const suffix = randomUUID().slice(0, 8),
  password = randomBytes(24).toString("base64url");
const agent = await manager(
  "/users",
  "POST",
  {
    name: "Maya Patel",
    email: "maya-" + suffix + "@example.test",
    password,
    role: "agent",
    processIds: [],
  },
  201,
);
const outsider = await manager(
  "/users",
  "POST",
  {
    name: "Other Agent",
    email: "other-" + suffix + "@example.test",
    password,
    role: "agent",
    processIds: [],
  },
  201,
);
const trainer = await manager(
  "/users",
  "POST",
  {
    name: "Alex Trainer",
    email: "trainer-" + suffix + "@example.test",
    password,
    role: "trainer",
    processIds: ["process-retail"],
  },
  201,
);
writeFileSync(
  new URL("../.local-learner.json", import.meta.url),
  JSON.stringify({ email: "maya-" + suffix + "@example.test", password }),
  { mode: 0o600 },
);
const batch = await manager(
  "/batches",
  "POST",
  {
    name: "Pilot cohort " + suffix,
    processId: "process-retail",
    members: [agent.id],
  },
  201,
);
const front = await manager(
  "/assignments",
  "POST",
  {
    scenarioId: "scenario-refund",
    batchId: batch.id,
    channels: ["chat", "voice"],
  },
  201,
);
const back = await manager(
  "/assignments",
  "POST",
  { scenarioId: "scenario-invoice", batchId: batch.id, channels: ["workflow"] },
  201,
);
const learner = browser(),
  other = browser(),
  reviewer = browser();
await learner("/auth/sign-in/email", "POST", {
  email: "maya-" + suffix + "@example.test",
  password,
});
await other("/auth/sign-in/email", "POST", {
  email: "other-" + suffix + "@example.test",
  password,
});
await reviewer("/auth/sign-in/email", "POST", {
  email: "trainer-" + suffix + "@example.test",
  password,
});
await learner(
  "/users",
  "POST",
  { name: "Not allowed", email: "bad@example.test", password, role: "admin" },
  403,
);
await learner("/scenarios/scenario-invoice", "GET", undefined, 403);
await other(
  "/attempts",
  "POST",
  { assignmentId: back.ids[0], channel: "workflow", mode: "assessment" },
  403,
);
const attempt = await learner(
  "/attempts",
  "POST",
  { assignmentId: back.ids[0], channel: "workflow", mode: "assessment" },
  201,
);
let detail = await learner("/attempts/" + attempt.id);
assert(!("reviewContext" in detail));
assert((await reviewer("/attempts/" + attempt.id)).reviewContext.reference);
assert(!JSON.stringify(detail.scenario).includes("DUPLICATE"));
assert(!JSON.stringify(detail.scenario).includes("accepted"));
await other("/attempts/" + attempt.id, "GET", undefined, 403);
await learner("/attempts/" + attempt.id + "/coach", "POST", {}, 403);
const eventId = randomUUID(),
  first = {
    requestId: eventId,
    stepId: "scenario-invoice-step-0",
    hotspotId: "scenario-invoice-action-0",
  };
await learner("/attempts/" + attempt.id + "/actions", "POST", first);
await learner("/attempts/" + attempt.id + "/actions", "POST", first);
detail = await learner("/attempts/" + attempt.id);
assert.equal(detail.events.length, 1);
await learner(
  "/attempts/" + attempt.id + "/actions",
  "POST",
  { ...first, requestId: randomUUID() },
  409,
);
await learner("/attempts/" + attempt.id + "/actions", "POST", {
  requestId: randomUUID(),
  stepId: "scenario-invoice-step-1",
  hotspotId: "scenario-invoice-action-1",
  value: " duplicate ",
});
await learner("/attempts/" + attempt.id + "/actions", "POST", {
  requestId: randomUUID(),
  stepId: "scenario-invoice-step-2",
  hotspotId: "scenario-invoice-action-2",
});
const submitId = randomUUID(),
  graded = await learner("/attempts/" + attempt.id + "/submit", "POST", {
    requestId: submitId,
  });
assert.equal(graded.result.score, 100);
assert.equal(graded.result.passed, true);
await learner("/attempts/" + attempt.id + "/submit", "POST", {
  requestId: submitId,
});
await learner(
  "/attempts/" + attempt.id + "/review",
  "POST",
  { decision: "approved", note: "" },
  403,
);
assert.equal(
  (await learner("/overview")).assignments.find((a) => a.id === back.ids[0])
    .completed,
  false,
);
await reviewer("/attempts/" + attempt.id + "/review", "POST", {
  decision: "approved",
  note: "Clear and accurate processing.",
});
assert.equal(
  (await learner("/overview")).assignments.find((a) => a.id === back.ids[0])
    .completed,
  true,
);
assert.equal(
  (await learner("/overview")).assignments.find((a) => a.id === front.ids[0])
    .completed,
  false,
);
// Published history remains fixed when the current draft changes.
const original = await manager("/scenarios/scenario-invoice");
await manager("/scenarios/scenario-invoice", "PUT", {
  revision: original.draft_revision,
  content: { ...original.draft, title: "Invoice exceptions · updated draft" },
});
assert.equal(
  (await learner("/attempts/" + attempt.id)).scenario.title,
  "Process an invoice exception",
);
const latest = await manager("/scenarios/scenario-invoice");
await manager("/scenarios/scenario-invoice", "PUT", {
  revision: latest.draft_revision,
  content: original.draft,
});
// A failed assessment remains in the history when a new attempt starts.
const failed = await learner(
  "/attempts",
  "POST",
  { assignmentId: back.ids[0], channel: "workflow", mode: "assessment" },
  201,
);
const failResult = await learner("/attempts/" + failed.id + "/submit", "POST", {
  requestId: randomUUID(),
});
assert.equal(failResult.result.passed, false);
await reviewer(
  "/attempts/" + failed.id + "/review",
  "POST",
  { decision: "approved", note: "" },
  400,
);
await reviewer("/attempts/" + failed.id + "/review", "POST", {
  decision: "retry",
  note: "Complete reference verification before submitting.",
});
await learner(
  "/attempts",
  "POST",
  { assignmentId: back.ids[0], channel: "workflow", mode: "assessment" },
  201,
);
assert.equal((await learner("/attempts/" + failed.id)).status, "retry");
// Enforce process boundaries for trainers.
const second = await manager(
  "/processes",
  "POST",
  {
    name: "Separate process " + suffix,
    client: "Separate client",
    description: "",
  },
  201,
);
await reviewer(
  "/scenarios",
  "POST",
  { processId: second.id, content: original.draft },
  403,
);
await manager("/users/" + outsider.id, "PATCH", { banned: true });
await other("/overview", "GET", undefined, 401);
if (process.env.COACH_LIVE_AI === "1") {
  const chat = await learner(
    "/attempts",
    "POST",
    { assignmentId: front.ids[0], channel: "chat", mode: "practice" },
    201,
  );
  const turnRequest = randomUUID();
  const turn = await learner("/attempts/" + chat.id + "/turns", "POST", {
    requestId: turnRequest,
    text: "I am sorry your order is late. I can help. Could you confirm your customer reference?",
  });
  assert(turn.customerText?.length > 0);
  await learner("/attempts/" + chat.id + "/turns", "POST", {
    requestId: turnRequest,
    text: "I am sorry your order is late. I can help. Could you confirm your customer reference?",
  });
  assert.equal((await learner("/attempts/" + chat.id)).turns.length, 1);
  const coaching = await learner("/attempts/" + chat.id + "/coach", "POST", {});
  assert(coaching.feedback?.length > 0);
  console.log("Live Groq customer reply and coaching passed.");
}
writeFileSync(
  new URL("../.local-learner.json", import.meta.url),
  JSON.stringify({
    email: "maya-" + suffix + "@example.test",
    password,
    assignmentId: back.ids[0],
    frontAssignmentId: front.ids[0],
    attemptId: attempt.id,
  }),
  { mode: 0o600 },
);
console.log(
  "Local smoke checks passed: accounts, roles, process isolation, action validation, idempotency, version history, scoring, retry history, trainer approval and per-channel completion.",
);
console.log(
  "Local test credentials are stored in ignored .local-access.json and .local-learner.json; secret values were not printed.",
);

import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";
const base = "https://ai-coach-pilot.dipeshonnet.workers.dev";
const privatePath = new URL("../.pilot-admin.json", import.meta.url),
  runtime = JSON.parse(
    readFileSync(new URL("../.pilot-runtime.json", import.meta.url), "utf8"),
  );
const admin = existsSync(privatePath)
  ? JSON.parse(readFileSync(privatePath, "utf8"))
  : {
      name: "Dipesh",
      email: "dipeshonnet@gmail.com",
      password: randomBytes(24).toString("base64url"),
      url: base,
    };
function session() {
  let cookie = "";
  const call = async (path, method = "GET", body, status = 200) => {
    const response = await fetch(base + "/api" + path, {
      method,
      headers: {
        Origin: base,
        ...(cookie ? { Cookie: cookie } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (response.headers.getSetCookie().length)
      cookie = response.headers
        .getSetCookie()
        .map((c) => c.split(";")[0])
        .join("; ");
    const json = await response
      .json()
      .catch(() => ({ error: "Non-JSON server response" }));
    assert.equal(
      response.status,
      status,
      "Hosted check " +
        method +
        " " +
        path +
        " failed: HTTP " +
        response.status +
        " " +
        String(json.error || json.message || ""),
    );
    return json;
  };
  call.cookie = () => cookie;
  return call;
}
try {
  const owner = session(),
    publicApi = session();
  assert.equal((await publicApi("/health")).ok, true);
  const setup = await publicApi("/setup/status");
  if (setup.needsSetup) {
    writeFileSync(privatePath, JSON.stringify(admin), { mode: 0o600 });
    await publicApi(
      "/setup",
      "POST",
      {
        name: admin.name,
        email: admin.email,
        password: admin.password,
        token: runtime.bootstrapToken,
      },
      201,
    );
  }
  await owner("/auth/sign-in/email", "POST", {
    email: admin.email,
    password: admin.password,
  });
  const overview = await owner("/overview");
  assert.equal(overview.user.role, "admin");
  assert(overview.aiConfigured);
  assert.equal(overview.scenarios.length >= 2, true);
  const credential = owner
    .cookie()
    .split("; ")
    .map((pair) => {
      const i = pair.indexOf("=");
      return {
        name: pair.slice(0, i),
        value: pair.slice(i + 1),
        domain: new URL(base).hostname,
        path: "/",
        httpOnly: true,
        secure: true,
        sameSite: "Lax",
        expires: -1,
      };
    });
  writeFileSync(
    new URL("../.pilot-browser.json", import.meta.url),
    JSON.stringify({ cookies: credential, origins: [] }),
    { mode: 0o600 },
  );
  const suffix = randomUUID().slice(0, 8),
    password = randomBytes(24).toString("base64url");
  const user = await owner(
    "/users",
    "POST",
    {
      name: "Pilot verification agent",
      email: "verify-" + suffix + "@example.test",
      password,
      role: "agent",
      processIds: [],
    },
    201,
  );
  const learner = session();
  await learner("/auth/sign-in/email", "POST", {
    email: "verify-" + suffix + "@example.test",
    password,
  });
  await learner("/scenarios/scenario-invoice", "GET", undefined, 403);
  const screenshot = await fetch(
    base + "/api/assets/scenario-invoice-screen-0",
    { headers: { Cookie: owner.cookie() } },
  );
  assert.equal(screenshot.status, 200);
  assert((await screenshot.text()).includes("<svg"));
  const privateScreenshot = await fetch(
    base + "/api/assets/scenario-invoice-screen-0",
  );
  assert.equal(privateScreenshot.status, 401);
  const back = await owner(
    "/assignments",
    "POST",
    { scenarioId: "scenario-invoice", userId: user.id, channels: ["workflow"] },
    201,
  );
  const attempt = await learner(
    "/attempts",
    "POST",
    { assignmentId: back.ids[0], channel: "workflow", mode: "assessment" },
    201,
  );
  const detail = await learner("/attempts/" + attempt.id);
  assert(!JSON.stringify(detail.scenario).includes("DUPLICATE"));
  for (let i = 0; i < 3; i++)
    await learner("/attempts/" + attempt.id + "/actions", "POST", {
      requestId: randomUUID(),
      stepId: "scenario-invoice-step-" + i,
      hotspotId: "scenario-invoice-action-" + i,
      ...(i === 1 ? { value: "DUPLICATE" } : {}),
    });
  const graded = await learner("/attempts/" + attempt.id + "/submit", "POST", {
    requestId: randomUUID(),
  });
  assert.equal(graded.result.passed, true);
  await owner("/attempts/" + attempt.id + "/review", "POST", {
    decision: "approved",
    note: "Hosted pilot verification: correct procedure, evidence saved, completion approved.",
  });
  assert.equal(
    (await learner("/overview")).assignments.find((a) => a.id === back.ids[0])
      .completed,
    true,
  );
  const front = await owner(
    "/assignments",
    "POST",
    {
      scenarioId: "scenario-refund",
      userId: user.id,
      channels: ["chat", "voice"],
    },
    201,
  );
  const chat = await learner(
    "/attempts",
    "POST",
    { assignmentId: front.ids[0], channel: "chat", mode: "practice" },
    201,
  );
  const turn = await learner("/attempts/" + chat.id + "/turns", "POST", {
    requestId: randomUUID(),
    text: "I am sorry your order has not arrived. Could you confirm your customer reference so I can help?",
  });
  assert(turn.customerText.length > 0);
  const voice = await learner(
    "/attempts",
    "POST",
    { assignmentId: front.ids[0], channel: "voice", mode: "practice" },
    201,
  );
  const speech = await fetch(base + "/api/attempts/" + voice.id + "/speech", {
    method: "POST",
    headers: {
      Cookie: learner.cookie(),
      Origin: base,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ turnId: null, chunk: 0 }),
  });
  assert.equal(speech.status, 200);
  assert((await speech.arrayBuffer()).byteLength > 1000);
  writeFileSync(
    new URL("../.pilot-learner.json", import.meta.url),
    JSON.stringify({
      email: "verify-" + suffix + "@example.test",
      password,
      userId: user.id,
      frontAssignmentId: front.ids[0],
      voiceAttemptId: voice.id,
    }),
    { mode: 0o600 },
  );
  console.log(
    "Hosted verification passed: admin and agent sign-in, private R2 screenshots, role restrictions, action validation, assessment, trainer approval, saved completion, live Groq chat and speech.",
  );
  console.log(
    "Administrator credentials are saved privately in .pilot-admin.json. Password and session values are hidden.",
  );
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Hosted verification failed.",
  );
  process.exitCode = 1;
}

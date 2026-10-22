import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import Groq from "groq-sdk";
const base = "https://ai-coach-pilot.dipeshonnet.workers.dev";
const learner = JSON.parse(
  readFileSync(new URL("../.pilot-learner.json", import.meta.url), "utf8"),
);
const owner = JSON.parse(
  readFileSync(new URL("../.pilot-admin.json", import.meta.url), "utf8"),
);
function session() {
  let cookie = "";
  return async (path, body) => {
    const form = body instanceof FormData;
    const r = await fetch(base + "/api" + path, {
      method: body ? "POST" : "GET",
      headers: {
        Origin: base,
        ...(cookie ? { Cookie: cookie } : {}),
        ...(body && !form ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? (form ? body : JSON.stringify(body)) : undefined,
      signal: AbortSignal.timeout(180000),
    });
    if (r.headers.getSetCookie().length)
      cookie = r.headers
        .getSetCookie()
        .map((c) => c.split(";")[0])
        .join("; ");
    const data = await r.json();
    assert(
      r.ok,
      "Hosted AI check failed at " +
        path +
        ": " +
        String(data.error || data.message || r.status),
    );
    return data;
  };
}
const actor = session(),
  admin = session();
try {
  await actor("/auth/sign-in/email", {
    email: learner.email,
    password: learner.password,
  });
  await admin("/auth/sign-in/email", {
    email: owner.email,
    password: owner.password,
  });
  const variables = Object.fromEntries(
    readFileSync(new URL("../.dev.vars", import.meta.url), "utf8")
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
  const groq = new Groq({
    apiKey: variables.GROQ_API_KEY,
    maxRetries: 0,
    timeout: 60000,
  });
  const messages = [
    "I am sorry your order has not arrived. I can help. Could you confirm your customer reference, please?",
    "Thank you. Your reference is verified. Your order BR-7024 is seven days late. You are eligible for a full 49 dollar refund.",
    "I have processed your full refund. Please allow three to five business days for the credit. Is there anything else I can help you with?",
  ];
  for (const channel of ["chat", "voice"]) {
    const attempt = await actor("/attempts", {
      assignmentId: learner.frontAssignmentId,
      channel,
      mode: "assessment",
    });
    for (let i = 0; i < 3; i++) {
      if (i === 2)
        await actor("/attempts/" + attempt.id + "/actions", {
          requestId: randomUUID(),
          stepId: "scenario-refund-step-2",
          hotspotId: "scenario-refund-action-2",
        });
      if (channel === "chat")
        await actor("/attempts/" + attempt.id + "/turns", {
          requestId: randomUUID(),
          text: messages[i],
        });
      else {
        const response = await groq.audio.speech.create({
          model: "canopylabs/orpheus-v1-english",
          voice: "troy",
          input: messages[i],
          response_format: "wav",
        });
        const form = new FormData();
        form.set("requestId", randomUUID());
        form.set(
          "audio",
          new File([await response.arrayBuffer()], "agent.wav", {
            type: "audio/wav",
          }),
        );
        const turn = await actor("/attempts/" + attempt.id + "/turns", form);
        assert(turn.agentText.length > 0 && turn.customerText.length > 0);
      }
      if (i < 2)
        await actor("/attempts/" + attempt.id + "/actions", {
          requestId: randomUUID(),
          stepId: "scenario-refund-step-" + i,
          hotspotId: "scenario-refund-action-" + i,
          ...(i === 1 ? { value: "BR-7024" } : {}),
        });
    }
    const graded = await actor("/attempts/" + attempt.id + "/submit", {
      requestId: randomUUID(),
    });
    assert(
      graded.result.passed,
      "The correct " + channel + " assessment did not pass.",
    );
    await admin("/attempts/" + attempt.id + "/review", {
      decision: "approved",
      note: "Hosted verification: complete procedure, policy-accurate resolution, saved transcript, and trainer-approved readiness.",
    });
    console.log(
      "Hosted " +
        channel +
        " assessment, evidence and approval passed. Score: " +
        graded.result.score +
        "%.",
    );
  }
  const progress = await actor("/overview"),
    front = progress.assignments.find(
      (a) => a.id === learner.frontAssignmentId,
    );
  assert.deepEqual([...front.completedChannels].sort(), ["chat", "voice"]);
  assert.equal(front.completed, true);
  assert(progress.assignments.every((a) => a.completed));
  console.log(
    "Hosted agent completion verified across workflow, chat and voice, with persisted trainer decisions.",
  );
} catch (error) {
  if (error instanceof Groq.APIError)
    console.error("Groq fixture synthesis failed (HTTP " + error.status + ").");
  else
    console.error(
      error instanceof Error ? error.message : "Hosted AI check failed.",
    );
  process.exitCode = 1;
}

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import Groq from "groq-sdk";
const base = "http://127.0.0.1:5173";
const credentials = JSON.parse(
  readFileSync(new URL("../.local-learner.json", import.meta.url), "utf8"),
);
let cookie = "";
async function call(path, body) {
  const form = body instanceof FormData;
  const response = await fetch(base + "/api" + path, {
    method: body ? "POST" : "GET",
    headers: {
      Origin: base,
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body && !form ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? (form ? body : JSON.stringify(body)) : undefined,
  });
  if (response.headers.getSetCookie().length)
    cookie = response.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
  const data = await response.json();
  assert(
    response.ok,
    "AI check failed at " +
      path +
      " (HTTP " +
      response.status +
      "): " +
      String(data.error || data.message || "request failed"),
  );
  return data;
}
try {
  await call("/auth/sign-in/email", {
    email: credentials.email,
    password: credentials.password,
  });
  if (process.env.COACH_VOICE_ONLY !== "1") {
    const chat = await call("/attempts", {
      assignmentId: credentials.frontAssignmentId,
      channel: "chat",
      mode: "assessment",
    });
    const firstRequest = randomUUID(),
      text =
        "I am sorry your order has not arrived. I can help with this. Could you confirm your customer reference, please?";
    const first = await call("/attempts/" + chat.id + "/turns", {
      requestId: firstRequest,
      text,
    });
    assert(first.customerText.length > 0);
    await call("/attempts/" + chat.id + "/turns", {
      requestId: firstRequest,
      text,
    });
    assert.equal((await call("/attempts/" + chat.id)).turns.length, 1);
    await call("/attempts/" + chat.id + "/actions", {
      requestId: randomUUID(),
      stepId: "scenario-refund-step-0",
      hotspotId: "scenario-refund-action-0",
    });
    await call("/attempts/" + chat.id + "/turns", {
      requestId: randomUUID(),
      text: "Thank you. Your reference is verified. Your order BR-7024 is seven days late, so I will arrange a full USD 49.00 refund.",
    });
    await call("/attempts/" + chat.id + "/actions", {
      requestId: randomUUID(),
      stepId: "scenario-refund-step-1",
      hotspotId: "scenario-refund-action-1",
      value: "BR-7024",
    });
    await call("/attempts/" + chat.id + "/actions", {
      requestId: randomUUID(),
      stepId: "scenario-refund-step-2",
      hotspotId: "scenario-refund-action-2",
    });
    await call("/attempts/" + chat.id + "/turns", {
      requestId: randomUUID(),
      text: "I have processed your full refund. Please allow 3 to 5 business days for the credit. Is there anything else I can help you with today?",
    });
    const assessment = await call("/attempts/" + chat.id + "/submit", {
      requestId: randomUUID(),
    });
    assert(assessment.result.criteria.some((c) => c.key === "communication"));
    assert(Number.isFinite(assessment.result.score));
    console.log(
      "Live Groq chat, duplicate-turn handling and structured assessment passed. Score: " +
        assessment.result.score +
        "%.",
    );
  }
  const practice = await call("/attempts", {
    assignmentId: credentials.frontAssignmentId,
    channel: "voice",
    mode: "practice",
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
    timeout: 60000,
    maxRetries: 1,
  });
  const generated = await groq.audio.speech.create({
    model: "canopylabs/orpheus-v1-english",
    voice: "troy",
    input:
      "I am sorry your order has not arrived. Could you confirm your customer reference so I can help?",
    response_format: "wav",
  });
  const audio = await generated.arrayBuffer(),
    form = new FormData();
  form.set("requestId", randomUUID());
  form.set("audio", new File([audio], "practice.wav", { type: "audio/wav" }));
  const voice = await call("/attempts/" + practice.id + "/turns", form);
  assert(voice.agentText.length > 0 && voice.customerText.length > 0);
  const response = await fetch(
    base + "/api/attempts/" + practice.id + "/speech",
    {
      method: "POST",
      headers: {
        Cookie: cookie,
        Origin: base,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ turnId: voice.id, chunk: 0 }),
    },
  );
  assert(
    response.ok,
    "Customer speech endpoint failed (HTTP " + response.status + ").",
  );
  assert((await response.arrayBuffer()).byteLength > 1000);
  const coaching = await call("/attempts/" + practice.id + "/coach", {});
  assert(coaching.feedback.length > 0);
  console.log(
    "Live Groq voice synthesis, transcription, customer reply, speech playback payload and coaching passed. Audio remained transient.",
  );
} catch (error) {
  if (error instanceof Groq.APIError) {
    const detail = error.error;
    const message =
      typeof detail === "object" &&
      detail &&
      "error" in detail &&
      typeof detail.error === "object" &&
      detail.error &&
      "message" in detail.error
        ? String(detail.error.message)
        : "Speech request rejected.";
    console.error(
      "Groq speech check failed (HTTP " + error.status + "): " + message,
    );
  } else
    console.error(
      error instanceof Error ? error.message : "Live AI verification failed.",
    );
  process.exitCode = 1;
}

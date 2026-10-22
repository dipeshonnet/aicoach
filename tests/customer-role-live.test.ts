import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { customerReply, evaluate } from "../worker/ai";
import type { Env } from "../worker/env";
import type { ActionEvent, ScenarioContent, Turn } from "../src/shared/types";

function liveEnv() {
  return Object.fromEntries(
    readFileSync(".dev.vars", "utf8").split(/\r?\n/)
      .filter((line) => line.includes("=") && !line.trim().startsWith("#"))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "")];
      }),
  ) as unknown as Env;
}

// Explicitly opt in: this uses the configured provider and consumes API quota.
it.skipIf(process.env.RUN_LIVE_CUSTOMER_ROLE !== "1")("keeps Ava as the customer across live replies and recovers from role drift", async () => {
  const env = Object.fromEntries(
    readFileSync(".dev.vars", "utf8").split(/\r?\n/)
      .filter((line) => line.includes("=") && !line.trim().startsWith("#"))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "")];
      }),
  ) as unknown as Env;
  const scenario = {
    customerName: "Ava Morgan",
    brief: "Verify the customer and resolve a delayed order.",
    reference: "Customer Ava Morgan, reference FSL-1048, order BR-7024. Delivery is seven days late. Verify the customer before accessing order details. Process a full refund and advise 3–5 business days.",
    persona: "Worried and initially frustrated but cooperative when the agent is clear.",
    opening: "Hi, my order was supposed to arrive last week and it is still not here. Can you help?",
    outcome: "Customer verified and refund processed by the agent.",
    steps: [],
  } as unknown as ScenarioContent;
  const turns: Turn[] = [];
  for (const text of ["yes, tell me your details please", "What is your customer reference?", "Please confirm your email or phone number.", "What is your order number?"]) {
    const reply = await customerReply(env, scenario, turns, text, 0, "practice");
    expect(reply).not.toMatch(/may i have|could you (?:please )?(?:provide|confirm|share)|so i can verify|i (?:can|will|have) (?:process|check|look up)/i);
    if (!turns.length) expect(reply).toContain("Ava");
    if (turns.length === 1) expect(reply).toMatch(/FSL[-\u2010-\u2015]1048/);
    expect(reply).not.toMatch(/\byour\s+(?:order|purchase)\b/i);
    if (turns.length === 3) {
      expect(reply).toMatch(/BR[-\u2010-\u2015]7024/);
      expect(reply).toMatch(/\bmy\b/i);
    }
    turns.push({ id: String(turns.length), request_id: String(turns.length), sequence: turns.length + 1, agent_text: text, customer_text: reply, state: "completed", created_at: Date.now() });
  }
  turns[0].customer_text = "May I please have your full name and email address so I can verify your identity?";
  const recovered = await customerReply(env, scenario, turns.slice(0, 1), "I need your name and customer reference to help with your order.", 0, "practice");
  expect(recovered).toContain("Ava");
  expect(recovered).toMatch(/FSL[-\u2010-\u2015]1048/);
  expect(recovered).not.toMatch(/may i have|so i can verify/i);
  turns[0].customer_text = "The order number for your purchase is BR-7024.";
  const orderReply = await customerReply(env, scenario, turns.slice(0, 1), "Please confirm the order number again.", 0, "practice");
  expect(orderReply).toMatch(/BR[-\u2010-\u2015]7024/);
  expect(orderReply).toMatch(/\bmy\b/i);
  expect(orderReply).not.toMatch(/\byour\s+(?:order|purchase)\b/i);
}, 120000);

it.skipIf(process.env.RUN_LIVE_CUSTOMER_ROLE !== "1")("leaves policy mistakes to scoring instead of customer corrections", async () => {
  const env = liveEnv();
  const scenario = {
    office: "front", customerName: "Ava Morgan",
    brief: "Resolve a delayed order after verifying the customer.",
    reference: "Customer Ava Morgan, reference FSL-1048, order BR-7024, value USD 49.00. Verify identity first, then process a full USD 49.00 refund. You must advise 3–5 business days for the credit. Never promise immediate credit.",
    outcome: "Customer verified, full refund processed, and 3–5 business day timeframe communicated.",
    persona: "Cooperative customer seeking a refund.", opening: "My order has not arrived. Can you help?",
    rubric: ["procedure", "resolution", "compliance", "communication"].map((key) => ({ key, label: key, weight: 1, guidance: "" })),
    steps: [{ id: "refund", critical: true, hotspots: [{ id: "process", type: "click", correct: true }] }],
  } as unknown as ScenarioContent;
  const events: ActionEvent[] = [{ id: "refund-event", request_id: "refund-request", step_id: "refund", hotspot_id: "process", correct: 1, critical: 0, value: null, created_at: 1 }];
  const initial: Turn = { id: "identity", request_id: "identity-request", sequence: 1, agent_text: "Please confirm your name and customer reference before I access the order.", customer_text: "My name is Ava Morgan and my reference is FSL-1048.", state: "completed", created_at: 1 };
  const wrong = "I have processed your full USD 49.00 refund. You should get it in 7–10 days.";
  const reply = await customerReply(env, scenario, [initial], wrong, 1, "assessment");
  expect(reply).not.toMatch(/3\s*[-–‑]\s*5|three\s*(?:to|through|[-–])\s*five|correct (?:the )?timeframe|verify (?:my|the) identity/i);
  const finalTurn = (text: string): Turn => ({ id: "resolution", request_id: "resolution-request", sequence: 2, agent_text: text, customer_text: reply, state: "completed", created_at: 2 });
  const good = await evaluate(env, scenario, events, [initial, finalTurn("Thank you, your identity is verified. I have processed your full USD 49.00 refund. Please allow 3–5 business days for the credit. Is there anything else I can help with?")], "chat");
  const bad = await evaluate(env, scenario, events, [initial, finalTurn("Thank you, your identity is verified. " + wrong)], "chat");
  for (const key of ["resolution", "compliance"]) {
    const goodScore = good.criteria.find((c) => c.key === key)!.score;
    const criterion = bad.criteria.find((c) => c.key === key)!;
    expect(criterion.score).toBeLessThan(goodScore);
    expect(criterion.score).toBeLessThan(100);
    expect(criterion.evidenceIds).toContain("resolution");
  }
  expect(JSON.stringify(bad.improvements)).toMatch(/timeframe|business days|3.*5/i);
  const omitted = await evaluate(env, scenario, events, [initial, finalTurn("Thank you, your identity is verified. I have processed your full USD 49.00 refund. Goodbye.")], "chat");
  expect(omitted.criteria.find((c) => c.key === "resolution")!.score).toBeLessThan(good.criteria.find((c) => c.key === "resolution")!.score);
  expect(omitted.criteria.find((c) => c.key === "compliance")!.score).toBeLessThan(100);
}, 180000);

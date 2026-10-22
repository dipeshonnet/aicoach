import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { customerReply } from "../worker/ai";
import type { Env } from "../worker/env";
import type { ScenarioContent, Turn } from "../src/shared/types";

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
  for (const text of ["yes, tell me your details please", "What is your customer reference?", "Please confirm your email or phone number."]) {
    const reply = await customerReply(env, scenario, turns, text, 0, "practice");
    expect(reply).not.toMatch(/may i have|could you (?:please )?(?:provide|confirm|share)|so i can verify|i (?:can|will|have) (?:process|check|look up)/i);
    if (!turns.length) expect(reply).toContain("Ava");
    if (turns.length === 1) expect(reply).toMatch(/FSL[-\u2010-\u2015]1048/);
    turns.push({ id: String(turns.length), request_id: String(turns.length), sequence: turns.length + 1, agent_text: text, customer_text: reply, state: "completed", created_at: Date.now() });
  }
  turns[0].customer_text = "May I please have your full name and email address so I can verify your identity?";
  const recovered = await customerReply(env, scenario, turns.slice(0, 1), "I need your name and customer reference to help with your order.", 0, "practice");
  expect(recovered).toContain("Ava");
  expect(recovered).toMatch(/FSL[-\u2010-\u2015]1048/);
  expect(recovered).not.toMatch(/may i have|so i can verify/i);
}, 120000);

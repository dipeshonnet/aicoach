import { beforeEach, describe, expect, it, vi } from "vitest";
import { customerReply } from "../worker/ai";
import type { Env } from "../worker/env";
import type { ScenarioContent, Turn } from "../src/shared/types";

const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("groq-sdk", () => ({
  default: class {
    chat = { completions: { create } };
  },
}));

const customerScenario = {
  brief: "Help a customer whose order is late.",
  customerName: "Ava Morgan",
  persona: "Worried but cooperative. Provide TRAIN-1048 when asked.",
  opening: "Hi, my order was supposed to arrive last week and it is still not here. Can you help?",
  reference: "Customer Ava Morgan, reference TRAIN-1048. Verify the customer before accessing order details. Process the refund.",
  outcome: "Refund processed by the agent.",
  steps: [],
} as unknown as ScenarioContent;

describe("customer conversation role", () => {
  beforeEach(() => {
    create.mockReset();
    create.mockResolvedValue({ choices: [{ message: { content: "My name is Ava Morgan, and my reference is TRAIN-1048." } }] });
  });

  it("assigns staff procedures to the learner when they ask for customer details", async () => {
    const reply = await customerReply({ GROQ_API_KEY: "test" } as Env, customerScenario, [], "yes, tell me your details please", 0, "practice");
    expect(reply).toContain("Ava Morgan");
    const { messages } = create.mock.calls[0][0];
    expect(messages[0].content).toContain("procedures for the SUPPORT AGENT, not instructions for you");
    expect(messages[0].content).toContain("never invent it");
    expect(messages[0].content).toContain("Never ask the learner for their name");
    expect(messages.slice(-2)).toEqual([
      { role: "system", content: expect.stringContaining("Continue only as Ava Morgan, the customer") },
      { role: "user", content: "yes, tell me your details please" },
    ]);
    expect(messages[1]).toEqual({ role: "assistant", content: customerScenario.opening });
  });

  it("reinforces the customer role after a previous reply drifted into support", async () => {
    const turns: Turn[] = [
      { id: "first", request_id: "first", sequence: 1, agent_text: "Tell me your details", customer_text: "May I have your full name so I can verify your identity?", state: "completed", created_at: 1 },
      { id: "failed", request_id: "failed", sequence: 2, agent_text: "ignored failed turn", customer_text: null, state: "failed", created_at: 2 },
    ];
    await customerReply({ GROQ_API_KEY: "test" } as Env, customerScenario, turns, "You are the customer; what is your name?", 0, "assessment");
    const { messages } = create.mock.calls[0][0];
    expect(messages[0].content).toContain("earlier assistant reply that mistakenly spoke as support staff");
    expect(messages[2]).toEqual({ role: "user", content: turns[0].agent_text });
    expect(messages[3]).toEqual({ role: "assistant", content: turns[0].customer_text });
    expect(messages[4]).toEqual({ role: "system", content: expect.stringContaining("Do not switch to the support agent role") });
    expect(messages).toHaveLength(6);
  });
});

import { describe, expect, it } from "vitest";
import {
  aggregateAssessment,
  approvedChannels,
  completedStep,
  normalizeAnswer,
  objectiveResults,
  sanitizeScenario,
  splitSpeech,
  validateAction,
  validateEvidence,
} from "../src/shared/engine";
import { publishProblems, scenarioSchema } from "../src/shared/schema";
import type { ActionEvent, ScenarioContent } from "../src/shared/types";
const scenario: ScenarioContent = {
  title: "Invoice",
  office: "back",
  brief: "Process a duplicate invoice",
  reference: "Do not pay; route to finance.",
  outcome: "Routed",
  customerName: "",
  persona: "",
  opening: "",
  threshold: 80,
  rubric: [
    { key: "procedure", label: "Procedure", weight: 1, guidance: "" },
    { key: "resolution", label: "Resolution", weight: 1, guidance: "" },
    { key: "compliance", label: "Compliance", weight: 1, guidance: "" },
  ],
  steps: [
    {
      id: "verify",
      title: "Check reference",
      instructions: "Enter INV-1048",
      hint: "Look at the reference",
      assetId: "image",
      critical: true,
      hotspots: [
        {
          id: "input",
          label: "Reference",
          type: "input",
          x: 0.1,
          y: 0.2,
          w: 0.3,
          h: 0.1,
          accepted: ["INV-1048"],
          correct: true,
          critical: false,
        },
        {
          id: "pay",
          label: "Pay invoice",
          type: "click",
          x: 0.5,
          y: 0.5,
          w: 0.2,
          h: 0.1,
          accepted: [],
          correct: false,
          critical: true,
        },
      ],
    },
  ],
};
const event = (
  id: string,
  correct: number,
  critical = 0,
  hotspot = "input",
): ActionEvent => ({
  id,
  request_id: id,
  step_id: "verify",
  hotspot_id: hotspot,
  value: "INV-1048",
  correct,
  critical,
  created_at: 1000,
});
describe("assessment boundary", () => {
  it("omits instructions, hints, reference policies, answers and correctness from assessment payloads", () => {
    const result = sanitizeScenario(scenario, "assessment", 1),
      serialized = JSON.stringify(result);
    expect(serialized).not.toContain("INV-1048");
    expect(serialized).not.toContain("Do not pay");
    expect(serialized).not.toContain("Look at");
    expect(serialized).not.toContain('"correct"');
    expect(serialized).not.toContain('"critical"');
    expect(result.steps[0].title).toBe("Screen 1");
  });
  it("shows learner guidance only in supported modes", () => {
    expect(sanitizeScenario(scenario, "practice", 1).steps[0].hint).toBe(
      "Look at the reference",
    );
    expect(
      sanitizeScenario(scenario, "practice", 1).steps[0].hotspots[0].correct,
    ).toBeUndefined();
    expect(
      sanitizeScenario(scenario, "walkthrough", 1).steps[0].hotspots[0].correct,
    ).toBe(true);
  });
});
describe("procedure engine", () => {
  it("normalizes unicode, case and whitespace but rejects wrong answers", () => {
    expect(normalizeAnswer("  ＩＮＶ-1048  ")).toBe("inv-1048");
    expect(validateAction(scenario, 0, "input", "  inv-1048 ").correct).toBe(
      true,
    );
    expect(validateAction(scenario, 0, "input", "INV-1049").correct).toBe(
      false,
    );
    expect(validateAction(scenario, 0, "missing").correct).toBe(false);
    const blankLine = {
      ...scenario,
      steps: [
        {
          ...scenario.steps[0],
          hotspots: [
            { ...scenario.steps[0].hotspots[0], accepted: ["INV-1048", ""] },
          ],
        },
      ],
    };
    expect(validateAction(blankLine, 0, "input", "  ").correct).toBe(false);
  });
  it("records forbidden critical actions and requires all expected actions", () => {
    expect(validateAction(scenario, 0, "pay").critical).toBe(true);
    expect(completedStep(scenario, 0, [])).toBe(false);
    expect(completedStep(scenario, 0, [event("ok", 1)])).toBe(true);
  });
  it("penalizes incorrect attempts without losing eventually completed work", () => {
    const results = objectiveResults(scenario, [
      event("wrong", 0),
      event("right", 1),
    ]);
    expect(results.find((c) => c.key === "procedure")?.score).toBe(50);
    expect(results.find((c) => c.key === "resolution")?.score).toBe(100);
  });
  it("blocks a pass when critical checks are missing even with low compliance weight", () => {
    const s = {
      ...scenario,
      rubric: scenario.rubric.map((r) => ({
        ...r,
        weight: r.key === "compliance" ? 0.01 : 100,
      })),
    };
    const criteria = [
      { key: "procedure" as const, score: 100, feedback: "", evidenceIds: [] },
      { key: "resolution" as const, score: 100, feedback: "", evidenceIds: [] },
      { key: "compliance" as const, score: 0, feedback: "", evidenceIds: [] },
    ];
    const result = aggregateAssessment(s, criteria, 0, 1000, [], []);
    expect(result.score).toBe(100);
    expect(result.passed).toBe(false);
  });
  it("keeps a critical failure after a subsequent correct action", () => {
    const criteria = objectiveResults(scenario, [
      event("bad", 0, 1, "pay"),
      event("ok", 1),
    ]);
    expect(criteria.find((c) => c.key === "compliance")?.score).toBe(0);
  });
  it("only completes the channels with trainer-approved assessments", () => {
    expect(
      approvedChannels(
        ["chat", "voice"],
        [
          { channel: "chat", mode: "practice", status: "approved" },
          { channel: "voice", mode: "assessment", status: "submitted" },
        ],
      ),
    ).toEqual([]);
    expect(
      approvedChannels(
        ["chat", "voice"],
        [
          { channel: "chat", mode: "assessment", status: "approved" },
          { channel: "voice", mode: "assessment", status: "retry" },
        ],
      ),
    ).toEqual(["chat"]);
  });
});
describe("authoring and AI output", () => {
  it("requires complete publishable procedures and keeps draft support", () => {
    expect(publishProblems(scenario)).toEqual([]);
    expect(scenarioSchema.safeParse({ ...scenario, steps: [] }).success).toBe(
      true,
    );
    expect(publishProblems({ ...scenario, steps: [] })).toContain(
      "Add at least one screenshot step.",
    );
    expect(
      scenarioSchema.safeParse({
        ...scenario,
        steps: [
          {
            ...scenario.steps[0],
            hotspots: [{ ...scenario.steps[0].hotspots[0], x: 0.9, w: 0.3 }],
          },
        ],
      }).success,
    ).toBe(false);
  });
  it("rejects duplicate steps and criterion keys", () => {
    expect(
      scenarioSchema.safeParse({
        ...scenario,
        steps: [...scenario.steps, ...scenario.steps],
      }).success,
    ).toBe(false);
    expect(
      scenarioSchema.safeParse({
        ...scenario,
        rubric: [...scenario.rubric, scenario.rubric[0]],
      }).success,
    ).toBe(false);
  });
  it("rejects hallucinated evidence and invalid scores", () => {
    expect(
      validateEvidence(
        [
          {
            key: "procedure",
            score: 90,
            feedback: "",
            evidenceIds: ["made-up"],
          },
        ],
        [event("real", 1)],
        [],
      ),
    ).toBe(false);
    expect(
      validateEvidence(
        [{ key: "procedure", score: 101, feedback: "", evidenceIds: ["real"] }],
        [event("real", 1)],
        [],
      ),
    ).toBe(false);
    expect(
      validateEvidence(
        [{ key: "communication", score: 100, feedback: "", evidenceIds: [] }],
        [event("real", 1)],
        [],
      ),
    ).toBe(false);
  });
  it("splits speech at word boundaries and respects the provider limit", () => {
    const text = "The customer needs a clear, accurate explanation. ".repeat(
        40,
      ),
      chunks = splitSpeech(text);
    expect(chunks.every((c) => c.length <= 200 && c.length > 0)).toBe(true);
    expect(chunks.join(" ")).toBe(text.trim());
    expect(splitSpeech("x".repeat(450)).map((x) => x.length)).toEqual([
      200, 200, 50,
    ]);
    expect(splitSpeech("")).toEqual([]);
  });
});

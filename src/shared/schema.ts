import { z } from "zod";

export const roleSchema = z.enum(["admin", "trainer", "agent"]);
export const hotspotSchema = z
  .object({
    id: z.string().min(1).max(80),
    label: z.string().min(1).max(120),
    type: z.enum(["click", "input"]),
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    w: z.number().min(0.005).max(1),
    h: z.number().min(0.005).max(1),
    accepted: z.array(z.string().max(500)).max(30),
    correct: z.boolean(),
    critical: z.boolean(),
  })
  .refine(
    (h) => h.x + h.w <= 1.001 && h.y + h.h <= 1.001,
    "Region must fit within the screenshot",
  );
export const stepSchema = z.object({
  id: z.string().min(1).max(80),
  title: z.string().max(200),
  instructions: z.string().max(4000),
  hint: z.string().max(1000),
  assetId: z.string().max(100),
  critical: z.boolean(),
  hotspots: z.array(hotspotSchema).max(30),
});
export const scenarioSchema = z
  .object({
    title: z.string().min(1).max(200),
    office: z.enum(["front", "back"]),
    brief: z.string().max(4000),
    reference: z.string().max(20000),
    outcome: z.string().max(4000),
    customerName: z.string().max(120),
    persona: z.string().max(4000),
    opening: z.string().max(2000),
    threshold: z.number().min(1).max(100),
    rubric: z
      .array(
        z.object({
          key: z.enum([
            "procedure",
            "resolution",
            "compliance",
            "communication",
          ]),
          label: z.string().min(1).max(120),
          weight: z.number().min(0.01).max(100),
          guidance: z.string().max(2000),
        }),
      )
      .min(1)
      .max(4),
    steps: z.array(stepSchema).max(40),
  })
  .superRefine((s, c) => {
    if (new Set(s.steps.map((x) => x.id)).size !== s.steps.length)
      c.addIssue({
        code: "custom",
        message: "Step identifiers must be unique",
      });
    if (new Set(s.rubric.map((x) => x.key)).size !== s.rubric.length)
      c.addIssue({ code: "custom", message: "Rubric criteria must be unique" });
    if (s.office === "back" && s.rubric.some((r) => r.key === "communication"))
      c.addIssue({
        code: "custom",
        message: "Communication is scored only for front-office scenarios.",
      });
    const ids = s.steps.flatMap((x) => x.hotspots.map((h) => h.id));
    if (new Set(ids).size !== ids.length)
      c.addIssue({
        code: "custom",
        message: "Action identifiers must be unique",
      });
  });
export const actionSchema = z.object({
  requestId: z.string().uuid(),
  stepId: z.string().max(80),
  hotspotId: z.string().max(80).nullable(),
  value: z.string().max(500).optional(),
});
export function publishProblems(s: z.infer<typeof scenarioSchema>): string[] {
  const errors: string[] = [];
  if (!s.brief.trim() || !s.reference.trim() || !s.outcome.trim())
    errors.push("Add a brief, reference instructions, and expected outcome.");
  if (!s.steps.length) errors.push("Add at least one screenshot step.");
  s.steps.forEach((step, i) => {
    if (!step.assetId || !step.instructions.trim() || !step.title.trim())
      errors.push(
        "Step " + (i + 1) + " needs a screenshot, title, and instructions.",
      );
    if (!step.hotspots.some((h) => h.correct))
      errors.push("Step " + (i + 1) + " needs a correct action.");
    if (
      step.hotspots.some(
        (h) =>
          h.type === "input" && h.correct && !h.accepted.some((v) => v.trim()),
      )
    )
      errors.push(
        "Step " + (i + 1) + " needs accepted answers for its input fields.",
      );
  });
  const required =
    s.office === "front"
      ? ["procedure", "resolution", "compliance", "communication"]
      : ["procedure", "resolution", "compliance"];
  if (required.some((key) => !s.rubric.some((r) => r.key === key)))
    errors.push("Include all default rubric categories.");
  if (
    s.office === "front" &&
    (!s.persona.trim() || !s.opening.trim() || !s.customerName.trim())
  )
    errors.push("Add a customer name, persona, and opening message.");
  return errors;
}

import type {
  ActionEvent,
  Assessment,
  CriterionResult,
  ScenarioContent,
  LearnerScenario,
  Mode,
  Turn,
} from "./types";

export function sanitizeScenario(
  s: ScenarioContent,
  mode: Mode,
  version: number,
): LearnerScenario {
  return {
    title: s.title,
    office: s.office,
    brief: s.brief,
    customerName: s.customerName,
    version,
    steps: s.steps.map((step, i) => ({
      id: step.id,
      assetId: step.assetId,
      ...(mode !== "assessment"
        ? {
            title: step.title,
            instructions: step.instructions,
            hint: step.hint,
          }
        : { title: "Screen " + (i + 1) }),
      hotspots: step.hotspots.map((h) => ({
        id: h.id,
        label: h.label,
        type: h.type,
        x: h.x,
        y: h.y,
        w: h.w,
        h: h.h,
        ...(mode === "walkthrough" ? { correct: h.correct } : {}),
      })),
    })),
  };
}
export const normalizeAnswer = (value: string) =>
  value
    .normalize("NFKC")
    // Copied references can contain typographic hyphens from customer replies.
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("en");
export function validateAction(
  s: ScenarioContent,
  stepIndex: number,
  hotspotId: string | null,
  value = "",
) {
  const step = s.steps[stepIndex];
  const hotspot = step?.hotspots.find((h) => h.id === hotspotId);
  const normalized = normalizeAnswer(value);
  const correct = Boolean(
    hotspot?.correct &&
    (hotspot.type === "click" ||
      (normalized.length > 0 &&
        hotspot.accepted.some((a) => normalizeAnswer(a) === normalized))),
  );
  return { correct, critical: Boolean(!correct && hotspot?.critical), hotspot };
}
export function completedStep(
  s: ScenarioContent,
  index: number,
  events: ActionEvent[],
): boolean {
  const step = s.steps[index];
  return Boolean(
    step &&
    step.hotspots
      .filter((h) => h.correct)
      .every((h) =>
        events.some(
          (e) => e.step_id === step.id && e.hotspot_id === h.id && e.correct,
        ),
      ),
  );
}
export function objectiveResults(
  s: ScenarioContent,
  events: ActionEvent[],
): CriterionResult[] {
  const required = s.steps.flatMap((step) =>
    step.hotspots.filter((h) => h.correct).map((h) => ({ step, h })),
  );
  const completed = required.filter(({ step, h }) =>
    events.some(
      (e) => e.step_id === step.id && e.hotspot_id === h.id && e.correct,
    ),
  );
  const wrong = events.filter((e) => !e.correct);
  const procedure = required.length
    ? Math.round((100 * completed.length) / (required.length + wrong.length))
    : 0;
  const resolution =
    required.length && completed.length === required.length ? 100 : 0;
  const criticalSteps = s.steps.filter((step) => step.critical);
  const criticalPassed =
    !events.some((e) => e.critical) &&
    criticalSteps.every((step) =>
      step.hotspots
        .filter((h) => h.correct)
        .every((h) =>
          events.some(
            (e) => e.step_id === step.id && e.hotspot_id === h.id && e.correct,
          ),
        ),
    );
  return [
    {
      key: "procedure",
      score: procedure,
      feedback:
        completed.length +
        " of " +
        required.length +
        " required actions completed; " +
        wrong.length +
        " incorrect actions recorded.",
      evidenceIds: events.map((e) => e.id),
    },
    {
      key: "resolution",
      score: resolution,
      feedback: resolution
        ? "The expected work-item outcome was reached."
        : "The procedure was submitted with unfinished actions.",
      evidenceIds: completed.flatMap(({ step, h }) =>
        events
          .filter(
            (e) => e.step_id === step.id && e.hotspot_id === h.id && e.correct,
          )
          .map((e) => e.id),
      ),
    },
    {
      key: "compliance",
      score: criticalPassed ? 100 : 0,
      feedback: criticalPassed
        ? "All critical procedural checks passed."
        : "A critical action failed or a required critical step was missed.",
      evidenceIds: events
        .filter(
          (e) =>
            e.critical || criticalSteps.some((step) => step.id === e.step_id),
        )
        .map((e) => e.id),
    },
  ];
}
export function aggregateAssessment(
  s: ScenarioContent,
  criteria: CriterionResult[],
  startedAt: number,
  now: number,
  strengths: string[],
  improvements: string[],
): Assessment {
  const total = s.rubric.reduce((sum, r) => sum + r.weight, 0);
  const score = Math.round(
    s.rubric.reduce(
      (sum, r) =>
        sum + (criteria.find((c) => c.key === r.key)?.score ?? 0) * r.weight,
      0,
    ) / total,
  );
  const criticalPassed =
    (criteria.find((c) => c.key === "compliance")?.score ?? 0) === 100;
  return {
    score,
    passed: score >= s.threshold && criticalPassed,
    criticalPassed,
    criteria,
    strengths,
    improvements,
    elapsedSeconds: Math.max(0, Math.round((now - startedAt) / 1000)),
  };
}
export function approvedChannels(
  channels: string[],
  attempts: { channel: string; mode: string; status: string }[],
): string[] {
  return channels.filter((channel) =>
    attempts.some(
      (a) =>
        a.channel === channel &&
        a.mode === "assessment" &&
        a.status === "approved",
    ),
  );
}
export function splitSpeech(text: string, limit = 200): string[] {
  const words = text.trim().split(/\s+/);
  const chunks: string[] = [];
  let part = "";
  for (let word of words) {
    while (word.length > limit) {
      if (part) {
        chunks.push(part);
        part = "";
      }
      chunks.push(word.slice(0, limit));
      word = word.slice(limit);
    }
    if (!word) continue;
    if ((part + " " + word).trim().length > limit) {
      chunks.push(part);
      part = word;
    } else part = (part + " " + word).trim();
  }
  if (part) chunks.push(part);
  return chunks;
}
export function validateEvidence(
  criteria: CriterionResult[],
  events: ActionEvent[],
  turns: Turn[],
) {
  const ids = new Set([
    ...events.map((e) => e.id),
    ...turns.filter((t) => t.state === "completed").map((t) => t.id),
  ]);
  return criteria.every(
    (c) =>
      Number.isFinite(c.score) &&
      c.score >= 0 &&
      c.score <= 100 &&
      (c.score === 0 || c.evidenceIds.length > 0) &&
      c.evidenceIds.every((id) => ids.has(id)),
  );
}

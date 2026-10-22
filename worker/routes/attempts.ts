import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { AppEnv } from "../env";
import {
  attemptFor,
  contentOf,
  evidence,
  limit,
  lock,
  now,
  one,
  receipt,
  uid,
  unlock,
} from "../store";
import { actionSchema } from "../../src/shared/schema";
import {
  completedStep,
  sanitizeScenario,
  validateAction,
} from "../../src/shared/engine";
import type { ActionEvent } from "../../src/shared/types";
import { body } from "../http";

export const attemptsRoutes = new Hono<AppEnv>();

attemptsRoutes.post("/attempts", async (c) => {
  const input = await body(
    c,
    z.object({
      assignmentId: z.string(),
      channel: z.enum(["workflow", "chat", "voice"]),
      mode: z.enum(["walkthrough", "practice", "assessment"]),
    }),
  );
  const assigned = await one<{ channels_json: string; user_id: string }>(
    c.env.DB,
    "SELECT * FROM assignments WHERE id=?",
    input.assignmentId,
  );
  if (!assigned || assigned.user_id !== c.get("user").id)
    throw new HTTPException(403, {
      message: "This scenario is not assigned to you.",
    });
  if (!JSON.parse(assigned.channels_json).includes(input.channel))
    throw new HTTPException(400, {
      message: "This practice channel is not assigned.",
    });
  const existing = await one<{ id: string }>(
    c.env.DB,
    "SELECT id FROM attempts WHERE assignment_id=? AND user_id=? AND mode=? AND channel=? AND status='active' ORDER BY started_at DESC LIMIT 1",
    input.assignmentId,
    c.get("user").id,
    input.mode,
    input.channel,
  );
  if (existing) return c.json({ id: existing.id });
  const id = uid();
  try {
    await c.env.DB.prepare(
      "INSERT INTO attempts(id,assignment_id,user_id,mode,channel,status,started_at) VALUES(?,?,?,?,?,?,?)",
    )
      .bind(
        id,
        input.assignmentId,
        c.get("user").id,
        input.mode,
        input.channel,
        "active",
        now(),
      )
      .run();
  } catch (error) {
    const resumed = await one<{ id: string }>(
      c.env.DB,
      "SELECT id FROM attempts WHERE assignment_id=? AND user_id=? AND mode=? AND channel=? AND status='active'",
      input.assignmentId,
      c.get("user").id,
      input.mode,
      input.channel,
    );
    if (resumed) return c.json({ id: resumed.id });
    throw error;
  }
  return c.json({ id }, 201);
});
attemptsRoutes.get("/attempts/:id", async (c) => {
  const attempt = await attemptFor(c, c.req.param("id"));
  const data = await evidence(c.env.DB, attempt.id),
    s = contentOf(attempt);
  return c.json({
    id: attempt.id,
    assignment_id: attempt.assignment_id,
    user_id: attempt.user_id,
    mode: attempt.mode,
    channel: attempt.channel,
    status: attempt.status,
    current_step: attempt.current_step,
    started_at: attempt.started_at,
    submitted_at: attempt.submitted_at,
    reviewed_at: attempt.reviewed_at,
    review_note: attempt.review_note,
    result: attempt.result_json ? JSON.parse(attempt.result_json) : null,
    scenario: sanitizeScenario(
      s,
      c.get("user").role === "agent" ? attempt.mode : "walkthrough",
      attempt.version,
    ),
    ...(c.get("user").role !== "agent"
      ? {
          reviewContext: {
            reference: s.reference,
            outcome: s.outcome,
            threshold: s.threshold,
          },
        }
      : {}),
    opening: s.opening,
    ...data,
  });
});
attemptsRoutes.post("/attempts/:id/actions", async (c) => {
  const input = await body(c, actionSchema);
  let attempt = await attemptFor(c, c.req.param("id"), true);
  const prior = await receipt(c.env.DB, attempt.id, input.requestId);
  if (prior) return c.json(prior);
  const token = await lock(c, attempt);
  try {
    attempt = await attemptFor(c, attempt.id, true);
    const s = contentOf(attempt);
    if (s.steps[attempt.current_step]?.id !== input.stepId)
      throw new HTTPException(409, {
        message: "That screen is no longer current. Refresh the attempt.",
      });
    await limit(c, "action:" + c.get("user").id, 120);
    const count = await one<{ count: number }>(
      c.env.DB,
      "SELECT COUNT(*) AS count FROM action_events WHERE attempt_id=?",
      attempt.id,
    );
    // Allow the largest supported procedure plus retries, but reject growth
    // before evidence() loads the entire history. Existing evidence is retained.
    const maximum = Math.max(
      1000,
      5 * s.steps.reduce((total, step) => total + step.hotspots.length, 0),
    );
    if ((count?.count ?? 0) >= maximum)
      throw new HTTPException(409, {
        message:
          "This attempt has reached its action limit. Submit it or start a new attempt.",
      });
    const checked = validateAction(
      s,
      attempt.current_step,
      input.hotspotId,
      input.value,
    );
    const event: ActionEvent = {
      id: uid(),
      request_id: input.requestId,
      step_id: input.stepId,
      hotspot_id: input.hotspotId,
      value: input.value || null,
      correct: checked.correct ? 1 : 0,
      critical: checked.critical ? 1 : 0,
      created_at: now(),
    };
    const { events } = await evidence(c.env.DB, attempt.id);
    const next = completedStep(s, attempt.current_step, [...events, event])
      ? attempt.current_step + 1
      : attempt.current_step;
    const response = {
      correct: checked.correct,
      currentStep: next,
      complete: next >= s.steps.length,
      ...(attempt.mode !== "assessment"
        ? {
            feedback: checked.correct
              ? "Action completed."
              : s.steps[attempt.current_step].hint ||
                "Review the instructions and try again.",
          }
        : {}),
    };
    await c.env.DB.batch([
      c.env.DB.prepare(
        "INSERT INTO action_events VALUES(?,?,?,?,?,?,?,?,?)",
      ).bind(
        event.id,
        attempt.id,
        input.requestId,
        input.stepId,
        input.hotspotId,
        event.value,
        event.correct,
        event.critical,
        event.created_at,
      ),
      c.env.DB.prepare(
        "UPDATE attempts SET current_step=? WHERE id=? AND operation_token=?",
      ).bind(next, attempt.id, token),
      c.env.DB.prepare("INSERT INTO operation_receipts VALUES(?,?,?)").bind(
        attempt.id,
        input.requestId,
        JSON.stringify(response),
      ),
    ]);
    return c.json(response);
  } finally {
    await unlock(c.env.DB, attempt.id, token);
  }
});

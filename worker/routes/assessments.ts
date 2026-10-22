import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { AppEnv } from "../env";
import {
  attemptFor,
  contentOf,
  evidence,
  lock,
  now,
  receipt,
  requireProcess,
  staff,
  unlock,
} from "../store";
import { evaluate } from "../ai";
import { aggregateAssessment } from "../../src/shared/engine";
import type { Assessment } from "../../src/shared/types";
import { body } from "../http";

const requestIdSchema = z.object({ requestId: z.string().uuid() });

export const assessmentsRoutes = new Hono<AppEnv>();

assessmentsRoutes.post("/attempts/:id/submit", async (c) => {
  const input = await body(c, requestIdSchema);
  const attempt = await attemptFor(c, c.req.param("id"), true);
  const prior = await receipt(c.env.DB, attempt.id, input.requestId);
  if (prior) return c.json(prior);
  if (attempt.status !== "active")
    return c.json({
      result: attempt.result_json ? JSON.parse(attempt.result_json) : null,
    });
  const token = await lock(c, attempt);
  try {
    const s = contentOf(attempt),
      data = await evidence(c.env.DB, attempt.id);
    if (data.turns.some((t) => t.state !== "completed"))
      throw new HTTPException(409, {
        message: "Retry the unfinished customer reply before submitting.",
      });
    let result: Assessment | null = null;
    if (attempt.mode !== "walkthrough") {
      const graded = await evaluate(
        c.env,
        s,
        data.events,
        data.turns,
        attempt.channel,
      );
      result = aggregateAssessment(
        s,
        graded.criteria,
        attempt.started_at,
        now(),
        graded.strengths,
        graded.improvements,
      );
    }
    const response = { result };
    await c.env.DB.batch([
      c.env.DB.prepare(
        "UPDATE attempts SET status='submitted',result_json=?,submitted_at=? WHERE id=? AND operation_token=?",
      ).bind(result ? JSON.stringify(result) : null, now(), attempt.id, token),
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
assessmentsRoutes.post("/attempts/:id/review", async (c) => {
  staff(c.get("user"));
  const input = await body(
    c,
    z.object({
      decision: z.enum(["approved", "retry"]),
      note: z.string().max(4000),
    }),
  );
  const attempt = await attemptFor(c, c.req.param("id"));
  await requireProcess(c, attempt.process_id);
  if (attempt.mode !== "assessment" || attempt.status !== "submitted")
    throw new HTTPException(409, {
      message: "Only submitted assessments can be reviewed.",
    });
  const result = attempt.result_json
    ? (JSON.parse(attempt.result_json) as Assessment)
    : null;
  if (input.decision === "approved" && !result?.passed)
    throw new HTTPException(400, {
      message: "The assessment must pass before completion can be approved.",
    });
  if (input.decision === "retry" && !input.note.trim())
    throw new HTTPException(400, {
      message: "Add a note explaining what the agent should practise.",
    });
  const reviewed = await c.env.DB.prepare(
    "UPDATE attempts SET status=?,reviewed_at=?,reviewed_by=?,review_note=? WHERE id=? AND status='submitted' RETURNING id",
  )
    .bind(input.decision, now(), c.get("user").id, input.note, attempt.id)
    .first();
  if (!reviewed)
    throw new HTTPException(409, {
      message: "This assessment has already been reviewed.",
    });
  return c.json({ ok: true });
});

import { Hono, type Context } from "hono";
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
  uid,
  unlock,
} from "../store";
import type { StoredAttempt } from "../store";
import { coach, customerReply, speech, transcribe } from "../ai";
import { splitSpeech } from "../../src/shared/engine";
import type { Turn } from "../../src/shared/types";
import { body } from "../http";

export const conversationRoutes = new Hono<AppEnv>();

function turnResponse(turn: Turn) {
  return {
    id: turn.id,
    agentText: turn.agent_text,
    customerText: turn.customer_text,
    speechChunks: splitSpeech(turn.customer_text || "").length,
  };
}

async function completeTurn(
  c: Context<AppEnv>,
  attempt: StoredAttempt,
  turn: Turn,
) {
  const s = contentOf(attempt),
    { turns } = await evidence(c.env.DB, attempt.id);
  try {
    const customer = await customerReply(
      c.env,
      s,
      turns.filter((t) => t.id !== turn.id),
      turn.agent_text,
      attempt.current_step,
      attempt.mode,
    );
    await c.env.DB.prepare(
      "UPDATE turns SET customer_text=?,state='completed' WHERE id=?",
    )
      .bind(customer, turn.id)
      .run();
    return turnResponse({ ...turn, customer_text: customer });
  } catch (error) {
    await c.env.DB.prepare("UPDATE turns SET state='failed' WHERE id=?")
      .bind(turn.id)
      .run();
    throw error;
  }
}
conversationRoutes.post("/attempts/:id/turns", async (c) => {
  let attempt = await attemptFor(c, c.req.param("id"), true);
  if (attempt.channel === "workflow")
    throw new HTTPException(400, {
      message: "This scenario uses work-item practice.",
    });
  if (attempt.status !== "active")
    throw new HTTPException(409, {
      message: "This attempt is already submitted.",
    });
  await limit(c, "turn:" + c.get("user").id, 20);
  const token = await lock(c, attempt);
  try {
    attempt = await attemptFor(c, attempt.id, true);
    let requestId: string, agentText: string;
    if (c.req.header("Content-Type")?.includes("multipart/form-data")) {
      if (attempt.channel !== "voice")
        throw new HTTPException(400, {
          message: "Audio is only accepted in voice attempts.",
        });
      const form = await c.req.formData(),
        audio = form.get("audio");
      requestId = z.string().uuid().parse(form.get("requestId"));
      const prior = await one<Turn>(
        c.env.DB,
        "SELECT * FROM turns WHERE attempt_id=? AND request_id=?",
        attempt.id,
        requestId,
      );
      if (prior) {
        if (prior.state === "completed")
          return c.json(turnResponse(prior));
        return c.json(await completeTurn(c, attempt, prior));
      }
      if (
        !(audio instanceof File) ||
        !audio.size ||
        audio.size > 5 * 1024 * 1024 ||
        ![
          "audio/webm",
          "audio/ogg",
          "audio/wav",
          "audio/mp4",
          "video/webm",
        ].some((t) => audio.type.startsWith(t))
      )
        throw new HTTPException(400, {
          message: "Record a supported audio response smaller than 5 MB.",
        });
      agentText = await transcribe(c.env, audio);
    } else {
      if (attempt.channel !== "chat")
        throw new HTTPException(400, {
          message: "Record a voice response for this attempt.",
        });
      const input = await body(
        c,
        z.object({
          requestId: z.string().uuid(),
          text: z.string().trim().min(1).max(8000),
        }),
      );
      requestId = input.requestId;
      agentText = input.text;
    }
    const prior = await one<Turn>(
      c.env.DB,
      "SELECT * FROM turns WHERE attempt_id=? AND request_id=?",
      attempt.id,
      requestId,
    );
    if (prior) {
      if (prior.agent_text !== agentText)
        throw new HTTPException(409, {
          message: "This request identifier was already used.",
        });
      if (prior.state === "completed")
        return c.json(turnResponse(prior));
      return c.json(await completeTurn(c, attempt, prior));
    }
    if (
      await one(
        c.env.DB,
        "SELECT id FROM turns WHERE attempt_id=? AND state!='completed' LIMIT 1",
        attempt.id,
      )
    )
      throw new HTTPException(409, {
        message:
          "Retry the unfinished customer reply before sending another response.",
      });
    const count = await one<{ sequence: number }>(
      c.env.DB,
      "SELECT COALESCE(MAX(sequence),0)+1 AS sequence FROM turns WHERE attempt_id=?",
      attempt.id,
    );
    if ((count?.sequence || 1) > 100)
      throw new HTTPException(400, {
        message:
          "This conversation has reached its 100-turn limit. Submit or start a new attempt.",
      });
    const turn: Turn = {
      id: uid(),
      request_id: requestId,
      sequence: count?.sequence || 1,
      agent_text: agentText,
      customer_text: null,
      state: "pending",
      created_at: now(),
    };
    await c.env.DB.prepare("INSERT INTO turns VALUES(?,?,?,?,?,?,?,?)")
      .bind(
        turn.id,
        attempt.id,
        requestId,
        turn.sequence,
        agentText,
        null,
        "pending",
        turn.created_at,
      )
      .run();
    return c.json(await completeTurn(c, attempt, turn));
  } finally {
    await unlock(c.env.DB, attempt.id, token);
  }
});
conversationRoutes.post("/attempts/:id/turns/:turnId/retry", async (c) => {
  const attempt = await attemptFor(c, c.req.param("id"), true);
  await limit(c, "turn:" + c.get("user").id, 20);
  const token = await lock(c, attempt);
  try {
    const turn = await one<Turn>(
      c.env.DB,
      "SELECT * FROM turns WHERE id=? AND attempt_id=?",
      c.req.param("turnId"),
      attempt.id,
    );
    if (!turn) throw new HTTPException(404, { message: "Turn not found." });
    if (turn.state === "completed")
      return c.json(turnResponse(turn));
    return c.json(await completeTurn(c, attempt, turn));
  } finally {
    await unlock(c.env.DB, attempt.id, token);
  }
});
conversationRoutes.post("/attempts/:id/speech", async (c) => {
  const attempt = await attemptFor(c, c.req.param("id"), true);
  const input = await body(
    c,
    z.object({
      turnId: z.string().nullable(),
      chunk: z.number().int().min(0).max(100),
    }),
  );
  if (attempt.channel !== "voice")
    throw new HTTPException(400, {
      message: "Speech playback is available for voice attempts.",
    });
  await limit(c, "speech:" + c.get("user").id, 100);
  const turn = input.turnId
    ? await one<Turn>(
        c.env.DB,
        "SELECT * FROM turns WHERE id=? AND attempt_id=? AND state='completed'",
        input.turnId,
        attempt.id,
      )
    : null;
  if (input.turnId && !turn)
    throw new HTTPException(404, { message: "Customer reply not found." });
  const text = splitSpeech(turn?.customer_text || contentOf(attempt).opening)[
    input.chunk
  ];
  if (!text)
    throw new HTTPException(404, { message: "Speech segment not found." });
  const audio = await speech(c.env, text);
  return new Response(audio, {
    headers: { "Content-Type": "audio/wav", "Cache-Control": "no-store" },
  });
});
conversationRoutes.post("/attempts/:id/coach", async (c) => {
  const attempt = await attemptFor(c, c.req.param("id"), true);
  if (attempt.mode === "assessment" || attempt.status !== "active")
    throw new HTTPException(403, {
      message: "Coaching is available during practice and walkthroughs.",
    });
  await limit(c, "coach:" + c.get("user").id, 10);
  const data = await evidence(c.env.DB, attempt.id);
  return c.json({
    feedback: await coach(c.env, contentOf(attempt), data.events, data.turns),
  });
});

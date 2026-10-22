import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { AppEnv } from "../env";
import { all, now, one, requireProcess, staff, uid } from "../store";
import type { Scenario } from "../../src/shared/types";
import { body } from "../http";

export const assignmentsRoutes = new Hono<AppEnv>();

assignmentsRoutes.post("/assignments", async (c) => {
  staff(c.get("user"));
  const input = await body(
    c,
    z.object({
      scenarioId: z.string(),
      batchId: z.string().optional(),
      userId: z.string().optional(),
      channels: z
        .array(z.enum(["workflow", "chat", "voice"]))
        .min(1)
        .max(2),
    }),
  );
  if (Boolean(input.batchId) === Boolean(input.userId))
    throw new HTTPException(400, {
      message: "Choose either a batch or an individual agent.",
    });
  const scenario = await one<Scenario>(
    c.env.DB,
    "SELECT * FROM scenarios WHERE id=?",
    input.scenarioId,
  );
  if (!scenario?.published_version)
    throw new HTTPException(400, {
      message: "Publish the scenario before assigning it.",
    });
  await requireProcess(c, scenario.process_id);
  if (
    scenario.office === "back"
      ? input.channels.some((x) => x !== "workflow")
      : input.channels.some((x) => x === "workflow")
  )
    throw new HTTPException(400, {
      message:
        "Use workflow for back-office scenarios and chat or voice for front-office scenarios.",
    });
  let users: string[] = [];
  if (input.batchId) {
    if (
      !(await one(
        c.env.DB,
        "SELECT id FROM batches WHERE id=? AND process_id=?",
        input.batchId,
        scenario.process_id,
      ))
    )
      throw new HTTPException(400, {
        message: "Choose a batch in this process.",
      });
    users = (
      await all<{ user_id: string }>(
        c.env.DB,
        "SELECT bm.user_id FROM batch_members bm JOIN user u ON u.id=bm.user_id WHERE bm.batch_id=? AND u.banned=0 AND u.role=?",
        input.batchId,
        "agent",
      )
    ).map((x) => x.user_id);
  } else {
    if (
      !(await one(
        c.env.DB,
        "SELECT id FROM user WHERE id=? AND role='agent' AND banned=0",
        input.userId,
      ))
    )
      throw new HTTPException(400, { message: "Choose an active agent." });
    if (
      c.get("user").role === "trainer" &&
      !(await one(
        c.env.DB,
        "SELECT bm.user_id FROM batch_members bm JOIN batches b ON b.id=bm.batch_id WHERE bm.user_id=? AND b.process_id=?",
        input.userId,
        scenario.process_id,
      ))
    )
      throw new HTTPException(403, {
        message: "This agent is outside your assigned process.",
      });
    users = [input.userId!];
  }
  if (!users.length)
    throw new HTTPException(400, {
      message: "The selected batch has no active agents.",
    });
  const v = await one<{ id: string }>(
    c.env.DB,
    "SELECT id FROM scenario_versions WHERE scenario_id=? AND version=?",
    scenario.id,
    scenario.published_version,
  );
  const channels = Array.from(new Set(input.channels)),
    time = now(),
    ids = users.map(() => uid());
  await c.env.DB.batch(
    users.map((userId, i) =>
      c.env.DB.prepare("INSERT INTO assignments VALUES(?,?,?,?,?,?,?)").bind(
        ids[i],
        v!.id,
        userId,
        input.batchId || null,
        JSON.stringify(channels),
        c.get("user").id,
        time,
      ),
    ),
  );
  return c.json({ ids, count: ids.length }, 201);
});

import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { AppEnv } from "../env";
import { administrator, now, one, requireProcess, uid } from "../store";
import { body } from "../http";

export const batchesRoutes = new Hono<AppEnv>();

async function validateMembers(db: D1Database, members: string[]) {
  for (const member of members)
    if (
      !(await one(
        db,
        "SELECT id FROM user WHERE id=? AND role='agent' AND banned=0",
        member,
      ))
    )
      throw new HTTPException(400, {
        message: "Batch members must be active agents.",
      });
}

batchesRoutes.post("/batches", async (c) => {
  administrator(c.get("user"));
  const input = await body(
    c,
    z.object({
      name: z.string().min(2).max(120),
      processId: z.string(),
      members: z.array(z.string()).max(500),
    }),
  );
  await requireProcess(c, input.processId);
  const id = uid();
  await validateMembers(c.env.DB, input.members);
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO batches VALUES(?,?,?,?)").bind(
      id,
      input.name,
      input.processId,
      now(),
    ),
    ...Array.from(new Set(input.members)).map((member) =>
      c.env.DB.prepare("INSERT INTO batch_members VALUES(?,?)").bind(
        id,
        member,
      ),
    ),
  ]);
  return c.json({ id }, 201);
});
batchesRoutes.put("/batches/:id/members", async (c) => {
  administrator(c.get("user"));
  const input = await body(
      c,
      z.object({ members: z.array(z.string()).max(500) }),
    ),
    id = c.req.param("id");
  if (!(await one(c.env.DB, "SELECT id FROM batches WHERE id=?", id)))
    throw new HTTPException(404, { message: "Batch not found." });
  await validateMembers(c.env.DB, input.members);
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM batch_members WHERE batch_id=?").bind(id),
    ...Array.from(new Set(input.members)).map((member) =>
      c.env.DB.prepare("INSERT INTO batch_members VALUES(?,?)").bind(
        id,
        member,
      ),
    ),
  ]);
  return c.json({ ok: true });
});

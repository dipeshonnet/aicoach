import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../env";
import { administrator, now, uid } from "../store";
import { body } from "../http";

export const processesRoutes = new Hono<AppEnv>();

processesRoutes.post("/processes", async (c) => {
  administrator(c.get("user"));
  const input = await body(
    c,
    z.object({
      name: z.string().min(2).max(120),
      client: z.string().min(2).max(120),
      description: z.string().max(2000).default(""),
    }),
  );
  const id = uid();
  await c.env.DB.prepare("INSERT INTO processes VALUES(?,?,?,?,?)")
    .bind(id, input.name, input.client, input.description, now())
    .run();
  return c.json({ id }, 201);
});

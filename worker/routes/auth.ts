import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { authFor, secretMatches } from "../auth";
import type { AppEnv } from "../env";
import { limit, one, uid } from "../store";
import { seedExamples } from "../seeds";
import { body, originOf } from "../http";

const allowedAuth = new Set([
  "sign-in/email",
  "sign-out",
  "get-session",
  "change-password",
  "update-user",
]);

export const authRoutes = new Hono<AppEnv>();

authRoutes.get("/health", (c) => c.json({ ok: true }));
authRoutes.get("/setup/status", async (c) => {
  const count = await one<{ count: number }>(
    c.env.DB,
    "SELECT COUNT(*) AS count FROM user",
  );
  return c.json({
    needsSetup: !count?.count,
    bootstrapConfigured: Boolean(c.env.BOOTSTRAP_TOKEN),
  });
});
authRoutes.post("/setup", async (c) => {
  await limit(c, "setup:" + c.req.header("CF-Connecting-IP"), 5);
  const input = await body(
    c,
    z.object({
      name: z.string().min(2).max(100),
      email: z.string().email(),
      password: z.string().min(12).max(128),
      token: z.string().min(1).max(500),
    }),
  );
  if (
    !c.env.BOOTSTRAP_TOKEN ||
    !secretMatches(input.token, c.env.BOOTSTRAP_TOKEN)
  )
    throw new HTTPException(403, { message: "The setup token is incorrect." });
  if (await one(c.env.DB, "SELECT id FROM user LIMIT 1"))
    throw new HTTPException(409, {
      message: "This workspace is already set up.",
    });
  const reservation = await c.env.DB.prepare(
    "INSERT INTO app_settings(key,value) VALUES('bootstrap_lock',?) ON CONFLICT(key) DO NOTHING RETURNING key",
  )
    .bind(uid())
    .first();
  if (!reservation)
    throw new HTTPException(409, { message: "Setup is already running." });
  try {
    const auth = authFor(c.env, originOf(c.req.raw));
    const created = await auth.api.createUser({
      body: {
        name: input.name,
        email: input.email,
        password: input.password,
        role: "admin",
      },
    });
    await seedExamples(c.env, created.user.id);
    return c.json({ ok: true }, 201);
  } catch (error) {
    await c.env.DB.prepare(
      "DELETE FROM app_settings WHERE key='bootstrap_lock'",
    ).run();
    throw error;
  }
});
authRoutes.all("/auth/*", async (c) => {
  const path = new URL(c.req.url).pathname.slice("/api/auth/".length);
  if (!allowedAuth.has(path))
    throw new HTTPException(404, {
      message: "Authentication endpoint not available.",
    });
  return authFor(c.env, originOf(c.req.raw)).handler(c.req.raw);
});

import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";
import { authFor } from "./auth";
import type { AppEnv } from "./env";
import { now, one, uid } from "./store";
import type { User } from "../src/shared/types";
import type { ErrorHandler, MiddlewareHandler } from "hono";
import { originOf } from "./http";

export const apiMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const started = now();
  c.set("requestId", uid());
  c.header("Cache-Control", "no-store");
  c.header("X-Content-Type-Options", "nosniff");
  // Bound and consume bodies even on rejected requests. This also prevents an
  // unread POST body from poisoning the next keep-alive request in local workerd.
  if (c.req.raw.body) {
    const maximum = c.req
      .header("Content-Type")
      ?.includes("multipart/form-data")
      ? 11 * 1024 * 1024
      : 2 * 1024 * 1024;
    if (Number(c.req.header("Content-Length") || 0) > maximum)
      throw new HTTPException(413, { message: "File is too large." });
    const reader = c.req.raw.body.getReader(),
      chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      length += part.value.byteLength;
      if (length > maximum) {
        await reader.cancel();
        throw new HTTPException(413, { message: "File is too large." });
      }
      chunks.push(part.value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    c.req.raw = new Request(c.req.raw, { body: bytes });
  }
  const origin = c.req.header("Origin"),
    site = c.env.APP_URL || originOf(c.req.raw);
  if (
    !["GET", "HEAD", "OPTIONS"].includes(c.req.method) &&
    ((origin && origin !== site) ||
      c.req.header("Sec-Fetch-Site") === "cross-site")
  )
    throw new HTTPException(403, {
      message: "Request origin is not permitted.",
    });
  const size = Number(c.req.header("Content-Length") || 0);
  if (size > 11 * 1024 * 1024)
    throw new HTTPException(413, { message: "File is too large." });
  await next();
  console.info(
    JSON.stringify({
      event: "request",
      requestId: c.get("requestId"),
      method: c.req.method,
      path: new URL(c.req.url).pathname,
      status: c.res.status,
      durationMs: now() - started,
    }),
  );
};

export const handleError: ErrorHandler<AppEnv> = (error, c) => {
  if (error instanceof ZodError)
    return c.json({ error: error.issues.map((x) => x.message).join(" ") }, 400);
  if (error instanceof HTTPException) {
    console.info(
      JSON.stringify({
        event: "request-rejected",
        requestId: c.get("requestId"),
        status: error.status,
        path: new URL(c.req.url).pathname,
      }),
    );
    return c.json({ error: error.message }, error.status);
  }
  console.error(
    JSON.stringify({
      event: "request-failed",
      requestId: c.get("requestId"),
      path: new URL(c.req.url).pathname,
    }),
  );
  return c.json(
    { error: "The request could not be completed. Please retry." },
    500,
  );
};

export const requireSession: MiddlewareHandler<AppEnv> = async (c, next) => {
  const session = await authFor(c.env, originOf(c.req.raw)).api.getSession({
    headers: c.req.raw.headers,
  });
  if (!session)
    throw new HTTPException(401, {
      message: "Your session has expired. Please sign in.",
    });
  const user = await one<User>(
    c.env.DB,
    "SELECT id,name,email,role,banned FROM user WHERE id=?",
    session.user.id,
  );
  if (!user || user.banned)
    throw new HTTPException(401, {
      message: "This account is inactive. Contact your administrator.",
    });
  c.set("user", user);
  await next();
};

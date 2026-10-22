import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { ZodError, type ZodType } from "zod";
import type { AppEnv } from "./env";

export const originOf = (request: Request) => new URL(request.url).origin;

export async function body<T>(
  c: Context<AppEnv>,
  schema: ZodType<T>,
): Promise<T> {
  try {
    return schema.parse(await c.req.json());
  } catch (error) {
    if (error instanceof ZodError) throw error;
    throw new HTTPException(400, { message: "Send a valid JSON request." });
  }
}

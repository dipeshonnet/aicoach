import type { Env } from "./env";

export function appOrigins(env: Env, origin: string): string[] {
  return [env.APP_URL || origin, ...(env.APP_URL_ALIASES || "").split(",")]
    .map((value) => value.trim())
    .filter(Boolean);
}

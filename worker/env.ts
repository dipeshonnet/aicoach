import type { User } from "../src/shared/types";

export interface Env {
  DB: D1Database;
  SCREENSHOTS: R2Bucket;
  ASSETS: Fetcher;
  BETTER_AUTH_SECRET: string;
  BOOTSTRAP_TOKEN?: string;
  APP_URL?: string;
  GROQ_API_KEY?: string;
  GROQ_TEXT_MODEL?: string;
  GROQ_STT_MODEL?: string;
  GROQ_TTS_MODEL?: string;
  GROQ_TTS_VOICE?: string;
}
export type AppEnv = {
  Bindings: Env;
  Variables: { user: User; requestId: string };
};

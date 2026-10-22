import { Hono } from "hono";
import type { AppEnv } from "../env";
import { loadOverview } from "../overview";

export const overviewRoutes = new Hono<AppEnv>();

overviewRoutes.get("/overview", async (c) => {
  const overview = await loadOverview(c.env.DB, c.get("user"));
  return c.json({ ...overview, aiConfigured: Boolean(c.env.GROQ_API_KEY) });
});

import { Hono, type Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { AppEnv } from "../env";
import { all, now, one, requireProcess, staff, uid } from "../store";
import { publishProblems, scenarioSchema } from "../../src/shared/schema";
import type { Scenario, ScenarioContent } from "../../src/shared/types";
import { body } from "../http";

export const scenariosRoutes = new Hono<AppEnv>();

async function checkAssets(
  c: Context<AppEnv>,
  processId: string,
  s: ScenarioContent,
) {
  for (const id of new Set(s.steps.map((step) => step.assetId).filter(Boolean)))
    if (
      !(await one(
        c.env.DB,
        "SELECT id FROM assets WHERE id=? AND process_id=?",
        id,
        processId,
      ))
    )
      throw new HTTPException(400, {
        message: "Screenshots must belong to this scenario’s process.",
      });
}
scenariosRoutes.post("/scenarios", async (c) => {
  staff(c.get("user"));
  const input = await body(
    c,
    z.object({ processId: z.string(), content: scenarioSchema }),
  );
  await requireProcess(c, input.processId);
  await checkAssets(c, input.processId, input.content);
  const id = uid(),
    time = now();
  await c.env.DB.prepare(
    "INSERT INTO scenarios(id,process_id,title,office,draft_json,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",
  )
    .bind(
      id,
      input.processId,
      input.content.title,
      input.content.office,
      JSON.stringify(input.content),
      c.get("user").id,
      time,
      time,
    )
    .run();
  return c.json({ id, revision: 1 }, 201);
});
scenariosRoutes.get("/scenarios/:id", async (c) => {
  staff(c.get("user"));
  const row = await one<Scenario & { draft_json: string }>(
    c.env.DB,
    "SELECT * FROM scenarios WHERE id=?",
    c.req.param("id"),
  );
  if (!row) throw new HTTPException(404, { message: "Scenario not found." });
  await requireProcess(c, row.process_id);
  const versions = await all<{
    id: string;
    version: number;
    published_at: number;
  }>(
    c.env.DB,
    "SELECT id,version,published_at FROM scenario_versions WHERE scenario_id=? ORDER BY version DESC",
    row.id,
  );
  const { draft_json, ...scenario } = row;
  return c.json({ ...scenario, draft: JSON.parse(draft_json), versions });
});
scenariosRoutes.put("/scenarios/:id", async (c) => {
  staff(c.get("user"));
  const input = await body(
    c,
    z.object({ revision: z.number().int(), content: scenarioSchema }),
  );
  const scenario = await one<Scenario>(
    c.env.DB,
    "SELECT * FROM scenarios WHERE id=?",
    c.req.param("id"),
  );
  if (!scenario)
    throw new HTTPException(404, { message: "Scenario not found." });
  await requireProcess(c, scenario.process_id);
  await checkAssets(c, scenario.process_id, input.content);
  if (scenario.published_version && scenario.office !== input.content.office)
    throw new HTTPException(400, {
      message:
        "Published scenarios retain their office type. Create a separate scenario for the other work type.",
    });
  const updated = await c.env.DB.prepare(
    "UPDATE scenarios SET title=?,office=?,draft_json=?,draft_revision=draft_revision+1,updated_at=? WHERE id=? AND draft_revision=? RETURNING draft_revision",
  )
    .bind(
      input.content.title,
      input.content.office,
      JSON.stringify(input.content),
      now(),
      scenario.id,
      input.revision,
    )
    .first<{ draft_revision: number }>();
  if (!updated)
    throw new HTTPException(409, {
      message: "This draft was changed elsewhere. Reload before saving.",
    });
  return c.json({ id: scenario.id, revision: updated.draft_revision });
});
scenariosRoutes.post("/scenarios/:id/publish", async (c) => {
  staff(c.get("user"));
  const input = await body(c, z.object({ revision: z.number().int() }));
  const row = await one<Scenario & { draft_json: string }>(
    c.env.DB,
    "SELECT * FROM scenarios WHERE id=?",
    c.req.param("id"),
  );
  if (!row) throw new HTTPException(404, { message: "Scenario not found." });
  await requireProcess(c, row.process_id);
  if (row.draft_revision !== input.revision)
    throw new HTTPException(409, {
      message: "Save your current draft before publishing.",
    });
  const content = scenarioSchema.parse(JSON.parse(row.draft_json)),
    errors = publishProblems(content);
  if (errors.length)
    throw new HTTPException(400, { message: errors.join(" ") });
  await checkAssets(c, row.process_id, content);
  const version = (row.published_version || 0) + 1,
    id = uid();
  await c.env.DB.batch([
    c.env.DB.prepare(
      "INSERT INTO scenario_versions(id,scenario_id,version,content_json,published_by,published_at) SELECT ?,id,?,?,?,? FROM scenarios WHERE id=? AND draft_revision=? AND COALESCE(published_version,0)=?",
    ).bind(
      id,
      version,
      JSON.stringify(content),
      c.get("user").id,
      now(),
      row.id,
      input.revision,
      version - 1,
    ),
    c.env.DB.prepare(
      "UPDATE scenarios SET published_version=? WHERE id=? AND draft_revision=? AND EXISTS(SELECT id FROM scenario_versions WHERE id=?)",
    ).bind(version, row.id, input.revision, id),
  ]);
  if (!(await one(c.env.DB, "SELECT id FROM scenario_versions WHERE id=?", id)))
    throw new HTTPException(409, {
      message: "Scenario changed during publication. Reload and try again.",
    });
  return c.json({ id, version });
});

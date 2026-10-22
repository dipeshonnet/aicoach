import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AppEnv } from "../env";
import { all, limit, now, one, requireProcess, staff, uid } from "../store";
import type { ScenarioContent } from "../../src/shared/types";

export const assetsRoutes = new Hono<AppEnv>();

assetsRoutes.post("/assets", async (c) => {
  staff(c.get("user"));
  await limit(c, "upload:" + c.get("user").id, 20);
  const form = await c.req.formData(),
    processId = String(form.get("processId") || ""),
    file = form.get("file");
  await requireProcess(c, processId);
  if (!(file instanceof File) || file.size > 10 * 1024 * 1024 || !file.size)
    throw new HTTPException(400, {
      message: "Choose a PNG, JPEG or WebP screenshot smaller than 10 MB.",
    });
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime =
    bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71
      ? "image/png"
      : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
        ? "image/jpeg"
        : String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
            String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
          ? "image/webp"
          : null;
  if (!mime)
    throw new HTTPException(400, {
      message: "Only PNG, JPEG and WebP screenshots are accepted.",
    });
  const id = uid(),
    key = "screenshots/" + id;
  await c.env.SCREENSHOTS.put(key, bytes, {
    httpMetadata: { contentType: mime },
  });
  await c.env.DB.prepare("INSERT INTO assets VALUES(?,?,?,?,?,?,?)")
    .bind(
      id,
      processId,
      key,
      mime,
      file.name.slice(0, 200),
      c.get("user").id,
      now(),
    )
    .run();
  return c.json({ id }, 201);
});
assetsRoutes.get("/assets/:id", async (c) => {
  const asset = await one<{
    process_id: string;
    object_key: string;
    mime: string;
  }>(c.env.DB, "SELECT * FROM assets WHERE id=?", c.req.param("id"));
  if (!asset)
    throw new HTTPException(404, { message: "Screenshot not found." });
  const user = c.get("user");
  if (user.role === "agent") {
    const versions = await all<{ content_json: string }>(
      c.env.DB,
      "SELECT v.content_json FROM assignments a JOIN scenario_versions v ON v.id=a.scenario_version_id WHERE a.user_id=?",
      user.id,
    );
    if (
      !versions.some((v) =>
        (JSON.parse(v.content_json) as ScenarioContent).steps.some(
          (s) => s.assetId === c.req.param("id"),
        ),
      )
    )
      throw new HTTPException(403, {
        message: "Screenshot is not assigned to you.",
      });
  } else await requireProcess(c, asset.process_id);
  const object = await c.env.SCREENSHOTS.get(asset.object_key);
  if (!object)
    throw new HTTPException(404, { message: "Screenshot file not found." });
  return new Response(object.body, {
    headers: {
      "Content-Type": asset.mime,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});

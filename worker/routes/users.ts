import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { authFor } from "../auth";
import type { AppEnv } from "../env";
import { administrator, all, canProcess, limit, now, one, staff } from "../store";
import { parsePeopleCsv, type PeopleImportResult } from "../../src/shared/people-csv";
import { roleSchema } from "../../src/shared/schema";
import type { User } from "../../src/shared/types";
import { body, originOf } from "../http";

export const usersRoutes = new Hono<AppEnv>();

class ImportRowError extends Error {}

usersRoutes.post("/users/import", async (c) => {
  const actor = c.get("user");
  staff(actor);
  await limit(c, "people-import:" + actor.id, 5);
  const { csv } = await body(c, z.object({ csv: z.string().max(500_000) }));
  let rows;
  try { rows = parsePeopleCsv(csv); }
  catch (error) { throw new HTTPException(400, { message: (error as Error).message }); }
  const result: PeopleImportResult = { created: 0, updated: 0, errors: [] };
  const seen = new Set<string>();
  for (const row of rows) {
    try {
      if (seen.has(row.email)) throw new ImportRowError("Duplicate email in this CSV.");
      seen.add(row.email);
      const input = z.object({
        name: z.string().min(2).max(120), email: z.string().email(),
      }).safeParse(row);
      if (!input.success) throw new ImportRowError("Provide a full name (2–120 characters) and valid email.");
      const target = await one<User>(c.env.DB,
        "SELECT id,name,email,role,banned FROM user WHERE lower(email)=?", row.email);
      const role = roleSchema.safeParse(row.role || target?.role || "agent");
      if (!role.success) throw new ImportRowError("Role must be admin, trainer, or agent.");
      if (!target && (row.password.length < 12 || row.password.length > 128))
        throw new ImportRowError("New accounts need a password of 12–128 characters.");
      if (target && row.password) throw new ImportRowError("Leave password blank for existing accounts. Use Reset password separately.");
      if (target?.id === actor.id && role.data !== actor.role)
        throw new ImportRowError("You cannot change your own role.");
      const batchIds = [...new Set(row.batchIds.split(";").map((id) => id.trim()).filter(Boolean))];
      if (batchIds.length > 100) throw new ImportRowError("Use at most 100 batch IDs per person.");
      if (role.data !== "agent" && batchIds.length) throw new ImportRowError("Only agents can be added to batches.");
      for (const id of batchIds) {
        const batch = await one<{ process_id: string }>(c.env.DB, "SELECT process_id FROM batches WHERE id=?", id);
        if (!batch || !await canProcess(c.env.DB, actor, batch.process_id))
          throw new ImportRowError("A batch does not exist or is outside your process access.");
      }
      if (actor.role === "trainer") {
        if (role.data !== "agent" || (target && target.role !== "agent"))
          throw new ImportRowError("Trainers can import agents only.");
        if (!target && !batchIds.length) throw new ImportRowError("Choose at least one batch in your assigned processes for a new agent.");
        if (target) {
          const memberships = await all<{ process_id: string }>(c.env.DB,
            "SELECT b.process_id FROM batches b JOIN batch_members m ON m.batch_id=b.id WHERE m.user_id=?", target.id);
          if (!memberships.length) throw new ImportRowError("This person is outside your process access.");
          for (const membership of memberships)
            if (!await canProcess(c.env.DB, actor, membership.process_id))
              throw new ImportRowError("This person is outside your process access.");
        }
      }
      let id = target?.id;
      if (!id) {
        // This server-only call follows the scoped authorization above. Public auth
        // routing does not expose create-user; trainer headers are not admin headers.
        const created = await authFor(c.env, originOf(c.req.raw)).api.createUser({
          body: { name: row.name, email: row.email, password: row.password, role: role.data },
        });
        id = created.user.id;
      }
      const statements = [c.env.DB.prepare("UPDATE user SET name=?,role=?,updatedAt=? WHERE id=?")
        .bind(row.name, role.data, now(), id)];
      if (target && target.role !== role.data) {
        statements.push(c.env.DB.prepare("DELETE FROM session WHERE userId=?").bind(id));
        statements.push(c.env.DB.prepare("DELETE FROM trainer_processes WHERE user_id=?").bind(id));
        if (role.data !== "agent") statements.push(c.env.DB.prepare("DELETE FROM batch_members WHERE user_id=?").bind(id));
      }
      for (const batchId of batchIds) statements.push(c.env.DB.prepare("INSERT OR IGNORE INTO batch_members VALUES(?,?)").bind(batchId, id));
      try {
        await c.env.DB.batch(statements);
      } catch (error) {
        // Avoid leaving a newly created account without its requested memberships.
        if (!target) await c.env.DB.prepare("DELETE FROM user WHERE id=?").bind(id).run();
        throw error;
      }
      if (target) result.updated++; else result.created++;
    } catch (error) {
      result.errors.push({ row: row.row, email: row.email,
        message: error instanceof ImportRowError ? error.message : "Could not save this person. Check the email and retry." });
    }
  }
  return c.json(result);
});

usersRoutes.get("/users/:id/access", async (c) => {
  administrator(c.get("user"));
  const rows = await all<{ process_id: string }>(
    c.env.DB,
    "SELECT process_id FROM trainer_processes WHERE user_id=?",
    c.req.param("id"),
  );
  return c.json({ processIds: rows.map((r) => r.process_id) });
});
usersRoutes.post("/users", async (c) => {
  administrator(c.get("user"));
  const input = await body(
    c,
    z.object({
      name: z.string().min(2).max(120),
      email: z.string().email(),
      password: z.string().min(12).max(128),
      role: roleSchema,
      processIds: z.array(z.string()).max(100).default([]),
    }),
  );
  for (const id of input.processIds)
    if (!(await one(c.env.DB, "SELECT id FROM processes WHERE id=?", id)))
      throw new HTTPException(400, { message: "Process does not exist." });
  const auth = authFor(c.env, originOf(c.req.raw));
  try {
    const result = await auth.api.createUser({
      body: {
        name: input.name,
        email: input.email,
        password: input.password,
        role: input.role,
      },
      headers: c.req.raw.headers,
    });
    if (input.role === "trainer" && input.processIds.length)
      await c.env.DB.batch(
        input.processIds.map((id) =>
          c.env.DB.prepare(
            "INSERT OR IGNORE INTO trainer_processes VALUES(?,?)",
          ).bind(result.user.id, id),
        ),
      );
    return c.json({ id: result.user.id }, 201);
  } catch (error) {
    if (
      await one(
        c.env.DB,
        "SELECT id FROM user WHERE email=?",
        input.email.toLowerCase(),
      )
    )
      throw new HTTPException(409, {
        message: "An account with this email already exists.",
      });
    throw error;
  }
});
usersRoutes.patch("/users/:id", async (c) => {
  administrator(c.get("user"));
  const id = c.req.param("id");
  const input = await body(
    c,
    z.object({
      banned: z.boolean().optional(),
      role: roleSchema.optional(),
      processIds: z.array(z.string()).max(100).optional(),
    }),
  );
  if (id === c.get("user").id && input.banned)
    throw new HTTPException(400, {
      message: "You cannot deactivate your own account.",
    });
  const target = await one<User>(
    c.env.DB,
    "SELECT id,name,email,role,banned FROM user WHERE id=?",
    id,
  );
  if (!target) throw new HTTPException(404, { message: "User not found." });
  const statements: D1PreparedStatement[] = [];
  if (input.role) {
    if (id === c.get("user").id && input.role !== "admin")
      throw new HTTPException(400, {
        message: "You cannot remove your own administrator access.",
      });
    statements.push(
      c.env.DB.prepare("UPDATE user SET role=?,updatedAt=? WHERE id=?").bind(
        input.role,
        now(),
        id,
      ),
    );
    if (input.role !== target.role)
      statements.push(
        c.env.DB.prepare("DELETE FROM session WHERE userId=?").bind(id),
      );
  }
  if (input.banned !== undefined) {
    statements.push(
      c.env.DB.prepare("UPDATE user SET banned=?,updatedAt=? WHERE id=?").bind(
        input.banned ? 1 : 0,
        now(),
        id,
      ),
    );
    if (input.banned)
      statements.push(
        c.env.DB.prepare("DELETE FROM session WHERE userId=?").bind(id),
      );
  }
  if (input.processIds) {
    if ((input.role || target.role) !== "trainer" && input.processIds.length)
      throw new HTTPException(400, {
        message: "Process access is configured for trainers.",
      });
    for (const processId of input.processIds)
      if (
        !(await one(c.env.DB, "SELECT id FROM processes WHERE id=?", processId))
      )
        throw new HTTPException(400, { message: "Process not found." });
    statements.push(
      c.env.DB.prepare("DELETE FROM trainer_processes WHERE user_id=?").bind(
        id,
      ),
    );
    statements.push(
      ...input.processIds.map((p) =>
        c.env.DB.prepare(
          "INSERT OR IGNORE INTO trainer_processes VALUES(?,?)",
        ).bind(id, p),
      ),
    );
  }
  if (statements.length) await c.env.DB.batch(statements);
  return c.json({ ok: true });
});
usersRoutes.post("/users/:id/password", async (c) => {
  administrator(c.get("user"));
  const input = await body(
    c,
    z.object({ password: z.string().min(12).max(128) }),
  );
  const userId = c.req.param("id");
  if (!(await one(c.env.DB, "SELECT id FROM user WHERE id=?", userId)))
    throw new HTTPException(404, { message: "User not found." });
  await authFor(c.env, originOf(c.req.raw)).api.setUserPassword({
    body: { userId, newPassword: input.password },
    headers: c.req.raw.headers,
  });
  await c.env.DB.prepare("DELETE FROM session WHERE userId=?")
    .bind(userId)
    .run();
  return c.json({ ok: true });
});

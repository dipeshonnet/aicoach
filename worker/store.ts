import { HTTPException } from "hono/http-exception";
import type { Context } from "hono";
import type { AppEnv } from "./env";
import type {
  ActionEvent,
  Attempt,
  ScenarioContent,
  Turn,
  User,
} from "../src/shared/types";

export async function all<T>(
  db: D1Database,
  sql: string,
  ...args: unknown[]
): Promise<T[]> {
  return (
    await db
      .prepare(sql)
      .bind(...args)
      .all<T>()
  ).results;
}
export async function one<T>(
  db: D1Database,
  sql: string,
  ...args: unknown[]
): Promise<T | null> {
  return db
    .prepare(sql)
    .bind(...args)
    .first<T>();
}
export const now = () => Date.now();
export const uid = () => crypto.randomUUID();
export function staff(user: User) {
  if (user.role === "agent")
    throw new HTTPException(403, { message: "Trainer access required." });
}
export function administrator(user: User) {
  if (user.role !== "admin")
    throw new HTTPException(403, { message: "Administrator access required." });
}
export async function canProcess(
  db: D1Database,
  user: User,
  processId: string,
) {
  if (user.role === "admin")
    return Boolean(
      await one(db, "SELECT id FROM processes WHERE id=?", processId),
    );
  if (user.role === "trainer")
    return Boolean(
      await one(
        db,
        "SELECT user_id FROM trainer_processes WHERE user_id=? AND process_id=?",
        user.id,
        processId,
      ),
    );
  return false;
}
export async function requireProcess(c: Context<AppEnv>, processId: string) {
  if (!(await canProcess(c.env.DB, c.get("user"), processId)))
    throw new HTTPException(403, {
      message: "You do not have access to this process.",
    });
}
export async function limit(
  c: Context<AppEnv>,
  key: string,
  max = 30,
  window = 60000,
) {
  const time = now();
  const bucket = key + ":" + Math.floor(time / window);
  const row = await c.env.DB.prepare(
    "INSERT INTO api_limits(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count",
  )
    .bind(bucket, time + window)
    .first<{ count: number }>();
  if ((row?.count ?? 0) > max)
    throw new HTTPException(429, {
      message: "Too many requests. Please wait a minute and try again.",
    });
}
export interface StoredAttempt extends Attempt {
  content_json: string;
  version: number;
  process_id: string;
  operation_token: string | null;
  operation_started_at: number | null;
  result_json: string | null;
}
export async function attemptFor(
  c: Context<AppEnv>,
  id: string,
  ownerOnly = false,
): Promise<StoredAttempt> {
  const row = await one<StoredAttempt>(
    c.env.DB,
    "SELECT t.*, v.content_json,v.version,s.process_id FROM attempts t JOIN assignments a ON a.id=t.assignment_id JOIN scenario_versions v ON v.id=a.scenario_version_id JOIN scenarios s ON s.id=v.scenario_id WHERE t.id=?",
    id,
  );
  if (!row) throw new HTTPException(404, { message: "Attempt not found." });
  const user = c.get("user");
  if (
    row.user_id !== user.id &&
    (ownerOnly || !(await canProcess(c.env.DB, user, row.process_id)))
  )
    throw new HTTPException(403, {
      message: "This attempt belongs to another agent.",
    });
  return row;
}
export async function lock(
  c: Context<AppEnv>,
  attempt: StoredAttempt,
): Promise<string> {
  const token = uid(),
    time = now();
  const acquired = await c.env.DB.prepare(
    "UPDATE attempts SET operation_token=?,operation_started_at=? WHERE id=? AND status='active' AND (operation_token IS NULL OR operation_started_at < ?) RETURNING id",
  )
    .bind(token, time, attempt.id, time - 180000)
    .first();
  if (!acquired)
    throw new HTTPException(409, {
      message: "Another operation is running. Please wait and retry.",
    });
  return token;
}
export async function unlock(db: D1Database, id: string, token: string) {
  await db
    .prepare(
      "UPDATE attempts SET operation_token=NULL,operation_started_at=NULL WHERE id=? AND operation_token=?",
    )
    .bind(id, token)
    .run();
}
export const contentOf = (attempt: StoredAttempt) =>
  JSON.parse(attempt.content_json) as ScenarioContent;
export async function evidence(db: D1Database, attemptId: string) {
  const [events, turns] = await Promise.all([
    all<ActionEvent>(
      db,
      "SELECT * FROM action_events WHERE attempt_id=? ORDER BY created_at,rowid",
      attemptId,
    ),
    all<Turn>(
      db,
      "SELECT * FROM turns WHERE attempt_id=? ORDER BY sequence",
      attemptId,
    ),
  ]);
  return { events, turns };
}
export async function receipt(
  db: D1Database,
  attemptId: string,
  requestId: string,
) {
  const row = await one<{ response_json: string }>(
    db,
    "SELECT response_json FROM operation_receipts WHERE attempt_id=? AND request_id=?",
    attemptId,
    requestId,
  );
  return row
    ? (JSON.parse(row.response_json) as Record<string, unknown>)
    : null;
}

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import type { Assessment, Role, User } from "../src/shared/types";
import { loadOverview } from "../worker/overview";
import { testDatabase } from "./helpers/database";

describe("workspace overview", () => {
  let sqlite: DatabaseSync;
  let db: D1Database;
  let reads: number;

  beforeEach(() => {
    reads = 0;
    const database = testDatabase(() => reads++);
    sqlite = database.sqlite;
    db = database.db;
    sqlite.exec(`
      INSERT INTO user(id,name,email,role,createdAt,updatedAt) VALUES
        ('admin','Admin','admin@example.test','admin',0,0),
        ('trainer','Trainer','trainer@example.test','trainer',0,0),
        ('agent','Agent','agent@example.test','agent',0,0),
        ('peer','Peer','peer@example.test','agent',0,0),
        ('other','Other','other@example.test','agent',0,0),
        ('direct','Direct','direct@example.test','agent',0,0),
        ('unassigned','Unassigned','unassigned@example.test','agent',0,0);
      INSERT INTO processes VALUES
        ('visible','Alpha','Client','',0),('hidden','Beta','Client','',0);
      INSERT INTO trainer_processes VALUES('trainer','visible');
      INSERT INTO batches VALUES
        ('own','Alpha','visible',0),('empty','Empty','visible',0),
        ('peer-only','Peer','visible',0),('hidden-batch','Hidden','hidden',0);
      INSERT INTO batch_members VALUES
        ('own','agent'),('own','peer'),('own','unassigned'),
        ('peer-only','peer'),('hidden-batch','other');
      INSERT INTO scenarios(id,process_id,title,office,draft_json,published_version,created_by,created_at,updated_at) VALUES
        ('visible-scenario','visible','Edited draft','front','{"reference":"private draft"}',2,'admin',0,20),
        ('hidden-scenario','hidden','Hidden','back','{}',1,'admin',0,10);
      INSERT INTO scenario_versions VALUES
        ('visible-version','visible-scenario',1,'{"title":"Published title","office":"front","reference":"private answer"}','admin',0),
        ('hidden-version','hidden-scenario',1,'{"title":"Hidden","office":"back"}','admin',0);
      INSERT INTO assignments VALUES
        ('own-assignment','visible-version','agent','own','["chat","voice"]','admin',40),
        ('peer-assignment','visible-version','peer','peer-only','["chat"]','admin',30),
        ('direct-assignment','visible-version','direct',NULL,'["chat"]','admin',20),
        ('hidden-assignment','hidden-version','other','hidden-batch','["workflow"]','admin',10);
      INSERT INTO attempts(id,assignment_id,user_id,mode,channel,status,started_at,operation_token,operation_started_at) VALUES
        ('chat-pass','own-assignment','agent','assessment','chat','approved',10,'private-lock',1),
        ('voice-pass','own-assignment','agent','assessment','voice','approved',20,NULL,NULL),
        ('latest-retry','own-assignment','agent','assessment','chat','retry',30,NULL,NULL),
        ('latest-active','own-assignment','agent','practice','chat','active',40,NULL,NULL),
        ('peer-practice','peer-assignment','peer','practice','chat','approved',50,NULL,NULL),
        ('hidden-pass','hidden-assignment','other','assessment','workflow','approved',60,NULL,NULL);
    `);
    const result: Assessment = {
      score: 90,
      passed: true,
      criticalPassed: true,
      criteria: [],
      strengths: [],
      improvements: [],
      elapsedSeconds: 10,
    };
    sqlite
      .prepare("UPDATE attempts SET result_json=? WHERE status='approved'")
      .run(JSON.stringify(result));
    sqlite
      .prepare("UPDATE attempts SET result_json=? WHERE id='latest-retry'")
      .run(JSON.stringify({ ...result, score: 50, passed: false }));
  });

  afterEach(() => sqlite.close());

  function user(id: string, role: Role): User {
    return { id, role, name: id, email: `${id}@example.test` };
  }

  it("preserves full administrator visibility and published assignment metadata", async () => {
    const overview = await loadOverview(db, user("admin", "admin"));
    expect(overview.processes.map((p) => p.id)).toEqual(["visible", "hidden"]);
    expect(overview.batches).toHaveLength(4);
    expect(overview.batches.find((b) => b.id === "empty")?.members).toEqual([]);
    expect(overview.scenarios.map((s) => s.title)).toEqual([
      "Edited draft",
      "Hidden",
    ]);
    expect(overview.scenarios.every((s) => !("draft_json" in s))).toBe(true);
    expect(overview.assignments.map((a) => a.id)).toEqual([
      "own-assignment",
      "peer-assignment",
      "direct-assignment",
      "hidden-assignment",
    ]);
    expect(overview.assignments[0]).toMatchObject({
      title: "Published title",
      version: 1,
    });
    expect(overview.users).toHaveLength(7);
  });

  it("restricts trainers to granted processes and their batch members", async () => {
    const overview = await loadOverview(db, user("trainer", "trainer"));
    expect(overview.processes.map((p) => p.id)).toEqual(["visible"]);
    expect(overview.batches.map((b) => b.id)).toEqual([
      "own",
      "empty",
      "peer-only",
    ]);
    expect(overview.scenarios.map((s) => s.id)).toEqual(["visible-scenario"]);
    expect(overview.assignments.map((a) => a.id)).toEqual([
      "own-assignment",
      "peer-assignment",
      "direct-assignment",
    ]);
    expect(overview.attempts.every((a) => a.process_id === "visible")).toBe(
      true,
    );
    expect(overview.users.map((u) => u.id)).toEqual([
      "agent",
      "peer",
      "trainer",
      "unassigned",
    ]);
  });

  it("restricts agents to their assignments, attempts and memberships", async () => {
    const overview = await loadOverview(db, user("agent", "agent"));
    expect(overview.processes.map((p) => p.id)).toEqual(["visible"]);
    expect(overview.batches.map((b) => b.id)).toEqual(["own"]);
    expect(overview.batches[0].members).toEqual([
      "agent",
      "peer",
      "unassigned",
    ]);
    expect(overview.assignments.map((a) => a.id)).toEqual(["own-assignment"]);
    expect(overview.attempts.map((a) => a.id)).toEqual([
      "latest-active",
      "latest-retry",
      "voice-pass",
      "chat-pass",
    ]);
    expect(overview.scenarios).toEqual([]);
    expect(overview.users).toEqual([]);
  });

  it("keeps agents without assignments and trainers without grants empty", async () => {
    const agent = await loadOverview(db, user("unassigned", "agent"));
    expect(agent.processes).toEqual([]);
    expect(agent.batches).toEqual([]);
    expect(agent.assignments).toEqual([]);
    expect(agent.attempts).toEqual([]);
    sqlite.exec("DELETE FROM trainer_processes");
    const trainer = await loadOverview(db, user("trainer", "trainer"));
    expect(trainer.processes).toEqual([]);
    expect(trainer.batches).toEqual([]);
    expect(trainer.scenarios).toEqual([]);
    expect(trainer.assignments).toEqual([]);
    expect(trainer.attempts).toEqual([]);
    expect(trainer.users.map((u) => u.id)).toEqual(["trainer"]);
  });

  it("preserves channel approval across retries and ignores practice completion", async () => {
    const overview = await loadOverview(db, user("admin", "admin"));
    expect(overview.assignments[0]).toMatchObject({
      channels: ["chat", "voice"],
      completedChannels: ["chat", "voice"],
      completed: true,
      latestScore: 50,
    });
    expect(overview.assignments[1]).toMatchObject({
      completed: false,
      completedChannels: [],
    });
    expect(overview.assignments[2]).toMatchObject({ completed: false });
    expect(overview.assignments[2].latestScore).toBeUndefined();
    sqlite.exec("UPDATE attempts SET status='retry' WHERE id='voice-pass'");
    const pending = await loadOverview(db, user("agent", "agent"));
    expect(pending.assignments[0]).toMatchObject({
      completed: false,
      completedChannels: ["chat"],
    });
  });

  it("omits operation locks and database JSON fields from the response", async () => {
    const overview = await loadOverview(db, user("agent", "agent"));
    for (const attempt of overview.attempts) {
      expect(attempt).not.toHaveProperty("operation_token");
      expect(attempt).not.toHaveProperty("operation_started_at");
      expect(attempt).not.toHaveProperty("result_json");
    }
    expect(overview.assignments[0]).not.toHaveProperty("channels_json");
    expect(JSON.stringify(overview)).not.toContain("private answer");
  });

  it.each([
    ["admin", 7],
    ["trainer", 7],
    ["agent", 5],
  ] as const)(
    "keeps %s query count at %i as processes and batches grow",
    async (role, count) => {
      await loadOverview(db, user(role, role));
      expect(reads).toBe(count);
      for (let i = 0; i < 30; i++) {
        sqlite
          .prepare("INSERT INTO processes VALUES(?,?,?,'',0)")
          .run(`extra-${i}`, `Extra ${i}`, "Client");
        sqlite
          .prepare("INSERT INTO batches VALUES(?,?,?,0)")
          .run(`extra-batch-${i}`, `Extra ${i}`, `extra-${i}`);
        sqlite
          .prepare("INSERT INTO trainer_processes VALUES('trainer',?)")
          .run(`extra-${i}`);
      }
      reads = 0;
      await loadOverview(db, user(role, role));
      expect(reads).toBe(count);
    },
  );
});

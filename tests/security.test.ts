import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import { testDatabase } from "./helpers/database";
import type { Env } from "../worker/env";
import type { ScenarioContent } from "../src/shared/types";

vi.mock("../worker/auth", () => ({
  authFor: () => ({
    api: {
      getSession: async ({ headers }: { headers: Headers }) =>
        headers.has("x-test-user")
          ? { user: { id: headers.get("x-test-user") } }
          : null,
    },
  }),
  secretMatches: () => false,
}));

import app from "../worker/index";

const scenario: ScenarioContent = {
  title: "Test procedure", office: "back", brief: "Test", reference: "Private",
  outcome: "Done", customerName: "", persona: "", opening: "", threshold: 80,
  rubric: [{ key: "procedure", label: "Procedure", weight: 1, guidance: "" }],
  steps: [{
    id: "step", title: "Test", instructions: "Test", hint: "Try again",
    assetId: "test-image", critical: false,
    hotspots: [{
      id: "correct", label: "Complete", type: "click", x: 0, y: 0, w: 1, h: 1,
      accepted: [], correct: true, critical: false,
    }],
  }],
};

describe("action resource boundary", () => {
  let sqlite: DatabaseSync;
  let env: Env;
  let fullHistoryReads: number;

  beforeEach(() => {
    fullHistoryReads = 0;
    const database = testDatabase((sql) => {
      if (sql.startsWith("SELECT * FROM action_events")) fullHistoryReads++;
    });
    sqlite = database.sqlite;
    env = {
      DB: database.db,
      APP_URL: "http://localhost",
    } as unknown as Env;
    sqlite.exec(`
      INSERT INTO user(id,name,email,role,createdAt,updatedAt) VALUES('learner','Learner','learner@example.test','agent',0,0),('other','Other','other@example.test','agent',0,0);
      INSERT INTO processes VALUES('process','Test','Test','',0);
      INSERT INTO scenarios(id,process_id,title,office,draft_json,created_by,created_at,updated_at) VALUES('scenario','process','Test','back','{}','learner',0,0);
      INSERT INTO scenario_versions VALUES('version','scenario',1,'{}','learner',0);
      INSERT INTO assignments VALUES('assignment','version','learner',NULL,'["workflow"]','learner',0);
      INSERT INTO attempts(id,assignment_id,user_id,mode,channel,status,started_at) VALUES('attempt','assignment','learner','assessment','workflow','active',0),('second','assignment','learner','practice','workflow','active',0);
    `);
    sqlite.prepare("UPDATE scenario_versions SET content_json=?").run(JSON.stringify(scenario));
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(Date, "now").mockReturnValue(Date.UTC(2026, 9, 13));
  });

  afterEach(() => { sqlite.close(); vi.restoreAllMocks(); });

  const action = (attempt = "attempt", hotspotId: string | null = null, requestId = crypto.randomUUID(), user = "learner") =>
    app.request("http://localhost/api/attempts/" + attempt + "/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-test-user": user, Origin: "http://localhost" },
      body: JSON.stringify({ requestId, stepId: "step", hotspotId }),
    }, env);

  function seedEvents(count: number) {
    const insert = sqlite.prepare("INSERT INTO action_events VALUES(?,?,?,?,?,?,?,?,?)");
    for (let i = 0; i < count; i++) insert.run("event-" + i, "attempt", "request-" + i, "step", null, null, 0, 0, i);
  }

  it.each([null, "correct", "unrecognized"])("rejects hotspot %s at the cap before reading the full history or writing", async (hotspotId) => {
    seedEvents(1000);
    const response = await action("attempt", hotspotId);
    expect(response.status).toBe(409);
    expect(fullHistoryReads).toBe(0);
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM action_events").get()?.count).toBe(1000);
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM operation_receipts").get()?.count).toBe(0);
    expect(sqlite.prepare("SELECT operation_token FROM attempts WHERE id='attempt'").get()?.operation_token).toBeNull();
  });

  it("shares the per-user throttle across attempts without charging stored replays", async () => {
    const requestId = crypto.randomUUID();
    const first = await action("attempt", null, requestId);
    expect(first.status).toBe(200);
    const result = await first.json();
    sqlite.exec("UPDATE api_limits SET count=120");
    expect((await action("second")).status).toBe(429);
    const replay = await action("attempt", null, requestId);
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual(result);
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM action_events").get()?.count).toBe(1);
  });

  it("preserves incorrect-action evidence and correct-action progression", async () => {
    const incorrect = await action();
    expect(await incorrect.json()).toMatchObject({ correct: false, currentStep: 0 });
    const correct = await action("attempt", "correct");
    expect(await correct.json()).toMatchObject({ correct: true, currentStep: 1, complete: true });
    expect(sqlite.prepare("SELECT correct FROM action_events ORDER BY rowid").all()).toEqual([{ correct: 0 }, { correct: 1 }]);
  });

  it("allows the largest supported authored procedure beyond the minimum cap", async () => {
    const content = { ...scenario, steps: Array.from({ length: 40 }, (_, i) => ({
      ...scenario.steps[0], id: i ? "step-" + i : "step",
      hotspots: Array.from({ length: 30 }, (_, j) => ({ ...scenario.steps[0].hotspots[0], id: "action-" + i + "-" + j })),
    })) };
    sqlite.prepare("UPDATE scenario_versions SET content_json=?").run(JSON.stringify(content));
    seedEvents(1200);
    expect((await action()).status).toBe(200);
  });

  it("preserves stored replays at the cap and denies another learner", async () => {
    seedEvents(1000);
    const requestId = crypto.randomUUID();
    const saved = { correct: false, currentStep: 0, complete: false };
    sqlite.prepare("INSERT INTO operation_receipts VALUES(?,?,?)").run("attempt", requestId, JSON.stringify(saved));
    const replay = await action("attempt", null, requestId);
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual(saved);
    expect((await action("attempt", null, requestId, "other")).status).toBe(403);
    expect(fullHistoryReads).toBe(0);
  });
});

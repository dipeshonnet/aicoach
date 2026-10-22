import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import type { Env } from "../worker/env";
import { testDatabase } from "./helpers/database";

const userImportAuth = vi.hoisted(() => ({ createUser: vi.fn() }));

vi.mock("../worker/auth", () => ({
  authFor: () => ({
    api: {
      createUser: userImportAuth.createUser,
      getSession: async ({ headers }: { headers: Headers }) =>
        headers.has("x-test-user")
          ? { user: { id: headers.get("x-test-user") } }
          : null,
    },
    handler: async () => Response.json({ delegated: true }),
  }),
  secretMatches: () => false,
}));

import app from "../worker/index";

const ai = vi.hoisted(() => ({
  customerReply: vi.fn(async () => "Thank you for helping."),
  transcribe: vi.fn(async () => "Hello"),
  coach: vi.fn(),
  speech: vi.fn(),
  evaluate: vi.fn(),
}));
vi.mock("../worker/ai", () => ai);

describe("API routing and middleware", () => {
  let sqlite: DatabaseSync;
  let env: Env;

  beforeEach(() => {
    vi.clearAllMocks();
    const database = testDatabase();
    sqlite = database.sqlite;
    env = {
      DB: database.db,
      APP_URL: "http://localhost",
      ASSETS: { fetch: async () => new Response("frontend") },
    } as unknown as Env;
    sqlite.exec(`
      INSERT INTO user(id,name,email,role,banned,createdAt,updatedAt) VALUES
        ('admin','Admin','admin@example.test','admin',0,0,0),
        ('trainer','Trainer','trainer@example.test','trainer',0,0,0),
        ('agent','Agent','agent@example.test','agent',0,0,0),
        ('inactive','Inactive','inactive@example.test','agent',1,0,0);
      INSERT INTO processes VALUES('process','Test','Test','',0);
      INSERT INTO batches VALUES('batch','Test','process',0);
      INSERT INTO batch_members VALUES('batch','agent');
      INSERT INTO trainer_processes VALUES('trainer','process');
    `);
    userImportAuth.createUser.mockImplementation(async ({ body }: { body: { name: string; email: string; role: string } }) => {
      const id = crypto.randomUUID();
      sqlite.prepare("INSERT INTO user(id,name,email,role,createdAt,updatedAt) VALUES(?,?,?,?,0,0)")
        .run(id, body.name, body.email, body.role);
      return { user: { id } };
    });
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    sqlite.close();
    vi.restoreAllMocks();
  });

  function request(path: string, options: RequestInit = {}, user?: string) {
    const headers = new Headers(options.headers);
    if (user) headers.set("x-test-user", user);
    if (options.body && !(options.body instanceof FormData) && !headers.has("Content-Type"))
      headers.set("Content-Type", "application/json");
    return app.request("http://localhost" + path, { ...options, headers }, env);
  }

  function importPeople(csv: string, user = "admin") {
    return request("/api/users/import", { method: "POST", body: JSON.stringify({ csv }) }, user);
  }

  it("imports new people, updates by normalized email, and reports duplicate and invalid rows", async () => {
    const response = await importPeople('name,email,password,role\nNew Person,new@example.test,password123456,trainer\nRenamed, AGENT@example.test ,,agent\nDuplicate,agent@example.test,,agent\nBad,invalid,,agent');
    expect(response.status).toBe(200);
    const result = await response.json() as { created: number; updated: number; errors: { row: number }[] };
    expect(result.created).toBe(1); expect(result.updated).toBe(1);
    expect(result.errors.map((e) => e.row)).toEqual([4, 5]);
    expect(sqlite.prepare("SELECT name FROM user WHERE id='agent'").get()?.name).toBe("Renamed");
  });

  it("allows trainers to create agents in their batches and update scoped agents", async () => {
    const response = await importPeople('name,email,password,role,batchIds\nNew Agent,new@example.test,password123456,agent,batch\nUpdated Agent,agent@example.test,,,', 'trainer');
    expect(await response.json()).toEqual({ created: 1, updated: 1, errors: [] });
    expect(sqlite.prepare("SELECT COUNT(*) AS n FROM batch_members").get()?.n).toBe(2);
    expect(userImportAuth.createUser.mock.calls[0][0].headers).toBeUndefined();
  });

  it("rejects trainer escalation, out-of-scope people, and inaccessible batches", async () => {
    sqlite.exec("INSERT INTO processes VALUES('other','Other','Other','',0); INSERT INTO batches VALUES('other-batch','Other','other',0)");
    const response = await importPeople('name,email,password,role,batchIds\nAdmin,admin@example.test,,agent,\nNew Trainer,new@example.test,password123456,trainer,\nOutsider,inactive@example.test,,agent,\nOther,other@example.test,password123456,agent,other-batch\nUnbatched,unbatched@example.test,password123456,agent,', 'trainer');
    const result = await response.json() as { created: number; updated: number; errors: unknown[] };
    expect(result).toMatchObject({ created: 0, updated: 0 }); expect(result.errors).toHaveLength(5);
    expect(userImportAuth.createUser).not.toHaveBeenCalled();
  });

  it("blocks agents and validates the entire CSV structure before writing", async () => {
    expect((await importPeople('name,email\nName,a@example.test', 'agent')).status).toBe(403);
    expect((await importPeople('name,email\nName,a@example.test\nBroken')).status).toBe(400);
    expect(userImportAuth.createUser).not.toHaveBeenCalled();
  });

  it("revokes sessions and stale access when an admin changes a role", async () => {
    sqlite.exec("INSERT INTO session(id,expiresAt,token,createdAt,updatedAt,userId) VALUES('session',9999999999999,'token',0,0,'trainer')");
    const response = await importPeople('name,email,role\nFormer Trainer,trainer@example.test,agent');
    expect(await response.json()).toEqual({ created: 0, updated: 1, errors: [] });
    expect(sqlite.prepare("SELECT COUNT(*) AS n FROM session WHERE userId='trainer'").get()?.n).toBe(0);
    expect(sqlite.prepare("SELECT COUNT(*) AS n FROM trainer_processes WHERE user_id='trainer'").get()?.n).toBe(0);
  });

  it("prevents trainers from changing agents shared with inaccessible processes", async () => {
    sqlite.exec("INSERT INTO processes VALUES('other','Other','Other','',0); INSERT INTO batches VALUES('other-batch','Other','other',0); INSERT INTO batch_members VALUES('other-batch','agent')");
    const response = await importPeople('name,email\nChanged,agent@example.test', 'trainer');
    const result = await response.json() as { updated: number; errors: unknown[] };
    expect(result.updated).toBe(0); expect(result.errors).toHaveLength(1);
    expect(sqlite.prepare("SELECT name FROM user WHERE id='agent'").get()?.name).toBe('Agent');
  });

  it("preserves passwords and prevents changing your own administrator role", async () => {
    const response = await importPeople('name,email,password,role\nAdmin,admin@example.test,,agent\nAgent,agent@example.test,newpassword123,agent');
    const result = await response.json() as { errors: unknown[] };
    expect(result.errors).toHaveLength(2);
    expect(sqlite.prepare("SELECT role FROM user WHERE id='admin'").get()?.role).toBe('admin');
  });

  it("serves public routes before requiring a session", async () => {
    const health = await request("/api/health");
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ ok: true });
    expect(health.headers.get("Cache-Control")).toBe("no-store");
    expect(health.headers.get("X-Content-Type-Options")).toBe("nosniff");

    const setup = await request("/api/setup/status");
    expect(setup.status).toBe(200);
    expect(await setup.json()).toEqual({
      needsSetup: false,
      bootstrapConfigured: false,
    });
    expect(await (await request("/api/auth/get-session")).json()).toEqual({
      delegated: true,
    });
    expect((await request("/api/auth/sign-up/email", { method: "POST" })).status)
      .toBe(404);
  });

  it.each([
    ["GET", "/overview"],
    ["GET", "/users/agent/access"],
    ["POST", "/processes"],
    ["POST", "/batches"],
    ["POST", "/assets"],
    ["POST", "/scenarios"],
    ["POST", "/assignments"],
    ["POST", "/attempts"],
    ["POST", "/attempts/missing/turns"],
    ["POST", "/attempts/missing/submit"],
  ])("requires a session for %s %s", async (method, path) => {
    const response = await request("/api" + path, { method });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: "Your session has expired. Please sign in.",
    });
  });

  it("rejects inactive sessions and preserves the API fallback", async () => {
    expect((await request("/api/overview", {}, "inactive")).status).toBe(401);
    const missing = await request("/api/missing", {}, "admin");
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: "API endpoint not found." });
    expect(await (await request("/scenarios")).text()).toBe("frontend");
  });

  it.each([
    ["POST", "/users"],
    ["POST", "/processes"],
    ["POST", "/batches"],
    ["POST", "/assets"],
    ["POST", "/scenarios"],
    ["POST", "/assignments"],
    ["POST", "/attempts/missing/review"],
  ])("preserves role checks for %s %s", async (method, path) => {
    expect((await request("/api" + path, { method }, "agent")).status).toBe(403);
  });

  it("uses the shared JSON error handler in mounted routes", async () => {
    const malformed = await request("/api/processes", {
      method: "POST", body: "{",
    }, "admin");
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toEqual({ error: "Send a valid JSON request." });
    const invalid = await request("/api/processes", {
      method: "POST", body: "{}",
    }, "admin");
    expect(invalid.status).toBe(400);
    expect((await invalid.json() as { error: string }).error).toBeTruthy();
    expect(invalid.headers.get("Cache-Control")).toBe("no-store");
    expect((await request("/api/attempts/missing", {}, "agent")).status).toBe(404);
  });

  it("checks origin and streamed body size before dispatch", async () => {
    const crossSite = await request("/api/setup", {
      method: "POST", headers: { Origin: "https://other.example" }, body: "{}",
    });
    expect(crossSite.status).toBe(403);
    expect(await crossSite.json()).toEqual({ error: "Request origin is not permitted." });
    const oversized = await request("/api/processes", {
      method: "POST", body: "x".repeat(2 * 1024 * 1024 + 1),
    }, "admin");
    expect(oversized.status).toBe(413);
    expect(await oversized.json()).toEqual({ error: "File is too large." });
  });

  it("validates batch members consistently during creation and updates", async () => {
    const created = await request("/api/batches", {
      method: "POST",
      body: JSON.stringify({ name: "Another batch", processId: "process", members: ["inactive"] }),
    }, "admin");
    const updated = await request("/api/batches/batch/members", {
      method: "PUT", body: JSON.stringify({ members: ["inactive"] }),
    }, "admin");
    for (const response of [created, updated]) {
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "Batch members must be active agents." });
    }
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM batches").get()?.count).toBe(1);
    expect(sqlite.prepare("SELECT user_id FROM batch_members WHERE batch_id='batch'").all())
      .toEqual([{ user_id: "agent" }]);
  });

  function seedConversation(channel: "chat" | "voice") {
    sqlite.exec(`
      INSERT INTO scenarios(id,process_id,title,office,draft_json,created_by,created_at,updated_at)
        VALUES('scenario','process','Test','front','{}','admin',0,0);
      INSERT INTO scenario_versions VALUES('version','scenario',1,'{"opening":"Hello.","steps":[]}','admin',0);
      INSERT INTO assignments VALUES('assignment','version','agent',NULL,'["chat","voice"]','admin',0);
    `);
    sqlite.prepare("INSERT INTO attempts(id,assignment_id,user_id,mode,channel,status,started_at) VALUES('attempt','assignment','agent','practice',?,'active',0)")
      .run(channel);
  }

  it.each(["FSL-1048", "FSL\u20111048", "FSL\u20131048"])("advances the customer search for reference %s", async (value) => {
    seedConversation("chat");
    const content = { steps: [{
      id: "verify", hint: "Check the customer reference.",
      hotspots: [{ id: "reference", type: "input", correct: true, accepted: ["FSL-1048"] }],
    }, { id: "order", hotspots: [] }] };
    sqlite.prepare("UPDATE scenario_versions SET content_json=? WHERE id='version'").run(JSON.stringify(content));
    const requestId = crypto.randomUUID();
    const body = JSON.stringify({ requestId, stepId: "verify", hotspotId: "reference", value });
    const response = await request("/api/attempts/attempt/actions", { method: "POST", body }, "agent");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ correct: true, currentStep: 1, complete: false });
    expect(sqlite.prepare("SELECT current_step FROM attempts WHERE id='attempt'").get()?.current_step).toBe(1);
    // A retried submission must not skip another screen.
    const replay = await request("/api/attempts/attempt/actions", { method: "POST", body }, "agent");
    expect(await replay.json()).toMatchObject({ correct: true, currentStep: 1 });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM action_events").get()?.count).toBe(1);
  });

  it.each(["practice", "walkthrough", "assessment"])("explains mismatched inputs in %s without advancing", async (mode) => {
    seedConversation("chat");
    const content = { steps: [{
      id: "verify", hint: "Private trainer hint.",
      hotspots: [{ id: "reference", label: "Customer reference", type: "input", correct: true, accepted: ["FSL-1048"] }],
    }] };
    sqlite.prepare("UPDATE scenario_versions SET content_json=? WHERE id='version'").run(JSON.stringify(content));
    sqlite.prepare("UPDATE attempts SET mode=? WHERE id='attempt'").run(mode);
    const send = (value: string) => request("/api/attempts/attempt/actions", {
      method: "POST", body: JSON.stringify({ requestId: crypto.randomUUID(), stepId: "verify", hotspotId: "reference", value }),
    }, "agent");
    const wrong = await send("FSL-9999");
    expect(wrong.status).toBe(200);
    const rejected = await wrong.json() as { feedback: string };
    expect(rejected).toMatchObject({ correct: false, currentStep: 0, complete: false });
    expect(rejected.feedback).toContain('Value "FSL-9999" does not match "Customer reference".');
    if (mode === "assessment") {
      expect(rejected.feedback).not.toContain("FSL-1048");
      expect(rejected.feedback).not.toContain("Private trainer hint");
    } else expect(rejected.feedback).toContain('Accepted example: "FSL-1048".');
    expect(sqlite.prepare("SELECT current_step FROM attempts WHERE id='attempt'").get()?.current_step).toBe(0);
    const blank = await send("   ");
    expect(await blank.json()).toMatchObject({ correct: false, currentStep: 0, feedback: 'Enter a value for "Customer reference", then submit it.' });
    const corrected = await send("FSL-1048");
    expect(await corrected.json()).toMatchObject({ correct: true, currentStep: 1, complete: true, feedback: "Action completed." });
  });

  it.each(["chat", "voice"] as const)("replays completed %s turns and retries without another provider call", async (channel) => {
    seedConversation(channel);
    const requestId = crypto.randomUUID();
    sqlite.prepare("INSERT INTO turns VALUES('turn','attempt',?,1,'Hello','Thank you for helping.','completed',0)")
      .run(requestId);
    const form = new FormData();
    form.set("requestId", requestId);
    const replay = await request("/api/attempts/attempt/turns", {
      method: "POST",
      headers: channel === "voice" ? {} : { "Content-Type": "application/json" },
      body: channel === "voice" ? form : JSON.stringify({ requestId, text: "Hello" }),
    }, "agent");
    const retry = await request("/api/attempts/attempt/turns/turn/retry", {
      method: "POST",
    }, "agent");
    for (const response of [replay, retry]) {
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        id: "turn", agentText: "Hello", customerText: "Thank you for helping.", speechChunks: 1,
      });
    }
    expect(ai.customerReply).not.toHaveBeenCalled();
    expect(ai.transcribe).not.toHaveBeenCalled();
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM turns").get()?.count).toBe(1);
    expect(sqlite.prepare("SELECT operation_token FROM attempts").get()?.operation_token).toBeNull();
  });

  it("persists a new customer reply with the same response shape as its replay", async () => {
    seedConversation("chat");
    const body = JSON.stringify({ requestId: crypto.randomUUID(), text: "Hello" });
    const first = await request("/api/attempts/attempt/turns", { method: "POST", body }, "agent");
    expect(first.status).toBe(200);
    const response = await first.json();
    expect(response).toMatchObject({ agentText: "Hello", customerText: "Thank you for helping.", speechChunks: 1 });
    const replay = await request("/api/attempts/attempt/turns", { method: "POST", body }, "agent");
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual(response);
    expect(ai.customerReply).toHaveBeenCalledTimes(1);
    expect(sqlite.prepare("SELECT state,customer_text FROM turns").all()).toEqual([
      { state: "completed", customer_text: "Thank you for helping." },
    ]);
  });
});

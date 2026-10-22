import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { correctInvoiceScreen } from "../worker/seeds.ts";
const base = "https://ai-coach-pilot.dipeshonnet.workers.dev";
const admin = JSON.parse(
  readFileSync(new URL("../.pilot-admin.json", import.meta.url), "utf8"),
);
let cookie = "";
async function api(path, method = "GET", body) {
  const response = await fetch(base + "/api" + path, {
    method,
    headers: {
      Origin: base,
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (response.headers.getSetCookie().length)
    cookie = response.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      "Example update failed at " +
        path +
        ": " +
        String(data.error || data.message || response.status),
    );
  return data;
}
async function wrangler(args) {
  const child = spawn(
    process.execPath,
    ["node_modules/wrangler/bin/wrangler.js", ...args],
    {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      env: {
        ...process.env,
        WRANGLER_LOG_PATH: process.cwd() + "/.wrangler/logs",
        WRANGLER_SEND_METRICS: "false",
      },
    },
  );
  let output = "";
  child.stdout.on("data", (c) => (output += c));
  child.stderr.on("data", (c) => (output += c));
  const code = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
  });
  if (code !== 0)
    throw new Error("Cloudflare example-asset update failed: " + output);
}
try {
  await api("/auth/sign-in/email", "POST", {
    email: admin.email,
    password: admin.password,
  });
  const scenario = await api("/scenarios/scenario-invoice");
  if (scenario.published_version !== 1) {
    console.log("Invoice example already has an updated version.");
    process.exit(0);
  }
  const owner = (await api("/overview")).user.id;
  mkdirSync("output/fixtures", { recursive: true });
  const steps = [];
  for (let i = 0; i < scenario.draft.steps.length; i++) {
    const step = scenario.draft.steps[i];
    if (!step.assetId.startsWith("scenario-invoice-screen-"))
      throw new Error(
        "The example was edited; automatic sample correction is skipped.",
      );
    const response = await fetch(base + "/api/assets/" + step.assetId, {
      headers: { Cookie: cookie },
    });
    if (!response.ok)
      throw new Error("Could not read the synthetic invoice screenshot.");
    const original = await response.text();
    if (!original.includes("TRAINING SANDBOX"))
      throw new Error("Only the synthetic training example can be corrected.");
    const assetId = randomUUID(),
      key = "screenshots/" + assetId + ".svg",
      path = "output/fixtures/invoice-" + i + ".svg";
    writeFileSync(path, correctInvoiceScreen(original));
    await wrangler([
      "r2",
      "object",
      "put",
      "ai-coach-pilot-screenshots/" + key,
      "--file",
      path,
      "--content-type",
      "image/svg+xml",
      "--remote",
    ]);
    const sql =
      "INSERT INTO assets(id,process_id,object_key,mime,name,created_by,created_at) VALUES('" +
      assetId +
      "','process-retail','" +
      key +
      "','image/svg+xml','Synthetic invoice screen " +
      i +
      "','" +
      owner +
      "'," +
      Date.now() +
      ");";
    const sqlPath = "output/fixtures/invoice-asset-" + i + ".sql";
    writeFileSync(sqlPath, sql);
    await wrangler([
      "d1",
      "execute",
      "ai-coach-pilot",
      "--remote",
      "--file",
      sqlPath,
    ]);
    steps.push({ ...step, assetId });
  }
  const saved = await api("/scenarios/scenario-invoice", "PUT", {
    revision: scenario.draft_revision,
    content: { ...scenario.draft, steps },
  });
  const published = await api("/scenarios/scenario-invoice/publish", "POST", {
    revision: saved.revision,
  });
  console.log(
    "Published corrected synthetic invoice example, version " +
      published.version +
      ". Original screenshots and assessment history remain unchanged.",
  );
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Example update failed.",
  );
  process.exitCode = 1;
}

import { all } from "./store";
import { approvedChannels } from "../src/shared/engine";
import { groupBy } from "../src/shared/collections";
import type {
  Assessment,
  Assignment,
  Attempt,
  Batch,
  Channel,
  Overview,
  Process,
  Scenario,
  User,
} from "../src/shared/types";

interface Filter {
  sql: string;
  args: string[];
}

// Columns come only from the fixed queries below; user values stay bound.
function processAccess(user: User, column: string): Filter {
  if (user.role === "admin") return { sql: "1", args: [] };
  if (user.role === "trainer")
    return {
      sql: `${column} IN (SELECT process_id FROM trainer_processes WHERE user_id=?)`,
      args: [user.id],
    };
  return {
    sql: `${column} IN (
      SELECT s.process_id FROM assignments a
      JOIN scenario_versions v ON v.id=a.scenario_version_id
      JOIN scenarios s ON s.id=v.scenario_id WHERE a.user_id=?
    )`,
    args: [user.id],
  };
}

type AssignmentRow = Omit<
  Assignment,
  "channels" | "completedChannels" | "completed" | "latestScore"
> & { channels_json: string };
type AttemptRow = Omit<Attempt, "result"> & {
  result_json: string | null;
  operation_token: string | null;
  operation_started_at: number | null;
};

/** Read only visible rows in a fixed number of queries, independent of cohort size. */
export async function loadOverview(
  db: D1Database,
  user: User,
): Promise<Omit<Overview, "aiConfigured">> {
  const agent = user.role === "agent";
  const processFilter = processAccess(user, "p.id");
  const scenarioFilter = processAccess(user, "s.process_id");
  const batchFilter = processAccess(user, "b.process_id");
  if (agent) {
    batchFilter.sql +=
      " AND EXISTS (SELECT 1 FROM batch_members own WHERE own.batch_id=b.id AND own.user_id=?)";
    batchFilter.args.push(user.id);
  }
  const assignmentFilter = agent
    ? { sql: "a.user_id=?", args: [user.id] }
    : scenarioFilter;
  const attemptFilter = agent
    ? { sql: "t.user_id=?", args: [user.id] }
    : scenarioFilter;

  const [
    processes,
    batchRows,
    members,
    scenarios,
    assignmentRows,
    attemptRows,
    users,
  ] = await Promise.all([
    all<Process>(
      db,
      `SELECT p.* FROM processes p WHERE ${processFilter.sql} ORDER BY p.name`,
      ...processFilter.args,
    ),
    all<Omit<Batch, "members">>(
      db,
      `SELECT b.* FROM batches b WHERE ${batchFilter.sql} ORDER BY b.name`,
      ...batchFilter.args,
    ),
    all<{ batch_id: string; user_id: string }>(
      db,
      `
      SELECT m.batch_id,m.user_id FROM batch_members m
      JOIN batches b ON b.id=m.batch_id WHERE ${batchFilter.sql}
      ORDER BY m.batch_id,m.user_id`,
      ...batchFilter.args,
    ),
    agent
      ? Promise.resolve([] as Scenario[])
      : all<Scenario>(
          db,
          `
      SELECT s.id,s.process_id,s.title,s.office,s.draft_revision,s.published_version,s.updated_at
      FROM scenarios s WHERE ${scenarioFilter.sql} ORDER BY s.updated_at DESC`,
          ...scenarioFilter.args,
        ),
    all<AssignmentRow>(
      db,
      `
      SELECT a.*,json_extract(v.content_json,'$.title') AS title,
        json_extract(v.content_json,'$.office') AS office,s.process_id,v.version,
        p.name AS process_name,u.name AS user_name
      FROM assignments a JOIN scenario_versions v ON v.id=a.scenario_version_id
      JOIN scenarios s ON s.id=v.scenario_id JOIN processes p ON p.id=s.process_id
      JOIN user u ON u.id=a.user_id
      WHERE ${assignmentFilter.sql} ORDER BY a.assigned_at DESC`,
      ...assignmentFilter.args,
    ),
    all<AttemptRow>(
      db,
      `
      SELECT t.*,json_extract(v.content_json,'$.title') AS title,s.process_id,u.name AS user_name
      FROM attempts t JOIN assignments a ON a.id=t.assignment_id
      JOIN scenario_versions v ON v.id=a.scenario_version_id
      JOIN scenarios s ON s.id=v.scenario_id JOIN user u ON u.id=t.user_id
      WHERE ${attemptFilter.sql} ORDER BY t.started_at DESC`,
      ...attemptFilter.args,
    ),
    agent
      ? Promise.resolve([] as User[])
      : all<User>(
          db,
          `
      SELECT u.id,u.name,u.email,u.role,u.banned FROM user u
      ${
        user.role === "trainer"
          ? `WHERE u.id=? OR EXISTS (
        SELECT 1 FROM batch_members m JOIN batches b ON b.id=m.batch_id
        WHERE m.user_id=u.id AND ${batchFilter.sql}
      )`
          : ""
      } ORDER BY u.name`,
          ...(user.role === "trainer" ? [user.id, ...batchFilter.args] : []),
        ),
  ]);

  const attempts: Attempt[] = attemptRows.map(
    ({
      result_json,
      operation_token: _lock,
      operation_started_at: _lockTime,
      ...attempt
    }) => ({
      ...attempt,
      result: result_json ? (JSON.parse(result_json) as Assessment) : null,
    }),
  );
  const attemptsByAssignment = groupBy(
    attempts,
    (attempt) => attempt.assignment_id,
  );
  const membersByBatch = groupBy(members, (member) => member.batch_id);
  const batches = batchRows.map((batch) => ({
    ...batch,
    members: (membersByBatch.get(batch.id) ?? []).map(
      (member) => member.user_id,
    ),
  }));
  const assignments = assignmentRows.map(({ channels_json, ...assignment }) => {
    const channels = JSON.parse(channels_json) as Channel[];
    const history = attemptsByAssignment.get(assignment.id) ?? [];
    const completedChannels = approvedChannels(channels, history) as Channel[];
    return {
      ...assignment,
      channels,
      completedChannels,
      completed: channels.length === completedChannels.length,
      latestScore: history.find((attempt) => attempt.result)?.result?.score,
    };
  });
  return { user, processes, batches, scenarios, assignments, attempts, users };
}

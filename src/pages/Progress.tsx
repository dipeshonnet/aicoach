import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  BookOpen,
  CheckCheck,
  FileCheck2,
  Sparkles,
} from "lucide-react";
import { useOverview } from "../lib/overview";
import { date } from "../lib/api";
import { Badge, Empty, PageTitle } from "../components/ui";
import { Stat } from "../components/Stat";
import { groupBy } from "../shared/collections";

export function Progress() {
  const data = useOverview(),
    [process, setProcess] = useState("all"),
    [batch, setBatch] = useState("all"),
    [agent, setAgent] = useState("all");
  const assignments = useMemo(() => {
    const batchIds = new Set(
      data.batches.find((b) => b.id === batch)?.members ?? [],
    );
    return data.assignments.filter(
      (a) =>
        (process === "all" || a.process_id === process) &&
        (batch === "all" || batchIds.has(a.user_id)) &&
        (agent === "all" || a.user_id === agent),
    );
  }, [data.assignments, data.batches, process, batch, agent]);
  const assignmentsByUser = useMemo(
    () => groupBy(assignments, (a) => a.user_id),
    [assignments],
  );
  const ids = new Set(assignments.map((a) => a.id)),
    attempts = data.attempts.filter(
      (t) => ids.has(t.assignment_id) && t.mode === "assessment",
    );
  const complete = assignments.filter((a) => a.completed).length,
    scored = attempts.filter((t) => t.result),
    average = scored.length
      ? Math.round(
          scored.reduce((sum, t) => sum + t.result!.score, 0) / scored.length,
        )
      : null;
  const users =
    data.user.role === "agent"
      ? [data.user]
      : data.users.filter((u) => u.role === "agent");
  return (
    <>
      <PageTitle
        eyebrow="SEE THE CONFIDENCE GROW"
        title={
          data.user.role === "agent" ? "Your progress" : "Progress & results"
        }
        description="Follow the journey from first practice to trainer-approved readiness."
      />
      {data.user.role !== "agent" && (
        <div className="filter-bar">
          <select
            aria-label="Filter process"
            value={process}
            onChange={(e) => setProcess(e.target.value)}
          >
            <option value="all">All processes</option>
            {data.processes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter batch"
            value={batch}
            onChange={(e) => setBatch(e.target.value)}
          >
            <option value="all">All batches</option>
            {data.batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter agent"
            value={agent}
            onChange={(e) => setAgent(e.target.value)}
          >
            <option value="all">All agents</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="stats-grid">
        <Stat
          label="Assigned"
          value={assignments.length}
          icon={BookOpen}
          detail="Matching assignments"
        />
        <Stat
          label="Completed"
          value={complete}
          icon={CheckCheck}
          detail="All channels approved"
        />
        <Stat
          label="Assessment attempts"
          value={attempts.length}
          icon={FileCheck2}
          detail="Earlier attempts stay in the history"
        />
        <Stat
          label="Average score"
          value={average === null ? "—" : average + "%"}
          icon={Sparkles}
          detail="Across scored assessments"
        />
      </div>
      <section className="panel">
        <div className="panel-heading">
          <h2>Agent readiness</h2>
          <Badge>{users.length} agents</Badge>
        </div>
        {assignments.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>Assigned</th>
                  <th>Approved</th>
                  <th>Completion</th>
                  <th>Readiness</th>
                </tr>
              </thead>
              <tbody>
                {users
                  .filter((u) => assignmentsByUser.has(u.id))
                  .map((u) => {
                    const rows = assignmentsByUser.get(u.id)!,
                      done = rows.filter((a) => a.completed).length,
                      rate = Math.round((done / rows.length) * 100);
                    return (
                      <tr key={u.id}>
                        <td>
                          <strong>{u.name}</strong>
                          <small>{u.email}</small>
                        </td>
                        <td>{rows.length}</td>
                        <td>{done}</td>
                        <td>
                          <div className="inline-progress">
                            <div>
                              <i style={{ width: rate + "%" }} />
                            </div>
                            <span>{rate}%</span>
                          </div>
                        </td>
                        <td>
                          <Badge tone={rate === 100 ? "success" : "neutral"}>
                            {rate === 100 ? "Training complete" : "In progress"}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="No progress yet">
            Assigned scenarios and reviewed assessments will appear here.
          </Empty>
        )}
      </section>
      <div className="section-head">
        <h2>Assessment history</h2>
        <span className="muted">Every attempt, preserved</span>
      </div>
      {attempts.length ? (
        <div className="panel table-scroll">
          <table>
            <thead>
              <tr>
                <th>Scenario</th>
                <th>Agent / channel</th>
                <th>Score</th>
                <th>Trainer decision</th>
                <th>Date</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {attempts.map((t) => (
                <tr key={t.id}>
                  <td>
                    <strong>{t.title}</strong>
                  </td>
                  <td>
                    {t.user_name || data.user.name}
                    <small>{t.channel}</small>
                  </td>
                  <td>{t.result ? t.result.score + "%" : "—"}</td>
                  <td>
                    <Badge
                      tone={
                        t.status === "approved"
                          ? "success"
                          : t.status === "retry"
                            ? "warning"
                            : "neutral"
                      }
                    >
                      {t.status === "submitted"
                        ? "Awaiting review"
                        : t.status === "retry"
                          ? "Retry requested"
                          : t.status === "approved"
                            ? "Approved"
                            : "In progress"}
                    </Badge>
                  </td>
                  <td>{date(t.started_at)}</td>
                  <td>
                    <Link
                      className="text-link"
                      to={
                        data.user.role === "agent"
                          ? "/learn/" + t.id
                          : "/reviews/" + t.id
                      }
                    >
                      View
                      <ArrowUpRight size={14} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty title="Your next assessment starts the story">
          Scored attempts will appear here with feedback and trainer decisions.
        </Empty>
      )}
    </>
  );
}

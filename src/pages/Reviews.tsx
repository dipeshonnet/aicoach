import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { useOverview } from "../lib/overview";
import { date } from "../lib/api";
import { Badge, Empty, PageTitle } from "../components/ui";

export function Reviews() {
  const data = useOverview(),
    [filter, setFilter] = useState("submitted"),
    [process, setProcess] = useState("all");
  const attempts = data.attempts.filter(
    (t) =>
      t.mode === "assessment" &&
      (filter === "all" || t.status === filter) &&
      (process === "all" || t.process_id === process),
  );
  return (
    <>
      <PageTitle
        eyebrow="YOUR FEEDBACK MAKES THE DIFFERENCE"
        title="Review queue"
        description="See the evidence, coach the next step, and confirm when an agent is ready."
      />
      <div className="filter-bar">
        <select
          aria-label="Review status"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="submitted">Awaiting review</option>
          <option value="approved">Approved</option>
          <option value="retry">Retry requested</option>
          <option value="all">All assessments</option>
        </select>
        <select
          aria-label="Client process"
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
        <span className="muted">{attempts.length} assessments</span>
      </div>
      {attempts.length ? (
        <div className="panel table-scroll">
          <table>
            <thead>
              <tr>
                <th>Agent</th>
                <th>Scenario</th>
                <th>Score</th>
                <th>Critical checks</th>
                <th>Submitted</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {attempts.map((t) => (
                <tr key={t.id}>
                  <td>
                    <strong>{t.user_name}</strong>
                    <small>{t.channel} assessment</small>
                  </td>
                  <td>{t.title}</td>
                  <td>
                    <Badge tone={t.result?.passed ? "success" : "warning"}>
                      {t.result ? t.result.score + "%" : "Unfinished"}
                    </Badge>
                  </td>
                  <td>
                    {t.result
                      ? t.result.criticalPassed
                        ? "Passed"
                        : "Needs attention"
                      : "—"}
                  </td>
                  <td>{date(t.submitted_at || t.started_at)}</td>
                  <td>
                    <Link className="text-link" to={"/reviews/" + t.id}>
                      Review
                      <ArrowUpRight size={14} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          title={
            filter === "submitted"
              ? "You’re all caught up."
              : "No assessments match this view."
          }
        >
          {filter === "submitted"
            ? "Submitted agent assessments will appear here for your review and approval."
            : "Try a different status or process filter."}
        </Empty>
      )}
    </>
  );
}

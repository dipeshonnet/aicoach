import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Clock3,
  FileCheck2,
  Headphones,
  Layers3,
  MessageSquare,
  Plus,
  Search,
} from "lucide-react";
import { useOverview } from "../lib/overview";
import type { Scenario } from "../shared/types";
import { date } from "../lib/api";
import { Badge, Empty, ErrorNotice, PageTitle } from "../components/ui";
import { AssignDialog } from "../components/AssignDialog";
import { ExportSopButton } from "../components/ExportSopButton";

export function Library() {
  const data = useOverview(),
    [search, setSearch] = useState(""),
    [office, setOffice] = useState("all"),
    [process, setProcess] = useState("all"),
    [assign, setAssign] = useState<Scenario | null>(null),
    [error, setError] = useState("");
  const scenarios = data.scenarios.filter(
    (s) =>
      s.title.toLowerCase().includes(search.toLowerCase()) &&
      (office === "all" || s.office === office) &&
      (process === "all" || s.process_id === process),
  );
  return (
    <>
      <PageTitle
        eyebrow="TURN EXPERIENCE INTO LEARNING"
        title="Scenario library"
        description="Build realistic practice from the work your team does every day."
        action={
          <Link to="/scenarios/new" className="button primary">
            <Plus size={17} />
            Create scenario
          </Link>
        }
      />
      {error && <ErrorNotice message={error} />}
      <div className="filter-bar">
        <div className="search-field">
          <Search size={17} />
          <input
            aria-label="Search scenarios"
            placeholder="Search scenarios…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          aria-label="Office type"
          value={office}
          onChange={(e) => setOffice(e.target.value)}
        >
          <option value="all">All office types</option>
          <option value="front">Front office</option>
          <option value="back">Back office</option>
        </select>
        <select
          aria-label="Process"
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
        <span className="muted">{scenarios.length} scenarios</span>
      </div>
      {scenarios.length ? (
        <div className="scenario-grid">
          {scenarios.map((s) => (
            <article key={s.id} className="scenario-card">
              <div className="card-top">
                <span
                  className={
                    "scenario-icon " + (s.office === "front" ? "green" : "sand")
                  }
                >
                  {s.office === "front" ? <Headphones /> : <FileCheck2 />}
                </span>
                <Badge tone={s.published_version ? "success" : "neutral"}>
                  {s.published_version
                    ? "Published · v" + s.published_version
                    : "Draft"}
                </Badge>
              </div>
              <small className="eyebrow">
                {s.office === "front" ? "FRONT OFFICE" : "BACK OFFICE"}
              </small>
              <h3>
                <Link to={"/scenarios/" + s.id}>{s.title}</Link>
              </h3>
              <p>{data.processes.find((p) => p.id === s.process_id)?.name}</p>
              <div className="card-tags">
                {s.office === "front" ? (
                  <>
                    <span>
                      <MessageSquare size={13} />
                      Chat
                    </span>
                    <span>
                      <Headphones size={13} />
                      Voice
                    </span>
                  </>
                ) : (
                  <span>
                    <Layers3 size={13} />
                    Work item
                  </span>
                )}
                <span>
                  <Clock3 size={13} />
                  {date(s.updated_at)}
                </span>
              </div>
              <div className="card-actions">
                <Link to={"/scenarios/" + s.id} className="text-link">
                  Open builder
                  <ArrowRight size={15} />
                </Link>
                <ExportSopButton
                  scenarioId={s.id}
                  source={{
                    process: data.processes.find((p) => p.id === s.process_id),
                  }}
                  small
                  onError={setError}
                />
                <button
                  className="button small"
                  disabled={!s.published_version}
                  onClick={() => setAssign(s)}
                >
                  Assign
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title={
            data.scenarios.length
              ? "No matching scenarios"
              : "Your first scenario starts here"
          }
          action={
            <Link to="/scenarios/new" className="button primary">
              <Plus size={16} />
              Create scenario
            </Link>
          }
        >
          {data.scenarios.length
            ? "Try a different search or filter."
            : "Create a process, upload screenshots, and add the steps your agents will practise."}
        </Empty>
      )}
      {assign && (
        <AssignDialog scenario={assign} onClose={() => setAssign(null)} />
      )}
    </>
  );
}

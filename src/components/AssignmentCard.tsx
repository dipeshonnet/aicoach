import {
  ArrowRight,
  BookOpen,
  CheckCheck,
  FileCheck2,
  Headphones,
} from "lucide-react";
import type { Assignment } from "../shared/types";
import { Badge } from "./ui";

export function AssignmentCard({
  assignment: a,
  onStart,
}: {
  assignment: Assignment;
  onStart: () => void;
}) {
  return (
    <article className="scenario-card">
      <div className="card-top">
        <span
          className={
            "scenario-icon " + (a.office === "front" ? "green" : "sand")
          }
        >
          {a.office === "front" ? <Headphones /> : <FileCheck2 />}
        </span>
        <Badge tone={a.completed ? "success" : "neutral"}>
          {a.completed ? "Completed" : "In progress"}
        </Badge>
      </div>
      <small className="eyebrow">
        {a.office === "front" ? "FRONT OFFICE" : "BACK OFFICE"} · VERSION{" "}
        {a.version}
      </small>
      <h3>{a.title}</h3>
      <p>{a.process_name}</p>
      <div className="card-tags">
        {a.channels.map((c) => (
          <span key={c}>
            {a.completedChannels.includes(c) ? (
              <CheckCheck size={13} />
            ) : c === "voice" ? (
              <Headphones size={13} />
            ) : (
              <BookOpen size={13} />
            )}{" "}
            {c}
          </span>
        ))}
      </div>
      <div className="card-actions">
        <small>
          {a.latestScore !== undefined
            ? "Latest score: " + a.latestScore + "%"
            : "Ready when you are"}
        </small>
        <button className="button primary small" onClick={onStart}>
          {a.completed ? "Practise again" : "Start learning"}
          <ArrowRight size={14} />
        </button>
      </div>
    </article>
  );
}

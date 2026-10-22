import { CheckCircle2, Lightbulb } from "lucide-react";
import type { Attempt } from "../shared/types";
import { Badge } from "./ui";

export function Results({
  result,
}: {
  result: NonNullable<Attempt["result"]>;
}) {
  return (
    <>
      <div className="result-hero">
        <div className="result-score">
          <strong>
            {result.score}
            <small>%</small>
          </strong>
          <span>Overall score</span>
        </div>
        <div>
          <Badge tone={result.passed ? "success" : "warning"}>
            {result.passed ? "Passing score" : "More practice needed"}
          </Badge>
          <h2>
            {result.passed
              ? "A confident step forward."
              : "Every attempt is a chance to learn."}
          </h2>
          <p>
            {result.criticalPassed
              ? "All critical checks passed."
              : "A critical check was missed or failed."}{" "}
            · {Math.floor(result.elapsedSeconds / 60)}m{" "}
            {result.elapsedSeconds % 60}s elapsed
          </p>
        </div>
      </div>
      <div className="criteria-grid">
        {result.criteria.map((c) => (
          <section className="panel criterion-card" key={c.key}>
            <span className="eyebrow">{c.key}</span>
            <strong>
              {c.score}
              <small>/100</small>
            </strong>
            <div className="score-bar">
              <i style={{ width: c.score + "%" }} />
            </div>
            <p>{c.feedback}</p>
          </section>
        ))}
      </div>
      <div className="result-notes">
        <section className="panel form-panel">
          <h3>
            <CheckCircle2 size={18} />
            What went well
          </h3>
          {result.strengths.length ? (
            <ul>
              {result.strengths.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          ) : (
            <p className="muted">
              Keep practising to build evidence of your strengths.
            </p>
          )}
        </section>
        <section className="panel form-panel">
          <h3>
            <Lightbulb size={18} />
            Your next opportunity
          </h3>
          {result.improvements.length ? (
            <ul>
              {result.improvements.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          ) : (
            <p className="muted">
              Keep building consistency in your next practice.
            </p>
          )}
        </section>
      </div>
    </>
  );
}

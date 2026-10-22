import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCheck, Lightbulb } from "lucide-react";
import { useOverview } from "../lib/overview";
import type { Attempt } from "../shared/types";
import { api, date, errorText, post } from "../lib/api";
import {
  Badge,
  ErrorNotice,
  Field,
  Modal,
  Notice,
  PageTitle,
  Spinner,
} from "../components/ui";
import { Results } from "../components/Results";
import { queryKeys } from "../lib/query-keys";

export function ReviewDetail() {
  const { id } = useParams(),
    data = useOverview(),
    client = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.attempt(id),
    queryFn: () => api<Attempt & { opening: string }>("/attempts/" + id),
  });
  const [note, setNote] = useState(""),
    [decision, setDecision] = useState<"approved" | "retry" | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function review() {
    setBusy(true);
    setError("");
    try {
      await post("/attempts/" + id + "/review", { decision, note });
      setDecision(null);
      await client.invalidateQueries({ queryKey: queryKeys.attempt(id) });
      await client.invalidateQueries({ queryKey: queryKeys.overview });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  if (query.isPending) return <Spinner label="Opening assessment evidence…" />;
  if (query.error) return <ErrorNotice message={errorText(query.error)} />;
  const attempt = query.data,
    summary = data.attempts.find((t) => t.id === id);
  return (
    <>
      <Link className="back-link" to="/reviews">
        <ArrowLeft size={15} />
        Review queue
      </Link>
      <PageTitle
        eyebrow="ASSESSMENT REVIEW"
        title={attempt.scenario?.title || "Assessment"}
        description={
          (summary?.user_name || "Agent") +
          " · " +
          attempt.channel +
          " · Version " +
          attempt.scenario?.version +
          " · " +
          date(attempt.started_at)
        }
        action={
          <Badge tone={attempt.status === "approved" ? "success" : "neutral"}>
            {attempt.status === "submitted"
              ? "Awaiting review"
              : attempt.status === "retry"
                ? "Retry requested"
                : attempt.status}
          </Badge>
        }
      />
      {error && <ErrorNotice message={error} />}{" "}
      {attempt.result ? (
        <Results result={attempt.result} />
      ) : (
        <Notice>This attempt has no assessment result yet.</Notice>
      )}
      {attempt.reviewContext && (
        <details className="panel form-panel">
          <summary>Reference instructions for this scenario version</summary>
          <p style={{ whiteSpace: "pre-wrap" }}>
            {attempt.reviewContext.reference}
          </p>
          <strong>Expected outcome</strong>
          <p style={{ whiteSpace: "pre-wrap" }}>
            {attempt.reviewContext.outcome}
          </p>
          <p className="muted">
            Suggested pass: {attempt.reviewContext.threshold}% and all critical
            checks.
          </p>
        </details>
      )}
      <div className="review-evidence">
        <section className="panel">
          <div className="panel-heading">
            <h2>Procedure evidence</h2>
            <Badge>{attempt.events?.length || 0} actions</Badge>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Step</th>
                  <th>Action / answer</th>
                  <th>Result</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {attempt.events?.map((e) => {
                  const step = attempt.scenario?.steps.find(
                      (s) => s.id === e.step_id,
                    ),
                    hotspot = step?.hotspots.find((h) => h.id === e.hotspot_id);
                  return (
                    <tr key={e.id}>
                      <td>{step?.title || e.step_id}</td>
                      <td>
                        {hotspot?.label || "Unrecognised action"}
                        {e.value && <small>{e.value}</small>}
                        <small className="evidence-id">
                          Evidence: {e.id.slice(0, 8)}
                        </small>
                      </td>
                      <td>
                        <Badge tone={e.correct ? "success" : "warning"}>
                          {e.correct
                            ? "Correct"
                            : e.critical
                              ? "Critical failure"
                              : "Incorrect"}
                        </Badge>
                      </td>
                      <td>{new Date(e.created_at).toLocaleTimeString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!attempt.events?.length && (
            <p className="muted padded">No procedure actions were recorded.</p>
          )}
        </section>
        <section className="panel">
          <div className="panel-heading">
            <h2>Conversation transcript</h2>
            <Badge>{attempt.channel}</Badge>
          </div>
          <div className="review-transcript">
            {attempt.opening && (
              <div className="transcript-line">
                <strong>Customer</strong>
                <p>{attempt.opening}</p>
              </div>
            )}
            {attempt.turns?.map((t) => (
              <div key={t.id}>
                <div className="transcript-line">
                  <strong>Agent</strong>
                  <p>{t.agent_text}</p>
                  <small className="evidence-id">
                    Evidence: {t.id.slice(0, 8)}
                  </small>
                </div>
                {t.customer_text && (
                  <div className="transcript-line">
                    <strong>Customer</strong>
                    <p>{t.customer_text}</p>
                  </div>
                )}
              </div>
            ))}
            {!attempt.turns?.length && (
              <p className="muted">
                No customer conversation for this work-item attempt.
              </p>
            )}
          </div>
        </section>
      </div>
      {attempt.status === "submitted" && attempt.mode === "assessment" && (
        <section className="panel form-panel review-decision">
          <h2>Your trainer decision</h2>
          <p className="muted">
            Review the result and evidence before recording completion. Only
            passing assessments can be approved.
          </p>
          <Field label="Feedback for the agent">
            <textarea
              value={note}
              maxLength={4000}
              rows={4}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What went well? What should they practise next?"
            />
          </Field>
          <div className="review-buttons">
            <button
              className="button"
              onClick={() => setDecision("retry")}
              disabled={!note.trim() || busy}
            >
              <Lightbulb size={16} />
              Request another attempt
            </button>
            <button
              className="button primary"
              onClick={() => setDecision("approved")}
              disabled={!attempt.result?.passed || busy}
            >
              <CheckCheck size={17} />
              Approve completion
            </button>
          </div>
        </section>
      )}
      {attempt.review_note && (
        <section className="panel form-panel">
          <h3>Recorded trainer feedback</h3>
          <p>{attempt.review_note}</p>
          <small className="muted">
            {attempt.reviewed_at && date(attempt.reviewed_at)}
          </small>
        </section>
      )}
      {decision && (
        <Modal
          title={
            decision === "approved"
              ? "Approve this assessment?"
              : "Request another attempt?"
          }
          onClose={() => setDecision(null)}
        >
          <p>
            {decision === "approved"
              ? "This channel will be recorded as completed for the agent."
              : "The agent will see your feedback and can take a new assessment. This attempt stays in their history."}
          </p>
          <div className="modal-actions">
            <button className="button" onClick={() => setDecision(null)}>
              Cancel
            </button>
            <button className="button primary" onClick={review} disabled={busy}>
              {busy ? "Recording…" : "Confirm decision"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import type { Assignment, Channel } from "../shared/types";
import { errorText, post } from "../lib/api";
import { ErrorNotice, Field, Modal } from "./ui";

export function StartDialog({
  assignment,
  onClose,
}: {
  assignment: Assignment;
  onClose: () => void;
}) {
  const [channel, setChannel] = useState<Channel>(assignment.channels[0]),
    [mode, setMode] = useState("walkthrough"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    navigate = useNavigate();
  async function start() {
    setBusy(true);
    setError("");
    try {
      const result = await post<{ id: string }>("/attempts", {
        assignmentId: assignment.id,
        channel,
        mode,
      });
      navigate("/learn/" + result.id);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Choose your next step" onClose={onClose}>
      <p className="muted">{assignment.title}</p>
      {error && <ErrorNotice message={error} />}
      <div className="learning-modes">
        {[
          {
            id: "walkthrough",
            name: "Learn the process",
            description: "Follow the instructions and highlighted actions.",
          },
          {
            id: "practice",
            name: "Practise with support",
            description: "Try the scenario with hints and coaching.",
          },
          {
            id: "assessment",
            name: "Take an assessment",
            description: "Work independently, then receive your score.",
          },
        ].map((m) => (
          <button
            key={m.id}
            className={mode === m.id ? "selected" : ""}
            onClick={() => setMode(m.id)}
          >
            <span className="radio-dot" />
            <span>
              <strong>{m.name}</strong>
              <small>{m.description}</small>
            </span>
          </button>
        ))}
      </div>
      {assignment.channels.length > 1 && (
        <Field label="Conversation channel">
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value as Channel)}
          >
            {assignment.channels.map((c) => (
              <option key={c} value={c}>
                {c === "chat" ? "Customer chat" : "Turn-based voice"}
              </option>
            ))}
          </select>
        </Field>
      )}
      <div className="modal-actions">
        <button className="button" onClick={onClose}>
          Cancel
        </button>
        <button className="button primary" onClick={start} disabled={busy}>
          {busy ? "Opening…" : "Continue"}
          <ArrowRight size={16} />
        </button>
      </div>
    </Modal>
  );
}

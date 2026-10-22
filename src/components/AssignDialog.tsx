import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useOverview } from "../lib/overview";
import type { Channel, Scenario } from "../shared/types";
import { errorText, post } from "../lib/api";
import { ErrorNotice, Field, Modal, Notice } from "./ui";
import { queryKeys } from "../lib/query-keys";

export function AssignDialog({
  scenario,
  onClose,
}: {
  scenario: Scenario;
  onClose: () => void;
}) {
  const data = useOverview(),
    client = useQueryClient(),
    [target, setTarget] = useState("batch"),
    [selected, setSelected] = useState(""),
    [channels, setChannels] = useState<Channel[]>(
      scenario.office === "back" ? ["workflow"] : ["chat"],
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const batches = data.batches.filter(
      (b) => b.process_id === scenario.process_id,
    ),
    members = new Set(batches.flatMap((b) => b.members));
  const agents = data.users.filter(
    (u) =>
      u.role === "agent" &&
      !u.banned &&
      (data.user.role === "admin" || members.has(u.id)),
  );
  async function submit() {
    setError("");
    setBusy(true);
    try {
      await post("/assignments", {
        scenarioId: scenario.id,
        ...(target === "batch" ? { batchId: selected } : { userId: selected }),
        channels,
      });
      await client.invalidateQueries({ queryKey: queryKeys.overview });
      onClose();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Assign a scenario" onClose={onClose}>
      <p className="muted">
        {scenario.title} · Published version {scenario.published_version}
      </p>
      {error && <ErrorNotice message={error} />}
      <Field label="Assign to">
        <select
          value={target}
          onChange={(e) => {
            setTarget(e.target.value);
            setSelected("");
          }}
        >
          <option value="batch">Training batch</option>
          <option value="agent">Individual agent</option>
        </select>
      </Field>
      <Field label={target === "batch" ? "Batch" : "Agent"}>
        <select value={selected} onChange={(e) => setSelected(e.target.value)}>
          <option value="">
            Choose {target === "batch" ? "a batch" : "an agent"}
          </option>
          {target === "batch"
            ? batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} · {b.members.length} agents
                </option>
              ))
            : agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
        </select>
      </Field>
      {scenario.office === "front" && (
        <fieldset className="choice-set">
          <legend>Required assessment channels</legend>
          {(["chat", "voice"] as Channel[]).map((channel) => (
            <label key={channel}>
              <input
                type="checkbox"
                checked={channels.includes(channel)}
                onChange={(e) =>
                  setChannels(
                    e.target.checked
                      ? [...channels, channel]
                      : channels.filter((c) => c !== channel),
                  )
                }
              />
              {channel === "chat" ? "Customer chat" : "Turn-based voice"}
            </label>
          ))}
        </fieldset>
      )}
      <Notice>
        Each required channel needs a passing assessment and trainer approval.
        Practice attempts do not mark completion.
      </Notice>
      <div className="modal-actions">
        <button className="button" onClick={onClose}>
          Cancel
        </button>
        <button
          className="button primary"
          disabled={!selected || !channels.length || busy}
          onClick={submit}
        >
          {busy ? "Assigning…" : "Assign scenario"}
        </button>
      </div>
    </Modal>
  );
}

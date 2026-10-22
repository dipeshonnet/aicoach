import { useMemo, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Users } from "lucide-react";
import { useOverview } from "../lib/overview";
import type { Batch } from "../shared/types";
import { errorText, post, put } from "../lib/api";
import {
  Badge,
  Empty,
  ErrorNotice,
  Field,
  Modal,
  PageTitle,
} from "../components/ui";
import { queryKeys } from "../lib/query-keys";
import { groupBy } from "../shared/collections";

export function Batches() {
  const data = useOverview(),
    client = useQueryClient(),
    [show, setShow] = useState(false),
    [editing, setEditing] = useState<Batch | null>(null),
    [members, setMembers] = useState<string[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const admin = data.user.role === "admin",
    agents = data.users.filter((u) => u.role === "agent" && !u.banned);
  const assignmentsByBatch = useMemo(
    () => groupBy(data.assignments, (a) => a.batch_id),
    [data.assignments],
  );
  const processesById = useMemo(
    () => new Map(data.processes.map((p) => [p.id, p])),
    [data.processes],
  );
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const form = new FormData(e.currentTarget);
    try {
      await post("/batches", {
        name: form.get("name"),
        processId: form.get("processId"),
        members,
      });
      await client.invalidateQueries({ queryKey: queryKeys.overview });
      setShow(false);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    setBusy(true);
    setError("");
    try {
      await put("/batches/" + editing!.id + "/members", { members });
      await client.invalidateQueries({ queryKey: queryKeys.overview });
      setEditing(null);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  const choices = (
    <fieldset className="choice-set">
      <legend>Agents in this batch</legend>
      {agents.length ? (
        agents.map((u) => (
          <label key={u.id}>
            <input
              type="checkbox"
              checked={members.includes(u.id)}
              onChange={(e) =>
                setMembers(
                  e.target.checked
                    ? [...members, u.id]
                    : members.filter((id) => id !== u.id),
                )
              }
            />
            <span>
              {u.name}
              <small>{u.email}</small>
            </span>
          </label>
        ))
      ) : (
        <p>Add agent accounts in People & access first.</p>
      )}
    </fieldset>
  );
  return (
    <>
      <PageTitle
        eyebrow="GROW TOGETHER"
        title="Training batches"
        description="Organise new hires by process and follow their progress as a team."
        action={
          admin && (
            <button
              className="button primary"
              onClick={() => {
                setShow(true);
                setMembers([]);
                setError("");
              }}
            >
              <Plus size={17} />
              Create batch
            </button>
          )
        }
      />
      {data.batches.length ? (
        <div className="scenario-grid">
          {data.batches.map((b) => {
            const rows = assignmentsByBatch.get(b.id) ?? [],
              done = rows.filter((a) => a.completed).length,
              rate = rows.length ? Math.round((done / rows.length) * 100) : 0;
            return (
              <article className="scenario-card" key={b.id}>
                <div className="card-top">
                  <span className="scenario-icon green">
                    <Users />
                  </span>
                  <Badge>{b.members.length} agents</Badge>
                </div>
                <h3>{b.name}</h3>
                <p>{processesById.get(b.process_id)?.name}</p>
                <div className="batch-progress">
                  <span>
                    Training completion<strong>{rate}%</strong>
                  </span>
                  <div>
                    <i style={{ width: rate + "%" }} />
                  </div>
                  <small>
                    {done} of {rows.length} assignments approved
                  </small>
                </div>
                {admin && (
                  <div className="card-actions">
                    <button
                      className="text-link"
                      onClick={() => {
                        setEditing(b);
                        setMembers(b.members);
                        setError("");
                      }}
                    >
                      Manage members
                      <ArrowIcon />
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <Empty title="Start a learning cohort">
          Create a batch and add agents. Trainers can then assign scenarios to
          the whole group.
        </Empty>
      )}
      {show && (
        <Modal title="Create a training batch" onClose={() => setShow(false)}>
          <form onSubmit={create}>
            {error && <ErrorNotice message={error} />}
            <Field label="Batch name">
              <input
                name="name"
                placeholder="October new hires"
                required
                minLength={2}
              />
            </Field>
            <Field label="Client process">
              <select name="processId" required>
                <option value="">Choose a process</option>
                {data.processes.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {p.client}
                  </option>
                ))}
              </select>
            </Field>
            {choices}
            <div className="modal-actions">
              <button
                className="button"
                type="button"
                onClick={() => setShow(false)}
              >
                Cancel
              </button>
              <button className="button primary" disabled={busy}>
                {busy ? "Creating…" : "Create batch"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {editing && (
        <Modal
          title={"Members · " + editing.name}
          onClose={() => setEditing(null)}
        >
          {error && <ErrorNotice message={error} />} {choices}
          <p className="muted">
            Existing individual assignments remain on an agent’s record when
            batch membership changes.
          </p>
          <div className="modal-actions">
            <button className="button" onClick={() => setEditing(null)}>
              Cancel
            </button>
            <button className="button primary" onClick={save} disabled={busy}>
              {busy ? "Saving…" : "Save members"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
function ArrowIcon() {
  return <span aria-hidden="true">↗</span>;
}

import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Building2, Plus, ShieldCheck, Users } from "lucide-react";
import { useOverview } from "../lib/overview";
import { errorText, post } from "../lib/api";
import { Badge, ErrorNotice, Field, Modal, PageTitle } from "../components/ui";
import { queryKeys } from "../lib/query-keys";

export function Processes() {
  const data = useOverview(),
    client = useQueryClient(),
    [show, setShow] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      await post("/processes", {
        name: form.get("name"),
        client: form.get("client"),
        description: form.get("description"),
      });
      await client.invalidateQueries({ queryKey: queryKeys.overview });
      setShow(false);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageTitle
        eyebrow="KEEP THE WORK IN CONTEXT"
        title="Client processes"
        description="Give scenarios, trainers, and batches a shared home for each client process."
        action={
          <button
            className="button primary"
            onClick={() => {
              setShow(true);
              setError("");
            }}
          >
            <Plus size={17} />
            Add process
          </button>
        }
      />
      <div className="scenario-grid">
        {data.processes.map((p) => (
          <article className="scenario-card" key={p.id}>
            <div className="card-top">
              <span className="scenario-icon sand">
                <Building2 />
              </span>
              <Badge>{p.client}</Badge>
            </div>
            <h3>{p.name}</h3>
            <p>{p.description || "Ready for your training scenarios."}</p>
            <div className="card-tags">
              <span>
                <BookIcon />
                {
                  data.scenarios.filter((s) => s.process_id === p.id).length
                }{" "}
                scenarios
              </span>
              <span>
                <Users size={13} />
                {data.batches.filter((b) => b.process_id === p.id).length}{" "}
                batches
              </span>
            </div>
          </article>
        ))}
      </div>
      {show && (
        <Modal title="Add a client process" onClose={() => setShow(false)}>
          <form onSubmit={create}>
            {error && <ErrorNotice message={error} />}
            <Field label="Process name">
              <input name="name" required minLength={2} />
            </Field>
            <Field label="Client name">
              <input name="client" required minLength={2} />
            </Field>
            <Field label="Description">
              <textarea name="description" rows={3} />
            </Field>
            <div className="modal-actions">
              <button
                type="button"
                className="button"
                onClick={() => setShow(false)}
              >
                Cancel
              </button>
              <button className="button primary" disabled={busy}>
                {busy ? "Creating…" : "Add process"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
function BookIcon() {
  return <ShieldCheck size={13} />;
}

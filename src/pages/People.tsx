import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { KeyRound, Plus, Settings2 } from "lucide-react";
import { useOverview } from "../lib/overview";
import type { Role, User } from "../shared/types";
import { api, errorText, patch, post } from "../lib/api";
import {
  Badge,
  ErrorNotice,
  Field,
  Modal,
  PageTitle,
  initials,
} from "../components/ui";
import { queryKeys } from "../lib/query-keys";
import { PeopleImport } from "../components/PeopleImport";

export function People() {
  const data = useOverview(),
    client = useQueryClient(),
    [show, setShow] = useState(false),
    [editing, setEditing] = useState<User | null>(null),
    [processIds, setProcessIds] = useState<string[]>([]),
    [role, setRole] = useState<Role>("agent"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [reset, setReset] = useState<User | null>(null);
  const admin = data.user.role === "admin";
  async function edit(user: User) {
    try {
      const result = await api<{ processIds: string[] }>(
        "/users/" + user.id + "/access",
      );
      setProcessIds(result.processIds);
      setRole(user.role);
      setEditing(user);
      setError("");
    } catch (e) {
      setError(errorText(e));
    }
  }
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(e.currentTarget);
    try {
      await post("/users", {
        name: form.get("name"),
        email: form.get("email"),
        password: form.get("password"),
        role,
        processIds,
      });
      await client.invalidateQueries({ queryKey: queryKeys.overview });
      setShow(false);
      setProcessIds([]);
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
      await patch("/users/" + editing!.id, {
        role,
        processIds: role === "trainer" ? processIds : [],
      });
      await client.invalidateQueries({ queryKey: queryKeys.overview });
      setEditing(null);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function toggle(user: User) {
    setError("");
    try {
      await patch("/users/" + user.id, { banned: !user.banned });
      await client.invalidateQueries({ queryKey: queryKeys.overview });
    } catch (e) {
      setError(errorText(e));
    }
  }
  async function password(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await post("/users/" + reset!.id + "/password", {
        password: new FormData(e.currentTarget).get("password"),
      });
      setReset(null);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  const processChoices = (
    <fieldset className="choice-set">
      <legend>Trainer process access</legend>
      {data.processes.length ? (
        data.processes.map((p) => (
          <label key={p.id}>
            <input
              type="checkbox"
              checked={processIds.includes(p.id)}
              onChange={(e) =>
                setProcessIds(
                  e.target.checked
                    ? [...processIds, p.id]
                    : processIds.filter((id) => id !== p.id),
                )
              }
            />
            {p.name}
            <small>{p.client}</small>
          </label>
        ))
      ) : (
        <p>Create a client process first.</p>
      )}
    </fieldset>
  );
  return (
    <>
      <PageTitle
        eyebrow="PEOPLE MAKE THE PROGRESS"
        title="People & access"
        description="Bring your team into the workspace and give everyone the right access."
        action={
          <div className="table-actions">
          <PeopleImport />
          {admin && <button
            className="button primary"
            onClick={() => {
              setShow(true);
              setRole("agent");
              setProcessIds([]);
              setError("");
            }}
          >
            <Plus size={17} />
            Add person
          </button>}
          </div>
        }
      />
      {error && !show && !editing && !reset && <ErrorNotice message={error} />}
      <div className="panel table-scroll">
        <table>
          <thead>
            <tr>
              <th>Person</th>
              <th>Role</th>
              <th>Status</th>
              {admin && <th>Access</th>}
              {admin && <th>Account</th>}
            </tr>
          </thead>
          <tbody>
            {data.users.map((u) => (
              <tr key={u.id}>
                <td>
                  <div className="person-cell">
                    <span className="avatar">{initials(u.name)}</span>
                    <div>
                      <strong>{u.name}</strong>
                      <small>{u.email}</small>
                    </div>
                  </div>
                </td>
                <td>
                  <Badge>{u.role}</Badge>
                </td>
                <td>
                  <Badge tone={u.banned ? "warning" : "success"}>
                    {u.banned ? "Inactive" : "Active"}
                  </Badge>
                </td>
                {admin && <td>
                  <button className="text-link" onClick={() => edit(u)}>
                    <Settings2 size={14} />
                    Manage
                  </button>
                </td>}
                {admin && <td>
                  <div className="table-actions">
                    <button
                      className="text-link"
                      onClick={() => {
                        setReset(u);
                        setError("");
                      }}
                    >
                      <KeyRound size={14} />
                      Reset password
                    </button>
                    <button
                      className="text-link"
                      disabled={u.id === data.user.id}
                      onClick={() => toggle(u)}
                    >
                      {u.banned ? "Activate" : "Deactivate"}
                    </button>
                  </div>
                </td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {show && (
        <Modal title="Add a person" onClose={() => setShow(false)}>
          <form onSubmit={create}>
            {error && <ErrorNotice message={error} />}
            <Field label="Full name">
              <input name="name" required minLength={2} />
            </Field>
            <Field label="Work email">
              <input name="email" type="email" required />
            </Field>
            <Field
              label="Initial password"
              help="At least 12 characters. Share it with the person through your company’s usual secure channel."
            >
              <input
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                required
              />
            </Field>
            <Field label="Role">
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
              >
                <option value="agent">Agent</option>
                <option value="trainer">Trainer</option>
                <option value="admin">Administrator</option>
              </select>
            </Field>
            {role === "trainer" && processChoices}
            <div className="modal-actions">
              <button
                type="button"
                className="button"
                onClick={() => setShow(false)}
              >
                Cancel
              </button>
              <button className="button primary" disabled={busy}>
                {busy ? "Creating…" : "Create account"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {editing && (
        <Modal
          title={"Manage " + editing.name}
          onClose={() => setEditing(null)}
        >
          {error && <ErrorNotice message={error} />}
          <Field label="Role">
            <select
              value={role}
              disabled={editing.id === data.user.id}
              onChange={(e) => setRole(e.target.value as Role)}
            >
              <option value="agent">Agent</option>
              <option value="trainer">Trainer</option>
              <option value="admin">Administrator</option>
            </select>
          </Field>
          {role === "trainer" && processChoices}
          <div className="modal-actions">
            <button className="button" onClick={() => setEditing(null)}>
              Cancel
            </button>
            <button className="button primary" disabled={busy} onClick={save}>
              {busy ? "Saving…" : "Save access"}
            </button>
          </div>
        </Modal>
      )}
      {reset && (
        <Modal
          title={"Reset password for " + reset.name}
          onClose={() => setReset(null)}
        >
          <form onSubmit={password}>
            {error && <ErrorNotice message={error} />}
            <Field
              label="New password"
              help="Other sessions will be signed out."
            >
              <input
                name="password"
                type="password"
                minLength={12}
                maxLength={128}
                autoComplete="new-password"
                required
              />
            </Field>
            <div className="modal-actions">
              <button
                type="button"
                className="button"
                onClick={() => setReset(null)}
              >
                Cancel
              </button>
              <button className="button primary" disabled={busy}>
                {busy ? "Resetting…" : "Reset password"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

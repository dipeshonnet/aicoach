import { useOverview } from "../lib/overview";
import { useState, type FormEvent } from "react";
import { errorText, post } from "../lib/api";
import { ErrorNotice, Field } from "../components/ui";

export function Account() {
  const { user } = useOverview(),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(false),
    [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget,
      data = new FormData(form);
    setBusy(true);
    setError("");
    setSuccess(false);
    try {
      await post("/auth/change-password", {
        currentPassword: data.get("current"),
        newPassword: data.get("next"),
        revokeOtherSessions: true,
      });
      setSuccess(true);
      form.reset();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="narrow-page">
      <h1>Account settings</h1>
      <p className="muted">
        {user.name} · {user.email}
      </p>
      <form className="panel form-panel" onSubmit={submit}>
        <h2>Change your password</h2>
        {error && <ErrorNotice message={error} />}{" "}
        {success && (
          <div className="notice success">
            Password updated. Other sessions were signed out.
          </div>
        )}
        <Field label="Current password">
          <input
            name="current"
            type="password"
            autoComplete="current-password"
            required
          />
        </Field>
        <Field label="New password" help="Use at least 12 characters.">
          <input
            name="next"
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={128}
            required
          />
        </Field>
        <button className="button primary" disabled={busy}>
          {busy ? "Updating…" : "Update password"}
        </button>
      </form>
    </div>
  );
}

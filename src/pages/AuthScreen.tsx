import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BookOpen,
  GraduationCap,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { errorText, post } from "../lib/api";
import { ErrorNotice, Field } from "../components/ui";

export function AuthScreen({
  setup,
  error: initialError,
  onSuccess,
}: {
  setup: boolean;
  error: string;
  onSuccess: () => Promise<void>;
}) {
  const [error, setError] = useState(initialError),
    [busy, setBusy] = useState(false),
    [created, setCreated] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      if (setup && !created) {
        await post("/setup", {
          name: data.get("name"),
          email: data.get("email"),
          password: data.get("password"),
          token: data.get("token"),
        });
        setCreated(true);
      }
      await post("/auth/sign-in/email", {
        email: data.get("email"),
        password: data.get("password"),
      });
      await onSuccess();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-page">
      <section className="auth-story">
        <Link className="brand" to="/">
          <span className="brand-symbol">
            <Sparkles size={23} />
          </span>
          AI Coach<span className="brand-dot">.</span>
        </Link>
        <div>
          <span className="eyebrow">CONFIDENCE STARTS WITH PRACTICE</span>
          <h1>
            Ready for the work.
            <br />
            Ready for the customer.
          </h1>
          <p>
            A space to learn the process, practise the conversation, and build
            the confidence to deliver.
          </p>
          <div className="auth-features">
            <span>
              <BookOpen size={18} />
              Step-by-step learning
            </span>
            <span>
              <GraduationCap size={18} />
              Realistic practice
            </span>
            <span>
              <ShieldCheck size={18} />
              Trainer-approved readiness
            </span>
          </div>
        </div>
        <small>Built for front-office and back-office teams.</small>
      </section>
      <section className="auth-form-wrap">
        <form onSubmit={submit} className="auth-form">
          <span className="mini-mark">
            <GraduationCap />
          </span>
          <h2>
            {setup && !created ? "Set up your workspace" : "Welcome back"}
          </h2>
          <p>
            {setup && !created
              ? "Create the first administrator account to get started."
              : "Sign in to your training workspace."}
          </p>
          {error && <ErrorNotice message={error} />}{" "}
          {setup && !created && (
            <Field label="Your name">
              <input
                name="name"
                required
                autoComplete="name"
                placeholder="Full name"
              />
            </Field>
          )}
          <Field label="Work email">
            <input
              name="email"
              type="email"
              autoComplete="username"
              required
              placeholder="you@company.com"
            />
          </Field>
          <Field
            label="Password"
            help={setup ? "At least 12 characters." : undefined}
          >
            <input
              name="password"
              type="password"
              minLength={setup ? 12 : 1}
              maxLength={128}
              required
              autoComplete={setup ? "new-password" : "current-password"}
              placeholder="Enter your password"
            />
          </Field>
          {setup && !created && (
            <Field
              label="Setup token"
              help="Use the private token configured by your deployment administrator."
            >
              <input name="token" type="password" required autoComplete="off" />
            </Field>
          )}
          <button className="button primary full" disabled={busy}>
            {busy
              ? "Please wait…"
              : setup && !created
                ? "Create workspace"
                : "Sign in"}
            <ArrowRight size={17} />
          </button>
          <p className="auth-note">
            {setup
              ? "Your workspace starts with two synthetic training examples."
              : "Accounts are created by your administrator. Contact them if you need access or a password reset."}
          </p>
        </form>
      </section>
    </main>
  );
}

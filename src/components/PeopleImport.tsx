import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Upload } from "lucide-react";
import { parsePeopleCsv, type PeopleImportResult } from "../shared/people-csv";
import { errorText, post } from "../lib/api";
import { useOverview } from "../lib/overview";
import { queryKeys } from "../lib/query-keys";
import { ErrorNotice, Field, Modal } from "./ui";

export function PeopleImport() {
  const data = useOverview(), client = useQueryClient();
  const [open, setOpen] = useState(false), [csv, setCsv] = useState("");
  const [count, setCount] = useState(0), [error, setError] = useState("");
  const [busy, setBusy] = useState(false), [reading, setReading] = useState(false);
  const [result, setResult] = useState<PeopleImportResult | null>(null);
  function close() { if (!busy && !reading) { setOpen(false); setCsv(""); setCount(0); setResult(null); setError(""); } }
  async function load(file?: File) {
    setCsv(""); setCount(0); setError(""); setResult(null);
    if (!file) return;
    setReading(true);
    try {
      if (file.size > 500_000) throw new Error("CSV must be smaller than 500 KB.");
      const text = await file.text();
      setCount(parsePeopleCsv(text).length); setCsv(text);
    } catch (e) { setError(errorText(e)); }
    finally { setReading(false); }
  }
  async function submit() {
    setBusy(true); setError("");
    try {
      const response = await post<PeopleImportResult>("/users/import", { csv });
      setResult(response); setCsv(""); setCount(0);
      await client.invalidateQueries({ queryKey: queryKeys.overview });
    } catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  }
  return <>
    <button className="button" onClick={() => setOpen(true)}><Upload size={17} />Import CSV</button>
    {open && <Modal title="Import people from CSV" onClose={close}>
      <p>Match existing people by email to update their name and role. New emails create accounts. Import up to 100 people at a time.</p>
      <p>Use headers <code>name,email,password,role,batchIds</code>. Role defaults to agent for new people; blank keeps an existing role. Password is required for new accounts and must be blank for existing people. Separate batch IDs with semicolons; batches are added to existing memberships.</p>
      {data.user.role === "trainer" && <p>You can import agents only. New agents need a batch in your assigned processes. Existing agents must belong entirely to your assigned processes.</p>}
      <a className="text-link" download="people-template.csv" href={"data:text/csv;charset=utf-8," + encodeURIComponent("name,email,password,role,batchIds\r\nExample Person,person@example.com,ReplaceWith12PlusChars,agent,\r\n")}>Download CSV template</a>
      {data.batches.length > 0 && <details><summary>Available batch IDs</summary><ul>{data.batches.map((batch) => <li key={batch.id}>{batch.name}: <code>{batch.id}</code></li>)}</ul></details>}
      <Field label="CSV file"><input type="file" accept=".csv,text/csv" disabled={busy || reading} onChange={(e) => void load(e.target.files?.[0])} /></Field>
      {error && <ErrorNotice message={error} />}
      {count > 0 && <p role="status">{count} people ready to import. Each row will be validated before saving.</p>}
      {result && <div role="status"><p>{result.created} created, {result.updated} updated, {result.errors.length} failed.</p>
        {result.errors.length > 0 && <ul>{result.errors.map((entry) => <li key={entry.row}>Row {entry.row} ({entry.email}): {entry.message}</li>)}</ul>}
      </div>}
      <div className="modal-actions"><button className="button" disabled={busy || reading} onClick={close}>Close</button><button className="button primary" disabled={!csv || busy || reading} onClick={() => void submit()}>{busy ? "Importing…" : "Import people"}</button></div>
    </Modal>}
  </>;
}

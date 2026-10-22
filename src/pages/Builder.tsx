import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronUp,
  Eye,
  FileCheck2,
  Info,
  MousePointer2,
  Plus,
  Save,
  Send,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useOverview } from "../lib/overview";
import type { Office, Scenario, ScenarioContent, Step } from "../shared/types";
import { api, errorText, id as newId, post, put } from "../lib/api";
import {
  Badge,
  Empty,
  ErrorNotice,
  Field,
  Modal,
  Notice,
  Spinner,
} from "../components/ui";
import { Preview } from "../components/Screenshot";
import { AssignDialog } from "../components/AssignDialog";
import { HotspotEditor } from "../components/HotspotEditor";
import { queryKeys } from "../lib/query-keys";
import { ExportSopButton } from "../components/ExportSopButton";

const defaultRubric = (office: Office) =>
  (office === "front"
    ? (["procedure", "resolution", "compliance", "communication"] as const)
    : (["procedure", "resolution", "compliance"] as const)
  ).map((key) => ({
    key,
    label: key[0].toUpperCase() + key.slice(1),
    weight: 1,
    guidance: "",
  }));
const blankScenario = (): ScenarioContent => ({
  title: "Untitled scenario",
  office: "front",
  brief: "",
  reference: "",
  outcome: "",
  customerName: "",
  persona: "",
  opening: "",
  threshold: 80,
  rubric: defaultRubric("front"),
  steps: [],
});
const blankStep = (): Step => ({
  id: newId(),
  title: "",
  instructions: "",
  hint: "",
  assetId: "",
  critical: false,
  hotspots: [],
});

export function Builder() {
  const { id } = useParams(),
    data = useOverview(),
    navigate = useNavigate(),
    client = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.scenario(id),
    queryFn: () =>
      api<
        Scenario & {
          draft: ScenarioContent;
          versions: { version: number; published_at: number }[];
        }
      >("/scenarios/" + id),
    enabled: Boolean(id),
  });
  const [content, setContent] = useState<ScenarioContent>(blankScenario),
    [process, setProcess] = useState(data.processes[0]?.id || ""),
    [revision, setRevision] = useState(1),
    [stepIndex, setStepIndex] = useState(0),
    [tab, setTab] = useState("brief"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false),
    [preview, setPreview] = useState(false),
    [assign, setAssign] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    if (query.data) {
      setContent(query.data.draft);
      setRevision(query.data.draft_revision);
      setProcess(query.data.process_id);
      setDirty(false);
    }
  }, [query.data]);
  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);
  const change = (patch: Partial<ScenarioContent>) => {
    setContent((c) => ({ ...c, ...patch }));
    setDirty(true);
    setMessage("");
  };
  const step = content.steps[stepIndex];
  function changeStep(next: Step) {
    change({
      steps: content.steps.map((s, i) => (i === stepIndex ? next : s)),
    });
  }
  async function save(publish = false) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      let result: { id: string; revision: number };
      if (id) result = await put("/scenarios/" + id, { revision, content });
      else result = await post("/scenarios", { processId: process, content });
      setRevision(result.revision);
      setDirty(false);
      if (publish) {
        await post("/scenarios/" + result.id + "/publish", {
          revision: result.revision,
        });
        setMessage("Published. This version is ready to assign.");
        await client.invalidateQueries({
          queryKey: queryKeys.scenario(result.id),
        });
      } else setMessage("Draft saved.");
      await client.invalidateQueries({ queryKey: queryKeys.overview });
      if (!id) navigate("/scenarios/" + result.id, { replace: true });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  function addStep() {
    const next = blankStep();
    change({ steps: [...content.steps, next] });
    setStepIndex(content.steps.length);
    setTab("steps");
  }
  function moveStep(delta: number) {
    const next = [...content.steps],
      target = stepIndex + delta;
    if (target < 0 || target >= next.length) return;
    [next[target], next[stepIndex]] = [next[stepIndex], next[target]];
    change({ steps: next });
    setStepIndex(target);
  }
  if (id && query.isPending)
    return <Spinner label="Opening scenario builder…" />;
  if (query.error) return <ErrorNotice message={errorText(query.error)} />;
  const published = query.data?.published_version;
  return (
    <div className="builder-page">
      <Link className="back-link" to="/scenarios">
        <ArrowLeft size={15} />
        Scenario library
      </Link>
      <div className="builder-heading">
        <div>
          <span className="eyebrow">SCENARIO BUILDER</span>
          <h1>{content.title}</h1>
          <div className="builder-meta">
            <Badge>
              {published
                ? "Published v" + published + " · editing draft"
                : "New draft"}
            </Badge>
            <span>
              {dirty
                ? "● Unsaved changes"
                : message || "Your published versions stay unchanged."}
            </span>
          </div>
        </div>
        <div className="builder-buttons">
          <ExportSopButton
            source={{
              content,
              process: data.processes.find((p) => p.id === process),
              revision: id ? revision : undefined,
              unsaved: dirty || !id,
            }}
            disabled={busy}
            onError={setError}
          />
          <button
            className="button"
            disabled={!content.steps.length}
            onClick={() => setPreview(true)}
          >
            <Eye size={16} />
            Preview
          </button>
          <button
            className="button"
            onClick={() => save()}
            disabled={busy || !process}
          >
            <Save size={16} />
            {busy ? "Saving…" : "Save draft"}
          </button>
          <button
            className="button primary"
            onClick={() => save(true)}
            disabled={busy || !process}
          >
            <Send size={16} />
            Publish
          </button>
          {!!published && (
            <button className="button" onClick={() => setAssign(true)}>
              Assign
            </button>
          )}
        </div>
      </div>
      {error && <ErrorNotice message={error} />}{" "}
      {message && (
        <div className="notice success">
          <Check size={16} />
          {message}
        </div>
      )}
      <div className="builder-tabs">
        <button
          className={tab === "brief" ? "selected" : ""}
          onClick={() => setTab("brief")}
        >
          <span>01</span>Scenario brief
        </button>
        <button
          className={tab === "steps" ? "selected" : ""}
          onClick={() => setTab("steps")}
        >
          <span>02</span>Screenshot steps<Badge>{content.steps.length}</Badge>
        </button>
        <button
          className={tab === "rubric" ? "selected" : ""}
          onClick={() => setTab("rubric")}
        >
          <span>03</span>Assessment rubric
        </button>
      </div>
      {tab === "brief" && (
        <div className="builder-brief">
          <section className="panel form-panel">
            <h2>Give the scenario context</h2>
            <p className="muted">
              Tell the agent what needs resolving, then give the coach the
              reference material.
            </p>
            <Field label="Scenario title">
              <input
                value={content.title}
                maxLength={200}
                onChange={(e) => change({ title: e.target.value })}
              />
            </Field>
            <div className="form-grid">
              <Field label="Client process">
                <select
                  value={process}
                  disabled={Boolean(id)}
                  onChange={(e) => setProcess(e.target.value)}
                >
                  <option value="">Choose a process</option>
                  {data.processes.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {p.client}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Work type">
                <select
                  value={content.office}
                  disabled={Boolean(published)}
                  onChange={(e) => {
                    const office = e.target.value as Office;
                    change({ office, rubric: defaultRubric(office) });
                  }}
                >
                  <option value="front">
                    Front office · customer conversation
                  </option>
                  <option value="back">Back office · work item</option>
                </select>
              </Field>
            </div>
            <Field
              label="Agent brief"
              help="Shown to the agent in every mode. Keep expected answers in the reference instructions."
            >
              <textarea
                rows={4}
                value={content.brief}
                maxLength={4000}
                onChange={(e) => change({ brief: e.target.value })}
                placeholder="Describe the customer query or work item."
              />
            </Field>
            <Field
              label="Reference instructions"
              help="Available to the AI and trainers. Hidden from agents during assessments."
            >
              <textarea
                rows={6}
                value={content.reference}
                maxLength={20000}
                onChange={(e) => change({ reference: e.target.value })}
                placeholder="Add approved policies, facts, and the correct procedure."
              />
            </Field>
            <Field label="Expected outcome">
              <textarea
                rows={3}
                value={content.outcome}
                maxLength={4000}
                onChange={(e) => change({ outcome: e.target.value })}
                placeholder="What does a correctly resolved scenario look like?"
              />
            </Field>
          </section>
          <aside>
            <section className="panel form-panel">
              {content.office === "front" ? (
                <>
                  <div className="panel-title-icon">
                    <span className="scenario-icon green">
                      <MousePointer2 />
                    </span>
                    <div>
                      <h2>Your AI customer</h2>
                      <p className="muted">
                        A realistic conversation, grounded in your reference.
                      </p>
                    </div>
                  </div>
                  <Field label="Customer name">
                    <input
                      value={content.customerName}
                      maxLength={120}
                      onChange={(e) => change({ customerName: e.target.value })}
                    />
                  </Field>
                  <Field label="Customer persona">
                    <textarea
                      rows={5}
                      value={content.persona}
                      maxLength={4000}
                      onChange={(e) => change({ persona: e.target.value })}
                      placeholder="What do they know? How do they feel? What information should they share when asked?"
                    />
                  </Field>
                  <Field label="Opening message">
                    <textarea
                      rows={4}
                      value={content.opening}
                      maxLength={2000}
                      onChange={(e) => change({ opening: e.target.value })}
                      placeholder="The customer's first message."
                    />
                  </Field>
                </>
              ) : (
                <>
                  <span className="scenario-icon sand">
                    <FileCheck2 />
                  </span>
                  <h2>Work-item practice</h2>
                  <p className="muted">
                    Agents complete the screenshot procedure. Correct actions,
                    exceptions, and the final outcome determine their
                    assessment.
                  </p>
                </>
              )}
            </section>
            <div className="builder-help">
              <Info size={19} />
              <div>
                <strong>Make it useful. Make it familiar.</strong>
                <p>
                  Use synthetic or approved training screenshots. Add the facts
                  an agent needs to resolve the task.
                </p>
              </div>
            </div>
            {query.data?.versions?.length ? (
              <section className="panel form-panel">
                <h3>Published history</h3>
                {query.data.versions.map((v) => (
                  <div className="version-row" key={v.version}>
                    <Badge tone="success">Version {v.version}</Badge>
                    <small>
                      {new Date(v.published_at).toLocaleDateString()}
                    </small>
                  </div>
                ))}
              </section>
            ) : null}
          </aside>
        </div>
      )}
      {tab === "steps" && (
        <div className="steps-layout">
          <aside className="step-sidebar">
            <div className="section-head">
              <h3>Procedure steps</h3>
              <Badge>{content.steps.length}</Badge>
            </div>
            <div className="step-list">
              {content.steps.map((s, i) => (
                <button
                  key={s.id}
                  className={stepIndex === i ? "selected" : ""}
                  onClick={() => setStepIndex(i)}
                >
                  <span className="step-number">{i + 1}</span>
                  <span>
                    <strong>{s.title || "Untitled step"}</strong>
                    <small>
                      {s.assetId
                        ? s.hotspots.length + " interactive actions"
                        : "Add a screenshot"}
                    </small>
                  </span>
                  {s.critical && <ShieldCheck size={14} />}
                </button>
              ))}
            </div>
            <button
              className="button full"
              disabled={content.steps.length >= 40}
              onClick={addStep}
            >
              <Plus size={15} />
              Add step
            </button>
            <div className="builder-help">
              <Info size={17} />
              <p>
                Keep steps in the same order agents should follow. Published
                versions remain fixed.
              </p>
            </div>
          </aside>
          {step ? (
            <section className="panel step-editor">
              <div className="step-editor-header">
                <span className="eyebrow">
                  STEP {stepIndex + 1} OF {content.steps.length}
                </span>
                <div>
                  <button
                    className="icon-button"
                    aria-label="Move step earlier"
                    disabled={!stepIndex}
                    onClick={() => moveStep(-1)}
                  >
                    <ChevronUp size={17} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label="Move step later"
                    disabled={stepIndex === content.steps.length - 1}
                    onClick={() => moveStep(1)}
                  >
                    <ChevronDown size={17} />
                  </button>
                  <button
                    className="icon-button danger"
                    aria-label="Delete step"
                    onClick={() => {
                      change({
                        steps: content.steps.filter((_, i) => i !== stepIndex),
                      });
                      setStepIndex(Math.max(0, stepIndex - 1));
                    }}
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              </div>
              <Field label="Step title">
                <input
                  value={step.title}
                  maxLength={200}
                  onChange={(e) =>
                    changeStep({ ...step, title: e.target.value })
                  }
                  placeholder="Verify the customer"
                />
              </Field>
              <div className="form-grid">
                <Field label="Learning instructions">
                  <textarea
                    rows={3}
                    value={step.instructions}
                    maxLength={4000}
                    onChange={(e) =>
                      changeStep({ ...step, instructions: e.target.value })
                    }
                  />
                </Field>
                <Field label="Practice hint">
                  <textarea
                    rows={3}
                    value={step.hint}
                    maxLength={1000}
                    onChange={(e) =>
                      changeStep({ ...step, hint: e.target.value })
                    }
                  />
                </Field>
              </div>
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={step.critical}
                  onChange={(e) =>
                    changeStep({ ...step, critical: e.target.checked })
                  }
                />
                <span>
                  Critical step
                  <small>Missing this step blocks a passing assessment.</small>
                </span>
              </label>
              <HotspotEditor
                key={step.id}
                step={step}
                processId={process}
                onChange={changeStep}
                onError={setError}
              />
            </section>
          ) : (
            <section className="panel">
              <Empty
                title="Turn a screen into a learning step"
                action={
                  <button className="button primary" onClick={addStep}>
                    <Plus size={16} />
                    Add your first step
                  </button>
                }
              >
                Add a screenshot, explain the action, then mark where agents
                should click or type.
              </Empty>
            </section>
          )}
        </div>
      )}
      {tab === "rubric" && (
        <section className="panel form-panel rubric-editor">
          <h2>Define what ready looks like</h2>
          <p className="muted">
            The final score is a weighted average of these criteria. Critical
            checks must all pass, and a trainer must approve completion.
          </p>
          <Field label="Passing score (%)">
            <input
              type="number"
              min={1}
              max={100}
              value={content.threshold}
              onChange={(e) => change({ threshold: Number(e.target.value) })}
            />
          </Field>
          {content.rubric.map((r, i) => (
            <div className="rubric-row" key={r.key}>
              <div>
                <h3>{r.label}</h3>
                <p>
                  {r.key === "procedure"
                    ? "Objective action accuracy, including incorrect attempts."
                    : r.key === "resolution"
                      ? "A completed procedure and an accurate customer resolution."
                      : r.key === "compliance"
                        ? "Mandatory procedural checks and approved policy handling."
                        : "Clarity, empathy and professionalism from the transcript."}
                </p>
              </div>
              <Field label="Weight">
                <input
                  type="number"
                  min={0.01}
                  max={100}
                  step={0.1}
                  value={r.weight}
                  onChange={(e) =>
                    change({
                      rubric: content.rubric.map((c, j) =>
                        j === i ? { ...c, weight: Number(e.target.value) } : c,
                      ),
                    })
                  }
                />
              </Field>
              <Field label="Evaluation guidance">
                <textarea
                  rows={2}
                  maxLength={2000}
                  value={r.guidance}
                  onChange={(e) =>
                    change({
                      rubric: content.rubric.map((c, j) =>
                        j === i ? { ...c, guidance: e.target.value } : c,
                      ),
                    })
                  }
                  placeholder="Add process-specific expectations."
                />
              </Field>
            </div>
          ))}
          <Notice>
            Voice communication is evaluated from the transcript. Pronunciation,
            accent, and acoustic tone are not scored.
          </Notice>
        </section>
      )}
      {preview && (
        <Modal title="Scenario preview" onClose={() => setPreview(false)}>
          <Preview steps={content.steps} />
        </Modal>
      )}
      {assign && query.data && (
        <AssignDialog scenario={query.data} onClose={() => setAssign(false)} />
      )}
    </div>
  );
}

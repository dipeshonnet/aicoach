import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCheck,
  Headphones,
  Lightbulb,
  Loader2,
  MessageSquare,
  Mic,
  Send,
  Sparkles,
  Square,
  Volume2,
  VolumeX,
} from "lucide-react";
import type { Attempt } from "../shared/types";
import { api, errorText, id, post } from "../lib/api";
import { splitSpeech } from "../shared/engine";
import { Badge, ErrorNotice, Modal, Notice, Spinner } from "../components/ui";
import { Screenshot } from "../components/Screenshot";
import { Results } from "../components/Results";
import { queryKeys } from "../lib/query-keys";

type Detail = Attempt & { opening: string };
export function Learning() {
  const params = useParams(),
    attemptId = params.id!,
    client = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.attempt(attemptId),
    queryFn: () => api<Detail>("/attempts/" + attemptId),
  });
  const [error, setError] = useState(""),
    [feedback, setFeedback] = useState(""),
    [hint, setHint] = useState(false),
    [busy, setBusy] = useState(false),
    [text, setText] = useState(""),
    [submitOpen, setSubmitOpen] = useState(false),
    [coaching, setCoaching] = useState(""),
    [recording, setRecording] = useState(false),
    [seconds, setSeconds] = useState(0),
    [playing, setPlaying] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null),
    stream = useRef<MediaStream | null>(null),
    audio = useRef<HTMLAudioElement | null>(null),
    playback = useRef<AbortController | null>(null),
    timer = useRef<ReturnType<typeof setInterval> | null>(null),
    deadline = useRef<ReturnType<typeof setTimeout> | null>(null),
    alive = useRef(true),
    chatRequest = useRef<{ text: string; id: string } | null>(null),
    submitId = useRef(id()),
    actionRequest = useRef<{ key: string; id: string } | null>(null),
    voicePending = useRef<{ file: File; requestId: string } | null>(null),
    micStarting = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      playback.current?.abort();
      audio.current?.pause();
      if (recorder.current?.state === "recording") recorder.current.stop();
      stream.current?.getTracks().forEach((t) => t.stop());
      if (timer.current) clearInterval(timer.current);
      if (deadline.current) clearTimeout(deadline.current);
    };
  }, []);
  async function refresh() {
    await client.invalidateQueries({ queryKey: queryKeys.attempt(attemptId) });
    await client.invalidateQueries({ queryKey: queryKeys.overview });
  }
  async function action(hotspotId: string | null, value?: string) {
    if (busy) return;
    const a = query.data!,
      step = a.scenario!.steps[a.current_step],
      key = step.id + ":" + hotspotId + ":" + (value || "");
    if (actionRequest.current?.key !== key)
      actionRequest.current = { key, id: id() };
    setBusy(true);
    setError("");
    try {
      const result = await post<{ correct: boolean; feedback?: string }>(
        "/attempts/" + attemptId + "/actions",
        {
          requestId: actionRequest.current.id,
          stepId: step.id,
          hotspotId,
          value,
        },
      );
      actionRequest.current = null;
      setFeedback(result.feedback || "Action recorded.");
      setHint(false);
      await refresh();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function play(turnId: string | null, customerText: string) {
    playback.current?.abort();
    const controller = new AbortController();
    playback.current = controller;
    setPlaying(true);
    setError("");
    try {
      for (let chunk = 0; chunk < splitSpeech(customerText).length; chunk++) {
        if (controller.signal.aborted) break;
        const response = await fetch("/api/attempts/" + attemptId + "/speech", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ turnId, chunk }),
          signal: controller.signal,
        });
        if (!response.ok) {
          const result = (await response.json()) as { error?: string };
          throw new Error(result.error || "Speech could not be played.");
        }
        const url = URL.createObjectURL(await response.blob()),
          element = new Audio(url);
        audio.current = element;
        try {
          await new Promise<void>((resolve, reject) => {
            const cancel = () => {
              element.pause();
              resolve();
            };
            controller.signal.addEventListener("abort", cancel, { once: true });
            element.onended = () => {
              controller.signal.removeEventListener("abort", cancel);
              resolve();
            };
            element.onerror = () =>
              reject(
                new Error("Audio playback failed. Try the play button again."),
              );
            element
              .play()
              .catch(() =>
                reject(
                  new Error("Tap the play button to hear this customer reply."),
                ),
              );
          });
        } finally {
          element.pause();
          element.src = "";
          URL.revokeObjectURL(url);
        }
      }
    } catch (e) {
      if (!controller.signal.aborted) setError(errorText(e));
    } finally {
      if (playback.current === controller && alive.current) setPlaying(false);
    }
  }
  async function sendText() {
    if (!text.trim() || busy) return;
    setBusy(true);
    setError("");
    if (chatRequest.current?.text !== text.trim())
      chatRequest.current = { text: text.trim(), id: id() };
    try {
      await post("/attempts/" + attemptId + "/turns", {
        requestId: chatRequest.current.id,
        text: chatRequest.current.text,
      });
      chatRequest.current = null;
      setText("");
    } catch (e) {
      setError(errorText(e));
    } finally {
      await refresh();
      setBusy(false);
    }
  }
  async function sendVoice(file: File, requestId: string) {
    setBusy(true);
    setError("");
    voicePending.current = { file, requestId };
    try {
      const form = new FormData();
      form.set("audio", file);
      form.set("requestId", requestId);
      const result = await api<{ id: string; customerText: string }>(
        "/attempts/" + attemptId + "/turns",
        { method: "POST", body: form },
      );
      voicePending.current = null;
      await refresh();
      void play(result.id, result.customerText);
    } catch (e) {
      setError(errorText(e));
      await refresh();
      const saved = client.getQueryData<Detail>(queryKeys.attempt(attemptId));
      if (saved?.turns?.some((t) => t.request_id === requestId))
        voicePending.current = null;
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  async function startRecording() {
    if (micStarting.current || recording || busy) return;
    micStarting.current = true;
    setError("");
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder)
        throw new Error(
          "This browser cannot record audio. Use a current Chrome or Edge browser over HTTPS.",
        );
      const acquired = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      if (!alive.current) {
        acquired.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = acquired;
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find(
        (t) => MediaRecorder.isTypeSupported(t),
      );
      const r = new MediaRecorder(
          acquired,
          mime ? { mimeType: mime } : undefined,
        ),
        chunks: Blob[] = [];
      recorder.current = r;
      r.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      r.onstop = () => {
        acquired.getTracks().forEach((t) => t.stop());
        stream.current = null;
        recorder.current = null;
        r.ondataavailable = null;
        r.onstop = null;
        if (timer.current) clearInterval(timer.current);
        if (deadline.current) clearTimeout(deadline.current);
        if (!alive.current) return;
        setRecording(false);
        const type = r.mimeType || "audio/webm",
          file = new File(
            chunks,
            ["voice", type.includes("mp4") ? "m4a" : "webm"].join("."),
            { type },
          );
        chunks.length = 0;
        void sendVoice(file, id());
      };
      r.onerror = () => {
        acquired.getTracks().forEach((t) => t.stop());
        if (timer.current) clearInterval(timer.current);
        if (deadline.current) clearTimeout(deadline.current);
        setRecording(false);
        setError("Recording stopped unexpectedly. Please try again.");
      };
      r.start();
      setSeconds(0);
      setRecording(true);
      timer.current = setInterval(() => setSeconds((s) => s + 1), 1000);
      deadline.current = setTimeout(() => {
        if (r.state === "recording") r.stop();
      }, 60000);
    } catch (e) {
      setError(
        e instanceof DOMException && e.name === "NotAllowedError"
          ? "Microphone access was denied. Allow microphone access in your browser and try again."
          : errorText(e),
      );
    } finally {
      micStarting.current = false;
    }
  }
  async function retryTurn(turnId: string) {
    setBusy(true);
    setError("");
    try {
      const result = await post<{ id: string; customerText: string }>(
        "/attempts/" + attemptId + "/turns/" + turnId + "/retry",
        {},
      );
      voicePending.current = null;
      setText("");
      chatRequest.current = null;
      if (query.data?.channel === "voice")
        void play(result.id, result.customerText);
    } catch (e) {
      setError(errorText(e));
    } finally {
      await refresh();
      setBusy(false);
    }
  }
  async function submit() {
    setBusy(true);
    setError("");
    try {
      await post("/attempts/" + attemptId + "/submit", {
        requestId: submitId.current,
      });
      setSubmitOpen(false);
      await refresh();
    } catch (e) {
      setError(errorText(e));
      setSubmitOpen(false);
    } finally {
      setBusy(false);
    }
  }
  async function getCoaching() {
    setBusy(true);
    setError("");
    try {
      const result = await post<{ feedback: string }>(
        "/attempts/" + attemptId + "/coach",
        {},
      );
      setCoaching(result.feedback);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  if (query.isPending)
    return <Spinner label="Opening your practice workspace…" />;
  if (query.error) return <ErrorNotice message={errorText(query.error)} />;
  const attempt = query.data,
    scenario = attempt.scenario!,
    step = scenario.steps[attempt.current_step],
    assessment = attempt.mode === "assessment",
    front = scenario.office === "front",
    failedTurn = attempt.turns?.find((t) => t.state !== "completed");
  if (attempt.status !== "active")
    return (
      <>
        <Link className="back-link" to="/training">
          <ArrowLeft size={15} />
          My training
        </Link>
        <div className="page-title">
          <div>
            <span className="eyebrow">
              {attempt.mode.toUpperCase()} COMPLETE
            </span>
            <h1>{scenario.title}</h1>
            <p>
              Version {scenario.version} · {attempt.channel}
            </p>
          </div>
          <Badge tone={attempt.status === "approved" ? "success" : "neutral"}>
            {attempt.status === "approved"
              ? "Trainer approved"
              : attempt.status === "retry"
                ? "Retry requested"
                : assessment
                  ? "Awaiting trainer review"
                  : "Practice completed"}
          </Badge>
        </div>
        {attempt.result ? (
          <Results result={attempt.result} />
        ) : (
          <div className="panel form-panel">
            <span className="scenario-icon green">
              <CheckCheck />
            </span>
            <h2>Walkthrough complete.</h2>
            <p>
              You’ve learned the procedure. Try practice next, then take an
              assessment when you feel ready.
            </p>
          </div>
        )}
        {attempt.review_note && (
          <div className="panel form-panel">
            <h3>Your trainer’s feedback</h3>
            <p>{attempt.review_note}</p>
          </div>
        )}
        <div className="result-actions">
          <Link className="button primary" to="/training">
            Back to my training
            <ArrowRight size={16} />
          </Link>
          <Link className="button" to="/progress">
            View progress
          </Link>
        </div>
      </>
    );
  return (
    <div className="learning-page">
      <Link className="back-link" to="/training">
        <ArrowLeft size={15} />
        My training
      </Link>
      <div className="learning-heading">
        <div>
          <div className="builder-meta">
            <Badge tone={assessment ? "warning" : "success"}>
              {attempt.mode}
            </Badge>
            <span>
              Version {scenario.version} ·{" "}
              {attempt.channel === "voice"
                ? "Turn-based voice"
                : attempt.channel === "chat"
                  ? "Customer chat"
                  : "Work-item practice"}
            </span>
          </div>
          <h1>{scenario.title}</h1>
        </div>
        <button
          className="button primary"
          onClick={() => setSubmitOpen(true)}
          disabled={busy || recording || playing}
        >
          Finish {attempt.mode}
          <ArrowRight size={16} />
        </button>
      </div>
      <div className="scenario-brief">
        <BookMark />
        <p>{scenario.brief}</p>
      </div>
      {error && <ErrorNotice message={error} />}
      <div className={"learning-layout " + (!front ? "workflow-only" : "")}>
        <section className="practice-panel">
          <div className="practice-toolbar">
            <span>
              <span className="status-dot" />
              Simulated workspace
            </span>
            <small>
              {Math.min(attempt.current_step, scenario.steps.length)} /{" "}
              {scenario.steps.length} steps complete
            </small>
          </div>
          <div className="step-progress-track">
            {scenario.steps.map((s, i) => (
              <span
                key={s.id}
                className={
                  i < attempt.current_step
                    ? "complete"
                    : i === attempt.current_step
                      ? "current"
                      : ""
                }
              />
            ))}
          </div>
          {step ? (
            <>
              <div className="current-step-heading">
                <span className="step-number">{attempt.current_step + 1}</span>
                <div>
                  <h2>{step.title}</h2>
                  {!assessment && <p>{step.instructions}</p>}
                </div>
                {busy && <Loader2 className="spin" size={18} />}
              </div>
              <Screenshot
                key={step.id}
                step={step}
                mode={attempt.mode}
                disabled={busy || recording}
                onAction={action}
              />
              {!assessment && (
                <div className="practice-tools">
                  <button className="text-link" onClick={() => setHint(!hint)}>
                    <Lightbulb size={16} />
                    {hint ? "Hide hint" : "Need a hint?"}
                  </button>
                  <button
                    className="text-link"
                    onClick={getCoaching}
                    disabled={busy}
                  >
                    <Sparkles size={16} />
                    Ask the coach
                  </button>
                </div>
              )}
              {hint && (
                <Notice>
                  {step.hint ||
                    "Review the step instructions and the highlighted areas in walkthrough mode."}
                </Notice>
              )}
              {feedback && (
                <div className="action-feedback">
                  <Check size={15} />
                  {feedback}
                </div>
              )}
            </>
          ) : (
            <div className="procedure-complete">
              <span className="completed-check">
                <CheckCheck size={36} />
              </span>
              <h2>Procedure completed.</h2>
              <p>
                {front
                  ? "Finish the customer conversation, then submit your attempt."
                  : "You’ve reached the end of the work item. Submit your attempt to see your results."}
              </p>
            </div>
          )}
          {coaching && (
            <div className="coach-note">
              <div>
                <Sparkles size={17} />
                <strong>From your coach</strong>
              </div>
              <p>{coaching}</p>
            </div>
          )}
        </section>
        {front && (
          <section className="conversation-panel">
            <header>
              <span className="customer-avatar">
                {scenario.customerName[0] || "C"}
              </span>
              <div>
                <strong>{scenario.customerName || "Your customer"}</strong>
                <small>
                  {attempt.channel === "voice"
                    ? "Voice practice"
                    : "Customer chat"}{" "}
                  · AI simulation
                </small>
              </div>
              {attempt.channel === "voice" ? (
                <Headphones size={19} />
              ) : (
                <MessageSquare size={19} />
              )}
            </header>
            <div className="conversation-thread">
              <div className="chat-message customer">
                <small>{scenario.customerName}</small>
                <p>{attempt.opening}</p>
                {attempt.channel === "voice" && (
                  <button
                    className="text-link"
                    disabled={recording || playing || busy}
                    onClick={() => play(null, attempt.opening)}
                  >
                    <Volume2 size={13} />
                    Hear customer
                  </button>
                )}
              </div>
              {attempt.turns?.map((turn) => (
                <div key={turn.id}>
                  <div className="chat-message agent">
                    <small>
                      You{attempt.channel === "voice" ? " · transcript" : ""}
                    </small>
                    <p>{turn.agent_text}</p>
                  </div>
                  {turn.state === "completed" ? (
                    <div className="chat-message customer">
                      <small>{scenario.customerName}</small>
                      <p>{turn.customer_text}</p>
                      {attempt.channel === "voice" && (
                        <button
                          className="text-link"
                          disabled={recording || playing || busy}
                          onClick={() =>
                            play(turn.id, turn.customer_text || "")
                          }
                        >
                          <Volume2 size={13} />
                          Play reply
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="notice warning">
                      <span>
                        Customer reply{" "}
                        {turn.state === "pending"
                          ? "is unfinished"
                          : "could not be generated"}
                        . Your response is saved.
                      </span>
                      <button
                        className="text-link"
                        disabled={busy}
                        onClick={() => retryTurn(turn.id)}
                      >
                        Retry reply
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {busy && (
                <div className="conversation-working">
                  <Loader2 className="spin" size={14} />
                  Working on your response…
                </div>
              )}
            </div>
            <div className="conversation-compose">
              {attempt.channel === "chat" ? (
                <>
                  <textarea
                    aria-label="Your response to the customer"
                    placeholder="Write your response…"
                    value={text}
                    maxLength={8000}
                    disabled={busy || Boolean(failedTurn)}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                        e.preventDefault();
                        void sendText();
                      }
                    }}
                  />
                  <div>
                    <small>Ctrl + Enter to send</small>
                    <button
                      className="button primary small"
                      onClick={sendText}
                      disabled={busy || !text.trim() || Boolean(failedTurn)}
                    >
                      <Send size={14} />
                      Send
                    </button>
                  </div>
                </>
              ) : (
                <div className="voice-controls">
                  {playing ? (
                    <button
                      className="button"
                      onClick={() => {
                        playback.current?.abort();
                        audio.current?.pause();
                        setPlaying(false);
                      }}
                    >
                      <VolumeX size={16} />
                      Stop playback
                    </button>
                  ) : recording ? (
                    <button
                      className="button recording"
                      onClick={() => recorder.current?.stop()}
                    >
                      <Square size={15} />
                      Stop & send · {seconds}s
                    </button>
                  ) : (
                    <button
                      className="button primary full"
                      onClick={startRecording}
                      disabled={busy || Boolean(failedTurn)}
                    >
                      <Mic size={17} />
                      Record your response
                    </button>
                  )}
                  <small>
                    {recording
                      ? "Your microphone is recording. Up to 60 seconds."
                      : "Audio is processed for transcription, then discarded."}
                  </small>
                  {voicePending.current && !failedTurn && !busy && (
                    <button
                      className="text-link"
                      onClick={() =>
                        sendVoice(
                          voicePending.current!.file,
                          voicePending.current!.requestId,
                        )
                      }
                    >
                      Retry recorded response
                    </button>
                  )}
                </div>
              )}
            </div>
          </section>
        )}
      </div>
      {submitOpen && (
        <Modal
          title={"Finish your " + attempt.mode + "?"}
          onClose={() => setSubmitOpen(false)}
        >
          <p>
            {attempt.current_step < scenario.steps.length
              ? "Some required actions are unfinished. Submitting now will record those steps as missed."
              : "Your work is ready to submit."}
          </p>
          {assessment && (
            <Notice>
              Your assessment will be scored, then sent to your trainer.
              Completion is recorded after approval.
            </Notice>
          )}
          <div className="modal-actions">
            <button className="button" onClick={() => setSubmitOpen(false)}>
              Keep practising
            </button>
            <button className="button primary" disabled={busy} onClick={submit}>
              {busy ? "Submitting…" : "Submit attempt"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
function BookMark() {
  return (
    <span className="scenario-icon green">
      <Lightbulb size={18} />
    </span>
  );
}

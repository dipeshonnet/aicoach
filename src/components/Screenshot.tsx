import { useState } from "react";
import type { LearnerStep, Step } from "../shared/types";
import { ImageOff } from "lucide-react";
import { normalizeAnswer } from "../shared/engine";

export function Screenshot({
  step,
  mode = "assessment",
  onAction,
  disabled = false,
}: {
  step: LearnerStep;
  mode?: string;
  onAction: (id: string | null, value?: string) => void;
  disabled?: boolean;
}) {
  const [values, setValues] = useState<Record<string, string>>({}),
    [failed, setFailed] = useState(false);
  return (
    <div
      className="screenshot-frame"
      onClick={(e) => {
        if (
          !disabled &&
          (e.target === e.currentTarget || e.target instanceof HTMLImageElement)
        )
          onAction(null);
      }}
    >
      {failed ? (
        <div className="screenshot-failed">
          <ImageOff />
          <p>The screenshot could not be loaded. Refresh this attempt.</p>
        </div>
      ) : (
        <img
          src={"/api/assets/" + step.assetId}
          alt={step.title || "Work-item screen"}
          onError={() => setFailed(true)}
          draggable={false}
        />
      )}
      {!failed &&
        step.hotspots.map((h) => {
          const style = {
            left: h.x * 100 + "%",
            top: h.y * 100 + "%",
            width: h.w * 100 + "%",
            height: h.h * 100 + "%",
          };
          return h.type === "click" ? (
            <button
              key={h.id}
              type="button"
              title={mode === "walkthrough" ? h.label : undefined}
              aria-label={h.label}
              disabled={disabled}
              style={style}
              className={
                "screen-hotspot " +
                (mode === "walkthrough" && h.correct ? "highlight" : "")
              }
              onClick={() => onAction(h.id)}
            />
          ) : (
            <form
              key={h.id}
              style={style}
              className="screen-input"
              onSubmit={(e) => {
                e.preventDefault();
                onAction(h.id, values[h.id] || "");
              }}
            >
              <input
                aria-label={h.label}
                placeholder={h.label}
                value={values[h.id] || ""}
                disabled={disabled}
                onChange={(e) =>
                  setValues({ ...values, [h.id]: e.target.value })
                }
              />
              <button aria-label={"Submit " + h.label} disabled={disabled}>
                ↵
              </button>
            </form>
          );
        })}
    </div>
  );
}
export function Preview({ steps }: { steps: Step[] }) {
  const [index, setIndex] = useState(0),
    [feedback, setFeedback] = useState("");
  const step = steps[index];
  if (!step)
    return (
      <p className="muted">Add screenshot steps to preview the scenario.</p>
    );
  return (
    <div className="preview-body">
      <div className="step-pills">
        {steps.map((s, i) => (
          <button
            key={s.id}
            className={index === i ? "selected" : ""}
            onClick={() => {
              setIndex(i);
              setFeedback("");
            }}
          >
            {i + 1}
          </button>
        ))}
      </div>
      <h3>{step.title || "Untitled step"}</h3>
      <p>{step.instructions}</p>
      {step.assetId && (
        <Screenshot
          key={step.id}
          step={step}
          mode="walkthrough"
          onAction={(hotspotId, value) => {
            const h = step.hotspots.find((h) => h.id === hotspotId),
              normalized = normalizeAnswer(value || "");
            const correct =
              h?.correct &&
              (h.type === "click" ||
                (normalized.length > 0 &&
                  h.accepted.some((a) => normalizeAnswer(a) === normalized)));
            setFeedback(
              correct
                ? "Correct preview action."
                : "This action or input does not match the configured answer.",
            );
          }}
        />
      )}
      {feedback && <p className="notice">{feedback}</p>}
      <p className="muted">
        Trainer preview. Actions here do not create agent results.
      </p>
    </div>
  );
}

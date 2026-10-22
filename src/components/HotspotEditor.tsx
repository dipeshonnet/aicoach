import { useRef, useState, type PointerEvent } from "react";
import { ImagePlus, MousePointer2, Trash2, Type } from "lucide-react";
import type { Hotspot, Step } from "../shared/types";
import { api, errorText, id as newId } from "../lib/api";
import { Field } from "./ui";

export function HotspotEditor({
  step,
  processId,
  onChange,
  onError,
}: {
  step: Step;
  processId: string;
  onChange: (step: Step) => void;
  onError: (error: string) => void;
}) {
  const [selected, setSelected] = useState<string | null>(
      step.hotspots[0]?.id || null,
    ),
    [draw, setDraw] = useState<"click" | "input" | null>(null),
    [start, setStart] = useState<{ x: number; y: number } | null>(null),
    [rectangle, setRectangle] = useState<{
      x: number;
      y: number;
      w: number;
      h: number;
    } | null>(null),
    [uploading, setUploading] = useState(false);
  const frame = useRef<HTMLDivElement>(null),
    fileRef = useRef<HTMLInputElement>(null);
  const current = step.hotspots.find((h) => h.id === selected);
  function coordinates(e: PointerEvent) {
    const bounds = frame.current!.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - bounds.left) / bounds.width)),
      y: Math.max(0, Math.min(1, (e.clientY - bounds.top) / bounds.height)),
    };
  }
  function down(e: PointerEvent<HTMLDivElement>) {
    if (!draw) return;
    const pos = coordinates(e);
    setStart(pos);
    setRectangle({ ...pos, w: 0, h: 0 });
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  }
  function move(e: PointerEvent<HTMLDivElement>) {
    if (!start) return;
    const end = coordinates(e);
    setRectangle({
      x: Math.min(start.x, end.x),
      y: Math.min(start.y, end.y),
      w: Math.abs(start.x - end.x),
      h: Math.abs(start.y - end.y),
    });
  }
  function add(
    rect: { x: number; y: number; w: number; h: number },
    type: "click" | "input",
  ) {
    if (step.hotspots.length >= 30) return;
    const h: Hotspot = {
      id: newId(),
      label: type === "click" ? "Click action" : "Input field",
      type,
      ...rect,
      correct: true,
      critical: false,
      accepted: [],
    };
    onChange({ ...step, hotspots: [...step.hotspots, h] });
    setSelected(h.id);
  }
  function up() {
    if (rectangle && draw && rectangle.w >= 0.005 && rectangle.h >= 0.005)
      add(rectangle, draw);
    setStart(null);
    setRectangle(null);
    setDraw(null);
  }
  function update(patch: Partial<Hotspot>) {
    onChange({
      ...step,
      hotspots: step.hotspots.map((h) =>
        h.id === selected ? { ...h, ...patch } : h,
      ),
    });
  }
  async function upload(file: File) {
    setUploading(true);
    onError("");
    try {
      if (file.size > 10 * 1024 * 1024)
        throw new Error("Choose a screenshot smaller than 10 MB.");
      const form = new FormData();
      form.set("processId", processId);
      form.set("file", file);
      const asset = await api<{ id: string }>("/assets", {
        method: "POST",
        body: form,
      });
      onChange({ ...step, assetId: asset.id });
    } catch (e) {
      onError(errorText(e));
    } finally {
      setUploading(false);
    }
  }
  const style = (r: { x: number; y: number; w: number; h: number }) => ({
    left: r.x * 100 + "%",
    top: r.y * 100 + "%",
    width: r.w * 100 + "%",
    height: r.h * 100 + "%",
  });
  return (
    <div className="hotspot-editor">
      <div className="screenshot-toolbar">
        <strong>Screenshot & actions</strong>
        <div>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            ref={fileRef}
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
              e.target.value = "";
            }}
          />
          <button
            className="button small"
            disabled={uploading || !processId}
            onClick={() => fileRef.current?.click()}
          >
            <ImagePlus size={15} />
            {uploading
              ? "Uploading…"
              : step.assetId
                ? "Replace screenshot"
                : "Upload screenshot"}
          </button>
        </div>
      </div>
      {step.assetId ? (
        <>
          <div className="draw-toolbar">
            <button
              className={"button small " + (draw === "click" ? "primary" : "")}
              disabled={step.hotspots.length >= 30}
              onClick={() => setDraw(draw === "click" ? null : "click")}
            >
              <MousePointer2 size={14} />
              Draw click region
            </button>
            <button
              className={"button small " + (draw === "input" ? "primary" : "")}
              disabled={step.hotspots.length >= 30}
              onClick={() => setDraw(draw === "input" ? null : "input")}
            >
              <Type size={14} />
              Draw input field
            </button>
            <button
              className="text-link"
              onClick={() => add({ x: 0.4, y: 0.4, w: 0.2, h: 0.1 }, "click")}
              disabled={step.hotspots.length >= 30}
            >
              Add centered region
            </button>
          </div>
          <div
            className={"editor-canvas " + (draw ? "drawing" : "")}
            ref={frame}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={() => {
              setStart(null);
              setRectangle(null);
            }}
          >
            <img
              src={"/api/assets/" + step.assetId}
              alt="Screenshot to annotate"
              draggable={false}
            />
            {step.hotspots.map((h, i) => (
              <button
                key={h.id}
                type="button"
                style={style(h)}
                className={
                  "editor-region " +
                  (selected === h.id ? "selected" : "") +
                  (h.correct ? "" : " incorrect")
                }
                aria-label={"Select " + h.label}
                onClick={() => {
                  if (!draw) setSelected(h.id);
                }}
              >
                <span>
                  {i + 1} · {h.type === "click" ? "Click" : "Input"}
                </span>
              </button>
            ))}
            {rectangle && (
              <div
                className="editor-region drawing-region"
                style={style(rectangle)}
              />
            )}
          </div>
          <p className="canvas-help">
            {draw
              ? "Drag across the screenshot to mark the region."
              : "Select a region to configure it. Positions are saved as percentages of the screenshot."}
          </p>
        </>
      ) : (
        <button
          className="upload-drop"
          disabled={uploading || !processId}
          onClick={() => fileRef.current?.click()}
        >
          <ImagePlus size={30} />
          <strong>
            {uploading
              ? "Uploading your screenshot…"
              : "Add a screenshot of this step"}
          </strong>
          <span>PNG, JPEG or WebP · Up to 10 MB</span>
        </button>
      )}
      {!!step.hotspots.length && (
        <div className="action-inspector">
          <div className="action-tabs">
            {step.hotspots.map((h, i) => (
              <button
                className={selected === h.id ? "selected" : ""}
                key={h.id}
                onClick={() => setSelected(h.id)}
              >
                {i + 1}. {h.label}
              </button>
            ))}
          </div>
          {current && (
            <div className="action-config">
              <div className="form-grid">
                <Field label="Action label">
                  <input
                    value={current.label}
                    maxLength={120}
                    onChange={(e) => update({ label: e.target.value })}
                  />
                </Field>
                <Field label="Action type">
                  <select
                    value={current.type}
                    onChange={(e) =>
                      update({ type: e.target.value as "click" | "input" })
                    }
                  >
                    <option value="click">Click</option>
                    <option value="input">Input field</option>
                  </select>
                </Field>
              </div>
              <div className="region-coordinates">
                {(["x", "y", "w", "h"] as const).map((key) => (
                  <Field
                    key={key}
                    label={
                      {
                        x: "Left (%)",
                        y: "Top (%)",
                        w: "Width (%)",
                        h: "Height (%)",
                      }[key]
                    }
                  >
                    <input
                      type="number"
                      min={key === "w" || key === "h" ? 0.5 : 0}
                      max={100}
                      step={0.1}
                      value={Number((current[key] * 100).toFixed(2))}
                      onChange={(e) =>
                        update({ [key]: Number(e.target.value) / 100 })
                      }
                    />
                  </Field>
                ))}
              </div>
              <div className="action-checks">
                <label>
                  <input
                    type="checkbox"
                    checked={current.correct}
                    onChange={(e) =>
                      update({
                        correct: e.target.checked,
                        critical: e.target.checked ? false : current.critical,
                      })
                    }
                  />
                  Required correct action
                </label>
                {!current.correct && (
                  <label>
                    <input
                      type="checkbox"
                      checked={current.critical}
                      onChange={(e) => update({ critical: e.target.checked })}
                    />
                    Taking this action is a critical failure
                  </label>
                )}
              </div>
              {current.type === "input" && (
                <Field
                  label="Accepted answers"
                  help="One answer per line. Matching ignores case and extra spaces."
                >
                  <textarea
                    rows={3}
                    value={current.accepted.join("\n")}
                    onChange={(e) =>
                      update({ accepted: e.target.value.split("\n") })
                    }
                  />
                </Field>
              )}
              <button
                className="text-link danger"
                onClick={() => {
                  onChange({
                    ...step,
                    hotspots: step.hotspots.filter((h) => h.id !== selected),
                  });
                  setSelected(null);
                }}
              >
                <Trash2 size={14} />
                Remove action
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

import { useRef, useState } from "react";
import { Download } from "lucide-react";
import { api, errorText } from "../lib/api";
import type { SopSource } from "../lib/sop-document";
import type { Scenario, ScenarioContent } from "../shared/types";

export function ExportSopButton({
  scenarioId,
  source,
  disabled = false,
  small = false,
  onError,
}: {
  scenarioId?: string;
  source: Omit<SopSource, "content"> & { content?: ScenarioContent };
  disabled?: boolean;
  small?: boolean;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const exporting = useRef(false);
  async function download() {
    if (exporting.current) return;
    exporting.current = true;
    setBusy(true);
    onError("");
    try {
      if (!source.content && !scenarioId)
        throw new Error("Choose a scenario to export.");
      const [draft, { exportSop }] = await Promise.all([
        source.content
          ? Promise.resolve({ ...source, content: source.content })
          : api<Scenario & { draft: ScenarioContent }>(
              "/scenarios/" + encodeURIComponent(scenarioId || ""),
            ).then((scenario) => ({
              ...source,
              content: scenario.draft,
              revision: scenario.draft_revision,
            })),
        import("../lib/export-sop"),
      ]);
      await exportSop(draft);
    } catch (error) {
      onError(errorText(error));
    } finally {
      exporting.current = false;
      setBusy(false);
    }
  }
  return (
    <button
      type="button"
      className={small ? "button small" : "button"}
      onClick={download}
      disabled={busy || disabled}
      aria-busy={busy}
      title="Download the current draft as a Word SOP document (.docx)"
    >
      <Download size={small ? 14 : 16} />
      {busy ? "Exporting…" : "Export SOP"}
    </button>
  );
}

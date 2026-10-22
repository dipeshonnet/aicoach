import { afterEach, describe, expect, it, vi } from "vitest";
import JSZip from "jszip";
import { createSopDocument, sopFilename } from "../src/lib/sop-document";
import { exportSop } from "../src/lib/export-sop";
import type { ScenarioContent } from "../src/shared/types";

const content: ScenarioContent = {
  title: "Verify & route <invoice>",
  office: "back",
  brief: "Handle an invoice exception.",
  reference: "Check the invoice reference.\nDo not approve payment.",
  outcome: "Invoice sent to finance review.",
  customerName: "",
  persona: "",
  opening: "",
  threshold: 80,
  rubric: [],
  steps: [
    {
      id: "verify",
      title: "Verify invoice",
      instructions: "Confirm INV-1048 before proceeding.",
      hint: "Use the work item reference.",
      assetId: "invoice-screen",
      critical: true,
      hotspots: [
        {
          id: "reference",
          label: "Invoice reference",
          type: "input",
          x: 0,
          y: 0,
          w: 0.1,
          h: 0.1,
          accepted: ["INV-1048", "inv-1048"],
          correct: true,
          critical: true,
        },
        {
          id: "pay",
          label: "Approve payment",
          type: "click",
          x: 0.2,
          y: 0.2,
          w: 0.1,
          h: 0.1,
          accepted: [],
          correct: false,
          critical: true,
        },
      ],
    },
    {
      id: "route",
      title: "Route to finance",
      instructions: "Send the exception to finance review.",
      hint: "",
      assetId: "",
      critical: false,
      hotspots: [],
    },
  ],
};

afterEach(() => vi.unstubAllGlobals());

describe("scenario SOP export", () => {
  it("creates a self-contained Word document with ordered steps, inputs and critical checks", async () => {
    const png = new Uint8Array(
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=",
        "base64",
      ),
    );
    const blob = await createSopDocument(
      {
        content,
        process: { name: "Accounts payable", client: "Example client" },
        revision: 7,
      },
      new Map([["invoice-screen", { data: png, width: 1000, height: 620 }]]),
    );
    expect(blob.type).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const xml = await zip.file("word/document.xml")!.async("string");
    for (const text of [
      "STANDARD OPERATING PROCEDURE",
      "Verify &amp; route &lt;invoice&gt;",
      "Accounts payable",
      "Example client",
      "Back office",
      "Draft revision 7",
      "Handle an invoice exception.",
      "Do not approve payment.",
      "Invoice sent to finance review.",
      "Confirm INV-1048 before proceeding.",
      "INV-1048 or inv-1048",
      "Critical check",
      "Actions to avoid",
      "Critical - do not",
      "Approve payment",
      "Use the work item reference.",
    ])
      expect(xml).toContain(text);
    expect(xml.indexOf("Procedure - step 1 of 2")).toBeLessThan(
      xml.indexOf("Procedure - step 2 of 2"),
    );
    expect(xml).toContain("<w:pageBreakBefore/>");
    expect(xml).toContain("Application screenshot for procedure step 1");
    const media = Object.keys(zip.files).filter(
      (name) => name.startsWith("word/media/") && name.endsWith(".png"),
    );
    expect(media).toHaveLength(1);
    expect(await zip.file(media[0])!.async("uint8array")).toEqual(png);
    const rels = await zip
      .file("word/_rels/document.xml.rels")!
      .async("string");
    expect(rels).not.toContain("/api/assets/");
    expect(rels).not.toContain('TargetMode="External"');
  });

  it("exports unsaved front-office drafts with customer context and no invented steps", async () => {
    const blob = await createSopDocument(
      {
        content: {
          ...content,
          office: "front",
          customerName: "Zoë",
          persona: "Needs help with delivery.",
          opening: "Where is my order?",
          steps: [],
        },
        revision: 7,
        unsaved: true,
      },
      new Map(),
    );
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const xml = await zip.file("word/document.xml")!.async("string");
    for (const text of [
      "Front office",
      "Unsaved draft",
      "Zoë",
      "Needs help with delivery.",
      "Where is my order?",
      "No procedure steps configured.",
    ])
      expect(xml).toContain(text);
    expect(xml).not.toContain("Draft revision 7");
    expect(xml).not.toContain("Procedure - step 1");
  });

  it("refuses to generate an SOP if a referenced screenshot is missing", async () => {
    await expect(createSopDocument({ content }, new Map())).rejects.toThrow(
      "Screenshot missing for step 1",
    );
  });

  it("stops a failed screenshot download and signals an expired session", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    const browser = new EventTarget();
    vi.stubGlobal("window", browser);
    const expired = vi.fn();
    browser.addEventListener("session-expired", expired);
    await expect(exportSop({ content })).rejects.toThrow(
      "Could not load the screenshot for step 1 (Verify invoice)",
    );
    expect(expired).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/assets/invoice-screen",
      expect.objectContaining({ credentials: "same-origin" }),
    );
  });

  it("uses safe filenames while preserving non-English titles", () => {
    expect(sopFilename('Invoice: "Review" / <Paid>?')).toBe(
      "Invoice- -Review- - -Paid-- - SOP.docx",
    );
    expect(sopFilename("  ")).toBe("Scenario - SOP.docx");
    expect(sopFilename("प्रक्रिया")).toBe("प्रक्रिया - SOP.docx");
    expect(sopFilename("a".repeat(200)).length).toBeLessThan(120);
  });
});

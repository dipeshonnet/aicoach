import type { Env } from "./env";
import type { ScenarioContent } from "../src/shared/types";

export function correctInvoiceScreen(svg: string) {
  return svg
    .replace(
      "Ava Morgan · Order BR-7024",
      "Example supplier · Invoice INV-1048",
    )
    .replace("Customer records", "Invoice records")
    .replace(
      "RETAIL OPERATIONS / CASE DETAIL",
      "RETAIL OPERATIONS / INVOICE EXCEPTION",
    )
    .replace("Customer reference", "Invoice reference")
    .replace("TRAIN-1048", "INV-1048")
    .replace("Case value", "Exception reason")
    .replace("USD 49.00", "Duplicate supplier reference");
}
function screen(title: string, label: string, input = false) {
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="620" viewBox="0 0 1000 620"><rect width="1000" height="620" fill="#f3f5f7"/><rect width="1000" height="66" fill="#173c37"/><text x="32" y="42" font-family="Arial" font-size="23" fill="white">Operations workspace</text><text x="778" y="41" font-family="Arial" font-size="14" fill="#b8d5ce">TRAINING SANDBOX</text><rect y="66" width="206" height="554" fill="white"/><text x="28" y="118" font-family="Arial" font-size="16" fill="#60706f">Work queue</text><rect x="14" y="138" width="178" height="48" rx="7" fill="#e8f1ee"/><text x="28" y="168" font-family="Arial" font-size="15" fill="#173c37">Current work item</text><text x="28" y="220" font-family="Arial" font-size="15" fill="#60706f">Customer records</text><text x="28" y="267" font-family="Arial" font-size="15" fill="#60706f">Knowledge base</text><text x="248" y="125" font-family="Arial" font-size="13" fill="#71807d">RETAIL OPERATIONS / CASE DETAIL</text><text x="248" y="165" font-family="Arial" font-size="26" font-weight="bold" fill="#213a35">' +
    title +
    '</text><rect x="246" y="196" width="710" height="330" rx="10" fill="white" stroke="#dce4e1"/><text x="276" y="240" font-family="Arial" font-size="17" fill="#213a35">Ava Morgan · Order BR-7024</text><text x="276" y="285" font-family="Arial" font-size="15" fill="#60706f">Customer reference</text><text x="620" y="285" font-family="Arial" font-size="15" fill="#213a35">TRAIN-1048</text><line x1="276" y1="305" x2="926" y2="305" stroke="#edf0ef"/><text x="276" y="337" font-family="Arial" font-size="15" fill="#60706f">Case value</text><text x="620" y="337" font-family="Arial" font-size="15" fill="#213a35">USD 49.00</text><text x="276" y="383" font-family="Arial" font-size="15" fill="#60706f">Next action</text><rect x="630" y="397" width="300" height="58" rx="7" fill="' +
    (input ? "#fff" : "#227261") +
    '" stroke="' +
    (input ? "#a8bbb3" : "#227261") +
    '"/><text x="' +
    (input ? "642" : "780") +
    '" y="433" text-anchor="' +
    (input ? "start" : "middle") +
    '" font-family="Arial" font-size="16" fill="' +
    (input ? "#98a59f" : "white") +
    '">' +
    label +
    '</text><text x="276" y="489" font-family="Arial" font-size="13" fill="#83928c">Synthetic example. No live customer data.</text></svg>'
  );
}
export async function seedExamples(env: Env, adminId: string) {
  const processId = "process-retail";
  const definitions = [
    {
      id: "scenario-refund",
      title: "Resolve a delayed order",
      office: "front" as const,
      brief:
        "A customer calls about an order that has not arrived. Verify their identity, locate the order, and offer the approved resolution.",
      reference:
        "Customer Ava Morgan, reference TRAIN-1048, order BR-7024, value USD 49.00. Delivery is 7 days late. Verify the customer before accessing order details. Explain that the customer is eligible for a full refund. Process the refund and advise 3–5 business days for the credit. Never promise immediate credit.",
      outcome:
        "Identity verified, order located, full refund processed, and the correct 3–5 business day credit timeframe communicated.",
      persona:
        "Ava is worried and initially frustrated but becomes cooperative when the agent is clear and empathetic. Provide TRAIN-1048 when asked for the customer reference.",
      opening:
        "Hi, my order was supposed to arrive last week and it is still not here. Can you help?",
      steps: [
        {
          title: "Verify the customer",
          instructions:
            "Ask for the customer reference, then confirm verification in the case screen.",
          hint: "Confirm identity before opening the order.",
          label: "Confirm verification",
          type: "click" as const,
          accepted: [],
          critical: true,
        },
        {
          title: "Locate the order",
          instructions:
            "Enter the order number BR-7024 in the order lookup field.",
          hint: "The order number is BR-7024.",
          label: "Enter order number",
          type: "input" as const,
          accepted: ["BR-7024"],
          critical: false,
        },
        {
          title: "Process the resolution",
          instructions:
            "Process the approved refund. Tell the customer the credit takes 3–5 business days.",
          hint: "Use the refund action and explain the credit timeframe.",
          label: "Process full refund",
          type: "click" as const,
          accepted: [],
          critical: true,
        },
      ],
    },
    {
      id: "scenario-invoice",
      title: "Process an invoice exception",
      office: "back" as const,
      brief:
        "An invoice has reached the exception queue. Verify the reference, classify the discrepancy, and route the item to the correct team.",
      reference:
        "Training invoice INV-1048 has a duplicate supplier reference. Check the reference before taking action. Enter classification DUPLICATE and route the invoice to the finance review queue. Do not approve or pay the invoice.",
      outcome:
        "The invoice is verified, classified as DUPLICATE, and routed to finance review without payment.",
      persona: "",
      opening: "",
      steps: [
        {
          title: "Verify the invoice",
          instructions:
            "Check INV-1048 against the work item and confirm the reference.",
          hint: "Start with reference verification.",
          label: "Confirm invoice reference",
          type: "click" as const,
          accepted: [],
          critical: true,
        },
        {
          title: "Classify the exception",
          instructions: "Enter DUPLICATE as the exception classification.",
          hint: "The supplier reference appears on an existing invoice.",
          label: "Enter classification",
          type: "input" as const,
          accepted: ["DUPLICATE"],
          critical: false,
        },
        {
          title: "Route the invoice",
          instructions:
            "Route the item to finance review. Do not approve payment.",
          hint: "Choose the finance review queue.",
          label: "Send to finance review",
          type: "click" as const,
          accepted: [],
          critical: true,
        },
      ],
    },
  ];
  const time = Date.now();
  const statements: D1PreparedStatement[] = [
    env.DB.prepare(
      "INSERT INTO processes(id,name,client,description,created_at) VALUES(?,?,?,?,?)",
    ).bind(
      processId,
      "Retail operations",
      "Practice company",
      "Synthetic customer care and invoice-processing examples.",
      time,
    ),
  ];
  for (const d of definitions) {
    const steps = [];
    for (let i = 0; i < d.steps.length; i++) {
      const item = d.steps[i],
        assetId = d.id + "-screen-" + i,
        key = "screenshots/" + assetId + ".svg";
      const image = screen(item.title, item.label, item.type === "input");
      await env.SCREENSHOTS.put(
        key,
        d.office === "back" ? correctInvoiceScreen(image) : image,
        { httpMetadata: { contentType: "image/svg+xml" } },
      );
      statements.push(
        env.DB.prepare("INSERT INTO assets VALUES(?,?,?,?,?,?,?)").bind(
          assetId,
          processId,
          key,
          "image/svg+xml",
          item.title,
          adminId,
          time,
        ),
      );
      steps.push({
        id: d.id + "-step-" + i,
        title: item.title,
        instructions: item.instructions,
        hint: item.hint,
        assetId,
        critical: item.critical,
        hotspots: [
          {
            id: d.id + "-action-" + i,
            label: item.label,
            type: item.type,
            x: 0.63,
            y: 397 / 620,
            w: 0.3,
            h: 58 / 620,
            accepted: item.accepted,
            correct: true,
            critical: false,
          },
        ],
      });
    }
    const keys =
      d.office === "front"
        ? (["procedure", "resolution", "compliance", "communication"] as const)
        : (["procedure", "resolution", "compliance"] as const);
    const s: ScenarioContent = {
      title: d.title,
      office: d.office,
      brief: d.brief,
      reference: d.reference,
      outcome: d.outcome,
      customerName: d.office === "front" ? "Ava Morgan" : "",
      persona: d.persona,
      opening: d.opening,
      threshold: 80,
      rubric: keys.map((key) => ({
        key,
        label: key[0].toUpperCase() + key.slice(1),
        weight: 1,
        guidance: "",
      })),
      steps,
    };
    const json = JSON.stringify(s);
    statements.push(
      env.DB.prepare(
        "INSERT INTO scenarios(id,process_id,title,office,draft_json,draft_revision,published_version,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
      ).bind(
        d.id,
        processId,
        d.title,
        d.office,
        json,
        1,
        1,
        adminId,
        time,
        time,
      ),
    );
    statements.push(
      env.DB.prepare("INSERT INTO scenario_versions VALUES(?,?,?,?,?,?)").bind(
        d.id + "-v1",
        d.id,
        1,
        json,
        adminId,
        time,
      ),
    );
  }
  await env.DB.batch(statements);
}

export interface PeopleCsvRow {
  row: number;
  name: string;
  email: string;
  password: string;
  role: string;
  batchIds: string;
}
export interface PeopleImportResult {
  created: number;
  updated: number;
  errors: { row: number; email: string; message: string }[];
}

// Quoted fields can contain commas, escaped quotes, and line breaks.
export function parsePeopleCsv(source: string): PeopleCsvRow[] {
  if (source.length > 500_000) throw new Error("CSV must be smaller than 500 KB.");
  const records: { line: number; cells: string[] }[] = [];
  let cells: string[] = [], value = "", quoted = false, closed = false;
  let line = 1, start = 1;
  const cell = () => { cells.push(value); value = ""; closed = false; };
  const record = () => {
    cell();
    if (cells.some((c) => c.trim())) records.push({ line: start, cells });
    cells = [];
  };
  const text = source.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { value += '"'; i++; }
        else { quoted = false; closed = true; }
      } else { value += ch; if (ch === "\n") line++; }
    } else if (ch === ",") cell();
    else if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      record(); line++; start = line;
    } else if (ch === '"' && !value && !closed) quoted = true;
    else {
      if (closed || ch === '"') throw new Error(`Invalid CSV quoting on line ${line}.`);
      value += ch;
    }
  }
  if (quoted) throw new Error("CSV has an unclosed quoted field.");
  record();
  const header = records.shift()?.cells.map((c) => c.trim().toLowerCase());
  const allowed = ["name", "email", "password", "role", "batchids"];
  if (!header || !header.includes("email") || !header.includes("name"))
    throw new Error("CSV must include name and email headers.");
  if (new Set(header).size !== header.length || header.some((h) => !allowed.includes(h)))
    throw new Error("Use unique headers: name,email,password,role,batchIds.");
  if (!records.length || records.length > 100) throw new Error("Import between 1 and 100 people at a time.");
  return records.map(({ line, cells }) => {
    if (cells.length !== header.length) throw new Error(`Line ${line} has the wrong number of columns.`);
    const get = (key: string) => cells[header.indexOf(key)] ?? "";
    return { row: line, name: get("name").trim(), email: get("email").trim().toLowerCase(),
      password: get("password"), role: get("role").trim().toLowerCase(), batchIds: get("batchids").trim() };
  });
}

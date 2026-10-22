import { describe, expect, it } from "vitest";
import { parsePeopleCsv } from "../src/shared/people-csv";

describe("people CSV", () => {
  it("handles spreadsheet BOM, CRLF, commas, escaped quotes and multiline names", () => {
    const rows = parsePeopleCsv('\uFEFFname,email,password\r\n"Smith, ""Jo""\nDoe", JO@example.com ," password123456 "\r\n');
    expect(rows).toEqual([{ row: 2, name: 'Smith, "Jo"\nDoe', email: "jo@example.com", password: " password123456 ", role: "", batchIds: "" }]);
  });
  it.each([
    'name,email\n"Unclosed,a@example.com',
    'name,email\n"Name"x,a@example.com',
    'name,email\nName,a@example.com,extra',
    'name,email,email\nName,a@example.com,a@example.com',
    'name,unknown\nName,test',
    'name,email\n',
    'name,email\n' + 'Person,a@example.com\n'.repeat(101),
  ])("rejects malformed or unsupported input", (csv) => {
    expect(() => parsePeopleCsv(csv)).toThrow();
  });
});

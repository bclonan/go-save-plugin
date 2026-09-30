import test from "node:test";
import assert from "node:assert/strict";
import Papa from "papaparse";
import { cleanCSV, inspectCSV, parseCSV, registerTools, LIMITS } from "../src/tools.js";

test("preserves identifier strings, large integers and literal booleans", () => {
  const result = cleanCSV("id,big,flag\n000123,9007199254740993,true\n");
  assert.deepEqual(Papa.parse(result.csvText, { skipEmptyLines: true }).data[1],
    ["000123", "9007199254740993", "true"]);
  assert.equal(result.report.after.columns[0].suggestedType, "identifier-like (leading zeros)");
});

test("quoted delimiters, escaped quotes and embedded newlines round-trip", () => {
  const csv = 'id,note\r\n001,"a,b ""quoted""\nsecond line"\r\n';
  assert.deepEqual(parseCSV(cleanCSV(csv).csvText).rows, parseCSV(csv).rows);
});

test("supports explicit alternate input delimiters and emits comma CSV", () => {
  const result = cleanCSV("id;note\n001;hello\n", { delimiter: ";" });
  assert.deepEqual(parseCSV(result.csvText).rows, [["001", "hello"]]);
  assert.equal(result.report.outputDelimiter, ",");
});

test("deduplication is opt-in, happens after trimming and keeps the first row", () => {
  const csv = "id,name\n 001 , Alice \n001,Alice\n002,Bob\n";
  assert.equal(cleanCSV(csv).report.after.rows, 3);
  const result = cleanCSV(csv, { deduplicate: true });
  assert.deepEqual(parseCSV(result.csvText).rows, [["001", "Alice"], ["002", "Bob"]]);
  assert.equal(result.report.changes.trimmedCells, 2);
  assert.equal(result.report.changes.removedDuplicateRows, 1);
  assert.equal(result.report.before.duplicateRows, 0);
});

test("trimming can be disabled without converting values", () => {
  const result = cleanCSV("id,name\n 001 , Alice \n001,Alice\n", { trim: false, deduplicate: true });
  assert.deepEqual(parseCSV(result.csvText).rows[0], [" 001 ", " Alice "]);
  assert.equal(result.report.changes.trimmedCells, 0);
  assert.equal(result.report.changes.removedDuplicateRows, 0);
});

test("blank rows are counted; retaining them preserves the rectangular shape", () => {
  const csv = "id,name\n001,Alice\n\n002,Bob\n, \n";
  const result = cleanCSV(csv);
  assert.equal(result.report.before.blankRows, 2);
  assert.equal(result.report.changes.removedBlankRows, 2);
  assert.equal(result.report.after.rows, 2);
  const retained = cleanCSV(csv, { removeBlankRows: false });
  assert.deepEqual(parseCSV(retained.csvText).rows[1], ["", ""]);
  assert.equal(retained.report.after.rows, 4);
});

test("rejects duplicate or blank headers without exposing data values", () => {
  for (const csv of ["id,id\n1,2", "id, id \n1,2", "id,\n1,2", " ,name\n1,2"]) {
    assert.throws(() => parseCSV(csv), /header/i);
  }
  assert.throws(() => parseCSV("e\u0301,\u00e9\n1,2"), /duplicate/);
});

test("rejects ragged and malformed rows even when blank removal is enabled", () => {
  assert.throws(() => cleanCSV("id,name\n001"), /Data row 1 has 1 fields/);
  assert.throws(() => cleanCSV("id,name\n001,Alice,extra"), /Data row 1 has 3 fields/);
  assert.throws(() => cleanCSV("a,b,c\n,"), /Data row 1 has 2 fields/);
  assert.throws(() => cleanCSV('id,name\n001,"unfinished'), /malformed quoting/);
});

test("formula protection covers headers, whitespace, controls and negative values", () => {
  const csv = '=header,name\n=2+2,+cmd\n -10,@formula\n"\t=SUM(A1)",safe\n';
  const result = cleanCSV(csv, { trim: false });
  const exported = Papa.parse(result.csvText, { skipEmptyLines: true }).data;
  assert.equal(exported[0][0], "'=header");
  assert.deepEqual(exported[1], ["'=2+2", "'+cmd"]);
  assert.deepEqual(exported[2], ["' -10", "'@formula"]);
  assert.equal(exported[3][0], "'\t=SUM(A1)");
  assert.equal(result.report.changes.escapedFormulaCells, 6);
  assert.ok(result.report.warnings.some((warning) => warning.includes("apostrophe")));
});

test("rejects header collisions introduced by spreadsheet safety escaping", () => {
  assert.throws(() => cleanCSV("=x,'=x\none,two\n"), /safety escaping.*duplicate/);
});

test("summary counts missing and exact duplicates without returning cell samples", () => {
  const summary = inspectCSV("id,name,done\n001,Alice,true\n001,Alice,true\n002, ,false\n");
  assert.equal(summary.rows, 3);
  assert.equal(summary.duplicateRows, 1);
  assert.equal(summary.missingCells, 1);
  assert.equal(summary.columns[2].suggestedType, "boolean-like");
  assert.doesNotMatch(JSON.stringify(summary), /Alice|001|002/);
});

test("supports a UTF-8 BOM and single-column or header-only CSV", () => {
  assert.deepEqual(parseCSV("\uFEFFid\n001\n").rows, [["001"]]);
  assert.equal(inspectCSV("id,name\r\n").rows, 0);
  assert.throws(() => parseCSV(""), /nonempty/);
});

test("enforces UTF-8 byte, row and column boundaries", () => {
  assert.throws(() => parseCSV("id\n" + "é".repeat(LIMITS.bytes / 2)), /1 MiB/);
  assert.equal(parseCSV("a,b\n" + "x,y\n".repeat(LIMITS.rows)).rows.length, LIMITS.rows);
  assert.throws(() => parseCSV("a,b\n" + "x,y\n".repeat(LIMITS.rows + 1)), /10,000/);
  assert.throws(() => parseCSV(Array.from({ length: 101 }, (_, i) => "c" + i).join(",")), /100-column/);
  assert.throws(() => parseCSV("id\nnul\0value"), /NUL/);
});

function captureTools(artifacts) {
  const registered = new Map();
  registerTools({ registerTool: (name, config, handler) => registered.set(name, { config, handler }) }, artifacts);
  return registered;
}

test("preview never stores a file and export returns artifact metadata and a report", async () => {
  const writes = [];
  const registered = captureTools({
    add: async (file) => {
      writes.push(file);
      return { url: "https://example.test/download/token", name: file.name, mimeType: file.mimeType, bytes: file.bytes.length };
    }
  });
  const clean = registered.get("clean_csv").handler;
  const preview = await clean({ csv: "id\n001\n" });
  assert.equal(preview.structuredContent.preview, true);
  assert.equal(preview.structuredContent.download, null);
  assert.equal(writes.length, 0);
  const exported = await clean({ csv: "id\n001\n", preview: false });
  assert.equal(writes.length, 1);
  assert.equal(writes[0].bytes.toString("utf8"), '"id"\r\n"001"\r\n');
  assert.equal(exported.structuredContent.download.name, "cleaned.csv");
  assert.equal(exported.structuredContent.after.rows, 1);
  assert.equal(exported.content[0].type, "text");
});

test("MCP validation and storage failures produce safe error responses", async () => {
  const registered = captureTools({ add: async () => { throw new Error("secret backend token"); } });
  const invalid = await registered.get("inspect_csv").handler({ csv: "id,id\nsecret,value" });
  assert.equal(invalid.isError, true);
  assert.doesNotMatch(invalid.content[0].text, /secret|value/);
  const failed = await registered.get("clean_csv").handler({ csv: "id\n001", preview: false });
  assert.equal(failed.isError, true);
  assert.doesNotMatch(failed.content[0].text, /secret backend token/);
});

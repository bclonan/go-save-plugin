import Papa from "papaparse";
import { Buffer } from "node:buffer";
import { z } from "zod";

export const LIMITS = Object.freeze({ bytes: 1024 * 1024, rows: 10000, columns: 100 });
const DELIMITERS = [",", ";", "\t", "|"];
const FORMULA = /^[\s\u0000-\u001f]*[=+\-@\uFF1D\uFF0B\uFF0D\uFF20]|^[\t\r\n]/u;

export class CSVError extends Error {
  constructor(message) {
    super(message);
    this.name = "CSVError";
  }
}

function validateHeaders(headers) {
  if (headers.some((value) => value.trim() === "")) {
    throw new CSVError("The header contains a blank column name. Give every column a unique name.");
  }
  const names = headers.map((value) => value.trim().normalize("NFC"));
  if (new Set(names).size !== names.length) {
    throw new CSVError("The header contains duplicate column names after trimming. Rename them before cleaning.");
  }
}

export function parseCSV(csv, { delimiter = "," } = {}) {
  if (typeof csv !== "string" || csv.length === 0) throw new CSVError("Provide a nonempty CSV string with a header.");
  if (Buffer.byteLength(csv, "utf8") > LIMITS.bytes) throw new CSVError("CSV exceeds the 1 MiB UTF-8 limit.");
  if (!DELIMITERS.includes(delimiter)) throw new CSVError("Choose comma, semicolon, tab, or pipe as the delimiter.");
  if (csv.includes("\0")) throw new CSVError("CSV contains an unsupported NUL character.");
  const parsed = Papa.parse(csv, {
    delimiter, header: false, dynamicTyping: false, skipEmptyLines: false,
    preview: LIMITS.rows + 2
  });
  if (parsed.errors.length) {
    throw new CSVError("CSV has malformed quoting. Correct the CSV syntax before continuing.");
  }
  const records = parsed.data;
  // A record separator at EOF is not an extra empty data record.
  if (/[\r\n]$/.test(csv) && records.at(-1)?.length === 1 && records.at(-1)[0] === "") records.pop();
  if (parsed.meta.truncated || records.length - 1 > LIMITS.rows) {
    throw new CSVError("CSV exceeds the 10,000 data-row limit.");
  }
  if (!records.length) throw new CSVError("Provide a CSV header.");
  const [headers, ...rows] = records;
  if (headers.length > LIMITS.columns) throw new CSVError("CSV exceeds the 100-column limit.");
  validateHeaders(headers);
  const normalizedRows = rows.map((row, index) => {
    // An empty record represents a blank row. Nonempty ragged rows are never dropped.
    if (row.length === 1 && row[0] === "") return Array(headers.length).fill("");
    if (row.length !== headers.length) {
      throw new CSVError("Data row " + (index + 1) + " has " + row.length +
        " fields; the header has " + headers.length + ". Correct ragged rows before cleaning.");
    }
    return row;
  });
  return { headers, rows: normalizedRows, delimiter };
}

function looksLike(values) {
  if (!values.length) return "empty";
  if (values.some((value) => /^0\d+$/.test(value))) return "identifier-like (leading zeros)";
  if (values.every((value) => /^(?:true|false)$/i.test(value))) return "boolean-like";
  if (values.every((value) => /^\d{4}-\d{2}-\d{2}(?:[T ][0-9:.+\-Z]+)?$/.test(value))) return "date-like (shape only)";
  if (values.every((value) => /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value))) return "numeric-like";
  return "text or mixed";
}

export function summarize(table) {
  const seen = new Set();
  let duplicateRows = 0;
  let blankRows = 0;
  for (const row of table.rows) {
    const key = JSON.stringify(row);
    if (seen.has(key)) duplicateRows++;
    seen.add(key);
    if (row.every((cell) => cell.trim() === "")) blankRows++;
  }
  const columns = table.headers.map((name, index) => {
    const cells = table.rows.map((row) => row[index]);
    const nonempty = cells.filter((cell) => cell.trim() !== "");
    return {
      index: index + 1, name,
      missing: cells.length - nonempty.length,
      distinctNonempty: new Set(nonempty).size,
      suggestedType: looksLike(nonempty.map((value) => value.trim()))
    };
  });
  return {
    rows: table.rows.length, columnCount: table.headers.length, blankRows, duplicateRows,
    missingCells: columns.reduce((total, column) => total + column.missing, 0),
    columns
  };
}

export function inspectCSV(csv, options = {}) {
  return {
    ...summarize(parseCSV(csv, options)),
    notes: [
      "No values were changed. All cells are strings; types are heuristics only.",
      "Missing means empty or whitespace-only. Duplicates are exact complete rows.",
      "Column names are included in this response; cell values are not."
    ]
  };
}

export function cleanCSV(csv, { delimiter = ",", trim = true, removeBlankRows = true, deduplicate = false } = {}) {
  for (const option of [trim, removeBlankRows, deduplicate]) {
    if (typeof option !== "boolean") throw new CSVError("Cleanup options must be true or false.");
  }
  const input = parseCSV(csv, { delimiter });
  const before = summarize(input);
  let trimmedCells = 0;
  const trimCell = (cell) => {
    const result = trim ? cell.trim() : cell;
    if (result !== cell) trimmedCells++;
    return result;
  };
  const headers = input.headers.map(trimCell);
  let rows = input.rows.map((row) => row.map(trimCell));
  let removedBlankRows = 0;
  if (removeBlankRows) {
    rows = rows.filter((row) => {
      if (!row.every((cell) => cell.trim() === "")) return true;
      removedBlankRows++;
      return false;
    });
  }
  let removedDuplicateRows = 0;
  if (deduplicate) {
    const seen = new Set();
    rows = rows.filter((row) => {
      const key = JSON.stringify(row);
      if (seen.has(key)) {
        removedDuplicateRows++;
        return false;
      }
      seen.add(key);
      return true;
    });
  }
  const after = summarize({ headers, rows });
  let escapedFormulaCells = 0;
  const escapeFormula = (cell) => {
    if (!FORMULA.test(cell)) return cell;
    escapedFormulaCells++;
    return "'" + cell;
  };
  const exportHeaders = headers.map(escapeFormula);
  // Safety prefixes must not silently create two identical exported header names.
  if (new Set(exportHeaders).size !== exportHeaders.length) {
    throw new CSVError("Spreadsheet safety escaping would create duplicate header names. Rename these columns.");
  }
  const exportRows = rows.map((row) => row.map(escapeFormula));
  const csvText = Papa.unparse([exportHeaders, ...exportRows], {
    delimiter: ",", newline: "\r\n", quotes: true, skipEmptyLines: false
  }) + "\r\n";
  const warnings = [
    "Every cell is exported as text in CSV syntax; spreadsheet import may still infer types. Import identifier columns as Text to preserve leading zeros.",
    "Before/after statistics describe logical cells before spreadsheet safety prefixes."
  ];
  if (escapedFormulaCells) warnings.push(escapedFormulaCells + " cells, including any affected headers, received a leading apostrophe to reduce spreadsheet formula execution risk. This changes exported text, including negative numeric strings. Do not remove these prefixes from untrusted values.");
  return {
    csvText,
    report: {
      before, after,
      changes: { trimmedCells, removedBlankRows, removedDuplicateRows, escapedFormulaCells },
      options: { delimiter, trim, removeBlankRows, deduplicate },
      outputDelimiter: ",",
      warnings
    }
  };
}

const csvInput = z.string().min(1).max(LIMITS.bytes).describe("Raw CSV text including a header, up to 1 MiB UTF-8, 10,000 rows and 100 columns.");
const delimiterInput = z.enum([",", ";", "\t", "|"]).default(",").describe("Input delimiter. Output is always comma-separated.");
const commonAnnotations = { destructiveHint: false, openWorldHint: false };

function success(data, text) {
  return { content: [{ type: "text", text }], structuredContent: data };
}

function failure(error) {
  return {
    isError: true,
    content: [{ type: "text", text: error instanceof CSVError ? error.message : "CSV operation failed. Retry or check the server configuration." }]
  };
}

export function registerTools(server, artifacts) {
  server.registerTool("inspect_csv", {
    title: "Inspect a CSV",
    description: "Count missing values, exact duplicate rows and blank rows without changing values. Show column shape hints without returning data samples. Reject malformed, ragged or ambiguous headers.",
    inputSchema: { csv: csvInput, delimiter: delimiterInput },
    annotations: { ...commonAnnotations, readOnlyHint: true, idempotentHint: true }
  }, async ({ csv, delimiter }) => {
    try {
      const summary = inspectCSV(csv, { delimiter });
      return success(summary, JSON.stringify(summary));
    } catch (error) { return failure(error); }
  });

  server.registerTool("clean_csv", {
    title: "Clean and export a CSV",
    description: "Preview or export conservative CSV cleanup. Trimming and blank-row removal default on; exact row deduplication requires deduplicate=true. Preview defaults on and creates no download. Set preview=false to create a CSV download with a before/after report. Preserve strings; reject invalid structure; protect spreadsheet formulas by prefixing risky cells.",
    inputSchema: {
      csv: csvInput, delimiter: delimiterInput,
      trim: z.boolean().default(true).describe("Trim surrounding whitespace in headers and values. Set false to preserve it."),
      removeBlankRows: z.boolean().default(true).describe("Remove rows whose cells are all empty or whitespace."),
      deduplicate: z.boolean().default(false).describe("Remove repeated complete rows after optional trimming, keeping the first."),
      preview: z.boolean().default(true).describe("Return a report only. Set false to create the CSV download.")
    },
    annotations: { ...commonAnnotations, readOnlyHint: false, idempotentHint: false }
  }, async ({ csv, delimiter, trim, removeBlankRows, deduplicate, preview = true }) => {
    try {
      const { csvText, report } = cleanCSV(csv, { delimiter, trim, removeBlankRows, deduplicate });
      const download = preview ? null : await artifacts.add({
        name: "cleaned.csv", mimeType: "text/csv; charset=utf-8", bytes: Buffer.from(csvText, "utf8")
      });
      const result = { preview, ...report, download };
      return success(result, JSON.stringify(result));
    } catch (error) { return failure(error); }
  });
}

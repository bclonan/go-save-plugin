# CSV Rescue

Turn a messy everyday export into a usable CSV, with a change report you can check.

Try: **“Inspect this contact export, then preview trimming whitespace and removing exact duplicate rows. Preserve IDs like 000123. Export the cleaned CSV.”**

This is a Node 22 ESM MCP app for ChatGPT connections that support MCP. It is not a legacy ChatGPT plugin manifest. The repository provides the shared server and artifact runtime.

## What it does

- `inspect_csv`: counts rows, columns, blank rows, missing cells and exact duplicate rows. Adds conservative column-shape hints without returning cell samples.
- `clean_csv`: trims surrounding whitespace, removes blank rows, optionally removes exact duplicate rows and produces a downloadable CSV with before/after counts.
- Supports comma, semicolon, tab or pipe input. Exports quoted comma-separated CSV with CRLF record separators.
- Preserves all cell values as strings. No number/date conversion, fuzzy matching, guessed replacements or silent column loss.

Use `preview: true` (the default) to get a report without creating a file, then `preview: false` to create the download. Trimming and blank-row removal default to true; set either to false when whitespace or empty records matter. Deduplication defaults to false and keeps the first complete row after the selected trimming step.

## Example

```json
{
  "csv": "id,name\n 001 , Alice \n001,Alice\n002,Bob\n",
  "trim": true,
  "removeBlankRows": true,
  "deduplicate": true,
  "preview": true
}
```

The report shows 3 → 2 data rows, 2 trimmed cells, and 1 removed duplicate row. Use the same arguments with `preview: false` for a `cleaned.csv` download. The supplied [example file](examples/contacts.csv) also includes a blank row.

## Data rules

Limits are 1 MiB of UTF-8 input, 10,000 data rows and 100 columns. The first record must contain nonblank, unique column names. Duplicate names are checked after trimming and Unicode NFC normalization, so ambiguous headers are rejected instead of being renamed. Rows with a different field count are rejected; completely empty records are treated as blank rows of the expected width. A trailing record separator does not create an extra row.

“Missing” means an empty or whitespace-only cell. “Duplicate” means an exact complete row, case-sensitive. Type hints describe text patterns only; dates are not validated. Inspection and tool responses include column names and counts but no data-row samples. The tools do not log CSV input or make third-party network calls. Your chosen hosting and ChatGPT service still process the request. Generated CSVs contain the supplied data and use the shared runtime's download retention rules.

Spreadsheet applications can execute cells beginning with `=`, `+`, `-`, `@`, their fullwidth equivalents, or leading tab/newline characters. Export prefixes risky values and headers with an apostrophe, including after leading whitespace or controls, and reports the changed cell count. This also changes negative numeric strings. Keep these prefixes when handling untrusted data; spreadsheet behavior varies, especially after re-saving a file. Any resulting header collision is rejected. Before/after statistics describe logical cells before safety prefixes.

CSV cannot force spreadsheet column types. Although `000123` is preserved in the file, import identifier columns as **Text** in your spreadsheet to prevent its own automatic conversion.

## Development

The workspace supplies `package.json`, `src/server.js`, and the artifact store. Start this app using its package scripts. Run its tests with:

```sh
node --test test/*.test.js
```

The module exports `registerTools(server, artifacts)` and pure `parseCSV`, `inspectCSV`, `summarize`, and `cleanCSV` functions. `artifacts.add({ name, mimeType, bytes })` accepts a Node Buffer and returns `{ url, name, mimeType, bytes }`. Storage errors are hidden from tool responses.

Direct dependencies used here: `papaparse: "5.7.0"` and `zod: "^3.25.76"`. The shared server supplies the MCP SDK dependency.

## Open-source foundation

Uses [Papa Parse 5.7.0](https://github.com/mholt/PapaParse/tree/5.7.0), the established MIT-licensed CSV parser by Matthew Holt and contributors, as an exact-version dependency. This app adapts it into conservative productivity tools; it does not claim ownership of the original library. Upstream copyright and license notices are included in the workspace notices. This package is MIT licensed under the repository license.

## Shareable workflow

Share the before/after counts or a redacted example to demonstrate the cleanup. Download files contain your data: choose deliberately before sharing them. A launch demo can show a small synthetic export with leading-zero IDs, accidental whitespace and duplicates.

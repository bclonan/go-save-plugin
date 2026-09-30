# Pocket PDF

Turn scattered PDFs into one useful download: a travel pack, application bundle, or a filled form.

Pocket PDF is an MCP app built on [pdf-lib 1.17.1](https://github.com/Hopding/pdf-lib), an established MIT-licensed library. It uses the shared Node.js 22 runtime in this workspace. It is a new integration built on the upstream library, not a claim of authorship of pdf-lib.

## What it does

| Tool | Useful output |
| --- | --- |
| `inspect_pdf` | Page dimensions and rotation, document metadata, and form field names, types, and options |
| `assemble_pdf` | Merge PDFs, extract selected pages, or reorder and repeat pages into one PDF download |
| `fill_pdf_form` | Fill standard text, checkbox, dropdown, option-list, and radio fields; optionally flatten them |

Try these prompts after connecting the app and making PDF bytes available to its tools:

- “Take pages 2 and 5 from this itinerary, add my hotel confirmation, and give me a travel pack.”
- “Inspect this application, tell me what fields it has, and fill the name and travel options I provide.”
- “Extract the three pages I need and give me one PDF I can share.”

The MCP inputs accept **canonical base64 PDF data**, not attachment IDs, remote URLs, or local file paths. A host that exposes attachments only as IDs needs an attachment-to-base64 adapter. Prompt examples assume the host can supply those bytes.

## Tool examples

Page numbers are **1-based**. Document order and page order are preserved, including intentional repeated pages. Omit `pages` to copy every page.

```json
{
  "documents": [
    { "base64": "<base64 of itinerary.pdf>", "pages": [5, 2] },
    { "base64": "<base64 of hotel.pdf>" }
  ],
  "fileName": "travel-pack.pdf"
}
```

Inspect a form before filling so the exact field names and valid options are known:

```json
{ "base64": "<base64 of application.pdf>" }
```

Then call `fill_pdf_form`:

```json
{
  "base64": "<base64 of application.pdf>",
  "values": {
    "full_name": "Alex Smith",
    "agree": true,
    "travel_mode": "Train"
  },
  "flatten": true,
  "fileName": "application-complete.pdf"
}
```

Download results include an `artifact` object with `url`, `name`, `mimeType`, and byte count. Download retention and access are managed by the shared runtime. Keep the source document if you may need to edit it later.

## Limits and behavior

- Up to 5 MiB of decoded input in total, 10 input documents, and 100 pages per input document and assembled output.
- Password-protected or encrypted PDFs are rejected. No password bypass or remote fetch is implemented.
- Output names must end in `.pdf` and cannot contain directory paths.
- Standard AcroForm fields are supported. XFA, signature, button, and read-only fields cannot be filled. Choice values must match an existing option. Some fonts and non-Latin text cannot be rendered with the default PDF font.
- Flattening makes form fields noneditable. Saving a document invalidates existing digital signatures, if any.
- Page assembly does not preserve interactive forms, outlines, attachments, document metadata, or valid digital signatures. Fill and flatten a form before assembling it.
- This app does not perform OCR, page-text extraction, redaction, compression, PDF sanitization, or digital signing.
- Document bytes and field values are handled in memory by these tools and are not logged. Generated PDFs pass to the shared artifact store. Hosting and request logging policies belong to the deployment.

## Development

The domain module exports `registerTools(server, artifacts)`. The artifact adapter supplies `add({ name, mimeType, bytes })` and returns `{ url, name, mimeType, bytes }`, where the returned `bytes` is a count.

Direct exports `inspectPdf`, `assemblePdf`, and `fillPdfForm` support testing without an MCP transport. Assembly and filling return a byte array for the adapter to publish.

After installing the workspace dependencies, run the app tests from this directory:

```sh
node --test test/*.test.js
```

The suite creates real PDFs and verifies metadata, page ordering and extraction, roundtrip field values, flattening, malformed inputs, bounds, XFA rejection, and artifact publication.

## License and upstream credit

The integration is MIT licensed under the workspace license. pdf-lib is Copyright (c) 2019 Andrew Dillon, licensed under MIT. The full upstream notice is preserved in [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md). Dependencies retain their respective licenses.

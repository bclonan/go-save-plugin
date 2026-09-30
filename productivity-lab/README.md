# Everyday productivity apps for ChatGPT

Three independent MCP app MVPs by Brad Clonan. Each produces a useful file you can download and share. This bundle is staged in an isolated branch of go-save-plugin; the three named forks are created by the included publisher once run with GitHub CLI access.

| App | Result | MIT foundation |
| --- | --- | --- |
| [CSV Rescue](apps/csv-rescue/README.md) | Clean spreadsheet exports while preserving IDs; inspect missing cells and duplicates | PapaParse 5.7.0 |
| [Pocket PDF](apps/pocket-pdf/README.md) | Inspect, merge, extract, reorder and fill supported PDF forms | pdf-lib 1.17.1 |
| [Instant Slides](apps/instant-slides/README.md) | Editable PowerPoint decks from a structured outline | PptxGenJS 4.0.1 |

These are modern tool-based MCP integrations. They do not use the retired legacy ChatGPT plugin manifest. ChatGPT supplies the conversational reasoning; the servers perform deterministic document operations, with no paid AI API dependency. A ChatGPT connection and a public directory listing are separate from having source code.

See [validation and delivery status](VALIDATION.md) for checks performed and remaining blockers.

## Run an app

Install Node 22+ and clone this branch, then:

```sh
cd productivity-lab
node scripts/materialize.mjs
cd apps/csv-rescue
npm install --ignore-scripts
npm test
npm start
```

The MCP endpoint is http://localhost:3000/mcp. Use a separate PORT for each app. Start Pocket PDF and Instant Slides the same way. The materialize script copies the shared runtime into each app; the publishing script performs that copy automatically.

For a real client handshake, use the MCP Inspector: `npx @modelcontextprotocol/inspector`, choose Streamable HTTP, and connect to the endpoint. The source includes domain tests and an HTTP MCP client integration test. CI status on the branch is the source of truth; tests existing in the repository is not evidence they passed.

Dependencies are pinned directly. npm install generates package-lock.json; inspect and commit the lockfile after dependency installation. CI uploads generated lockfiles as artifacts. Fork publication installs and tests each app before publishing its generated lockfile.

## Connect to ChatGPT

Host an app behind HTTPS, set HOST=0.0.0.0 and PUBLIC_BASE_URL to its exact HTTPS origin, then connect that origin's /mcp endpoint in a ChatGPT workspace with developer-mode custom app support. Availability and workspace permissions vary. Localhost is for local clients; ChatGPT needs a reachable HTTPS server.

These MVPs are headless tools, not embedded ChatGPT widgets. Tool inputs are structured arguments. PDF input is canonical base64 bytes; this version does not automatically ingest an ordinary ChatGPT attachment. A client or upload adapter must provide the bytes. Tool results contain temporary download URLs.

The server supports an optional MCP_BEARER_TOKEN for compatible clients/gateways; it is not an OAuth implementation. Do not assume a static token is supported by every ChatGPT connection mode. Public distribution still needs your hosting, authentication/OAuth as appropriate, privacy policy, operational testing, and any applicable app review.

## Deployment behavior

- Files stay in process memory. Download links expire after 15 minutes; expired entries are removed on the next store operation. No document content is logged or sent to an external service by this code.
- A download URL is an access capability: anyone who has it can download the file until expiry. MCP_BEARER_TOKEN protects tool requests, not download URLs.
- Restarting the process invalidates download links. Run one instance or design shared artifact storage/routing before scaling.
- The store accepts at most 100 files / 64 MiB total, with a 20 MiB limit per output. Failed storage allocation returns an error rather than evicting a live file.
- The HTTP server rejects foreign Host/Origin headers, limits request bodies to 12 MiB, and applies 120 requests per minute per source IP. Set TRUST_PROXY to explicit trusted proxy addresses/subnets only if you need original client IPs behind a proxy. With no trust configuration, a proxy's clients share its quota.
- Use container memory/CPU limits and isolated workers before exposing complex PDF parsing to arbitrary public traffic. Input-size limits alone do not bound a PDF's expanded memory.
- Sample Dockerfiles expect materialized runtime files and an HTTPS PUBLIC_BASE_URL at runtime. The container itself serves HTTP behind your TLS proxy.

## Create your named forks

See [publishing instructions](docs/publishing.md). Intended repositories:

- bclonan/csv-rescue-chatgpt, fork of mholt/PapaParse
- bclonan/pocket-pdf-chatgpt, fork of Hopding/pdf-lib
- bclonan/instant-slides-chatgpt, fork of gitbrent/PptxGenJS

The publisher preserves upstream history and adds the app under chatgpt-app/ on a new chatgpt-app branch. It does not overwrite the upstream library or existing branches. The adapters currently use pinned published npm releases of their respective upstream libraries; they do not modify the library engines.

The adapters are MIT licensed. Each app includes the complete upstream license. [Provenance](UPSTREAM_PROVENANCE.json) records exact versions, license sources and observed upstream popularity.

## Launch with useful demonstrations

See [launch kit](docs/launch-kit.md) for realistic demo prompts, initial audiences and measurable launch experiments. Shareability is a design goal, not a promise of viral adoption.

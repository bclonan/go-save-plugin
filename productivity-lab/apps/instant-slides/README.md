# Instant Slides

Turn a meeting outline, project update, class plan, or short proposal into a real, editable PowerPoint. One tool creates a widescreen deck with a title slide, numbered content slides, speaker notes, and three restrained colour themes.

The server formats the outline supplied by ChatGPT or another MCP client. It does not call an AI model or invent presentation content.

## Try it

Requires Node.js 22. From the productivity workspace:

```sh
cd productivity-lab
node scripts/materialize.mjs
cd apps/instant-slides
npm install --ignore-scripts
npm test
npm start
```

In a published standalone fork, start in `chatgpt-app` and run the same install, test and start commands. The default MCP endpoint is `http://localhost:3000/mcp`; configure `PORT` to change the port. ChatGPT needs a publicly reachable HTTPS endpoint and a supported developer connector setup. Follow the workspace deployment guide for authentication, artifact URLs and hosting. The tool is named `create_presentation`.

Useful requests in a connected client:

- “Turn these project notes into a five-slide weekly update. Include decisions, risks and next steps.”
- “Make a short family trip briefing from this itinerary, with one slide per day.”
- “Create an editable deck for this workshop. Put facilitation tips in the speaker notes.”

Example tool arguments:

```json
{
  "title": "A calmer week",
  "subtitle": "A practical plan for the whole team",
  "theme": "ocean",
  "fileName": "team-weekly.pptx",
  "slides": [
    {
      "title": "Protect focused work",
      "bullets": [
        "Reserve two uninterrupted work blocks.",
        "Choose one outcome before each block.",
        "Move nonurgent questions to the shared thread."
      ],
      "notes": "Ask the team which time windows are easiest to protect."
    },
    {
      "title": "Keep progress visible",
      "bullets": [
        "Pick three priorities on Monday.",
        "Name an owner and next step for each priority.",
        "Review progress together on Friday."
      ]
    }
  ]
}
```

The result includes `slideCount` (including the title slide), `contentSlideCount`, `theme`, and an `artifact` containing its download URL, filename, MIME type and byte count. The shared server controls artifact storage and expiry. Download the file before its link expires.

## What is included

- Editable PowerPoint text and vector shapes; slides are not screenshots.
- 16:9 layout, generous margins, slide numbers, and ocean, forest or ink colours.
- Optional speaker notes on each content slide.
- In-memory generation through PptxGenJS; no Office installation, model API key, remote images or URL fetching.
- Structural tests that inspect generated OOXML for the expected slides, editable text, escaped content, notes, and absence of macros or external relationships.

## Limits

Supply 1–14 content slides; the title slide makes at most 15 in total. Each content slide takes 1–6 bullets, with up to 140 characters per bullet. Deck titles allow 90 characters, slide titles 80, subtitles 160 and notes 4,000. Long or dense text can exceed the available visual space even within those limits; the tool returns an actionable error asking you to shorten or split it.

Text wrapping uses conservative width estimates and adjusts font sizes within set bounds. Fonts, emoji, right-to-left scripts and line breaks can render differently across PowerPoint, Keynote and LibreOffice. Open the deck to check its appearance before presenting. This version does not include charts, pictures, custom branding, PDF export or slide editing.

The layout is deterministic for a given outline and theme. ZIP metadata can vary between exports, so the binary files are not promised to be identical.

## Development and provenance

`src/tools.js` exports `registerTools(server, artifacts)` for the shared MCP runtime and `createPresentation(input)` for direct use. The latter returns an in-memory Buffer plus metadata and performs no filesystem or network operations.

Runtime dependencies: `pptxgenjs@4.0.1` and `zod@^3.25.76`. Structural tests use Node's test runner and `jszip@3.10.1`.

Powered by [PptxGenJS v4.0.1](https://github.com/gitbrent/PptxGenJS/tree/v4.0.1), released under MIT. Its original copyright and permission notice are preserved in [UPSTREAM_LICENSE](UPSTREAM_LICENSE). The application is an MCP adaptation built on the published library; it does not replace the upstream project's identity or authorship.

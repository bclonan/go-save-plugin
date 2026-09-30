# Launch kit

## First audience and promise

Start with freelancers, students, assistants and small teams who repeatedly move work between chat and office documents. Position each product around a clear deliverable.

| App | One-sentence promise | First demonstration | Organic reason to share |
| --- | --- | --- | --- |
| CSV Rescue | Get a clean spreadsheet without losing your IDs. | A messy contact export with blank rows, spaces, duplicates and leading-zero IDs | Share the reusable cleaning prompt and a synthetic before/after report |
| Pocket PDF | Build the exact PDF packet you need. | Put a cover sheet first and selected supporting pages after it | The resulting application or handoff packet is useful to its recipient |
| Instant Slides | Turn your outline into a PowerPoint you can edit. | A five-slide project update with speaker notes | Colleagues can reuse and edit the deck |

## Demo prompts

CSV Rescue: "Inspect this sample CSV. Show what would change before cleaning. Keep account IDs as text, trim outer spaces, and remove exact duplicate records only after I choose that option."

Pocket PDF: "Using these PDF bytes, make a packet with the cover first and pages 2, 4 and 5 from the supporting file. Tell me the final page count." Current MVP needs a client that supplies base64 bytes; demonstrate honestly with MCP Inspector until a file-upload adapter exists.

Instant Slides: "Make an editable five-slide project update: objective, completed work, the main numbers, risks and next steps. Use a dark-blue theme and keep each slide brief."

## Seven-day validation experiment

1. Record one short screen capture per app using synthetic, non-personal data.
2. Show the input, the download and the final file opened in a standard desktop app.
3. Invite a small group of real target users to perform their own task.
4. Track successful file creation, completion time, downloads, repeat use and voluntary recommendations. Add analytics only with a documented privacy approach.
5. Fix the most common failed task before expanding feature lists.
6. Publish a reusable prompt/template alongside each demo.
7. Compare repeat use and completion rates; invest in the strongest app.

Do not buy fake engagement or use unsubstantiated productivity claims. A useful downloadable result and a smooth repeat workflow are the growth hypothesis. These are proposed experiments; no usage metrics or marketing distribution has happened yet.

## Before broad distribution

Verify the hosted MCP connection in ChatGPT; add a usable PDF upload flow; commit dependency lockfiles; set up authentication, privacy information, isolation and operational monitoring appropriate to the audience. Submit through the available app distribution process only once the actual hosted product is ready.

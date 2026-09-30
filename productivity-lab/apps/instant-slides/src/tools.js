import PptxGenJS from 'pptxgenjs';
import { z } from 'zod';

export const PRESENTATION_MIME =
  'application/vnd.openxmlformats-officedocument.presentationml.presentation';

const forbiddenControls = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\uD800-\uDFFF\uFFFE\uFFFF]/u;
const plainText = (maximum) => z.string().trim().min(1).max(maximum)
  .refine((value) => !forbiddenControls.test(value), 'Unsupported control character');

export const presentationSchema = z.object({
  title: plainText(90).describe('Presentation title, up to 90 characters.'),
  subtitle: plainText(160).optional(),
  slides: z.array(z.object({
    title: plainText(80),
    bullets: z.array(plainText(140)).min(1).max(6),
    notes: plainText(4000).optional(),
  }).strict()).min(1).max(14)
    .describe('1–14 content slides; one title slide is added automatically.'),
  theme: z.enum(['ocean', 'forest', 'ink']).default('ocean'),
  fileName: z.string().min(1).max(80)
    .regex(/^[A-Za-z0-9][A-Za-z0-9 _.-]*$/u, 'Use letters, numbers, spaces, dots, underscores or hyphens.')
    .optional(),
}).strict();

const THEMES = Object.freeze({
  ocean: { dark: '122C45', accent: '167AAB', pale: 'EAF4FA', text: '20384A', muted: '566D7D' },
  forest: { dark: '173D32', accent: '258363', pale: 'EDF7F1', text: '234438', muted: '587368' },
  ink: { dark: '242634', accent: '7357B5', pale: 'F3EFF9', text: '303144', muted: '6C6C7B' },
});

function normalizedLine(value) {
  return value.replace(/\s+/gu, ' ').trim();
}

// Deliberately conservative estimates, followed by hard line limits. These do
// not replace font rendering; see README for client/font differences.
function emWidth(character) {
  if (/\s/u.test(character)) return 0.34;
  if (/[ilI1.,'!:;|]/u.test(character)) return 0.36;
  if (/[MW@%&#]/u.test(character)) return 1.0;
  if (/[A-Z0-9]/u.test(character)) return 0.73;
  if (/[a-z]/u.test(character)) return 0.61;
  return 1.1;
}

function wrapAtWidth(value, width) {
  const words = normalizedLine(value).split(' ');
  const lines = [];
  let line = '';
  let occupied = 0;
  for (const word of words) {
    const wordWidth = Array.from(word).reduce((sum, character) => sum + emWidth(character), 0);
    if (line && occupied + 0.34 + wordWidth <= width) {
      line += ' ' + word;
      occupied += 0.34 + wordWidth;
      continue;
    }
    if (line) lines.push(line);
    line = '';
    occupied = 0;
    // Split an unusually long unbroken token instead of letting it overflow.
    for (const character of word) {
      const nextWidth = emWidth(character);
      if (line && occupied + nextWidth > width) {
        lines.push(line);
        line = '';
        occupied = 0;
      }
      line += character;
      occupied += nextWidth;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function fittedText(text, { width, height, maximum, minimum, maxLines, label }) {
  for (let fontSize = maximum; fontSize >= minimum; fontSize -= 1) {
    const lines = wrapAtWidth(text, width * 72 * 0.92 / fontSize);
    const lineSpacing = fontSize * 1.13;
    if (lines.length <= maxLines && lines.length * lineSpacing <= height * 72) {
      return { text: lines.join('\n'), fontSize, lineSpacing };
    }
  }
  throw new RangeError(label + ' is too dense for this layout. Shorten it or split it into more slides.');
}

function textBox(slide, text, geometry, formatting = {}) {
  slide.addText(text, {
    ...geometry, fontFace: 'Aptos', color: '20384A', margin: 0,
    breakLine: false, valign: 'top', fit: 'none', paraSpaceAfter: 0,
    ...formatting,
  });
}

function addFittedText(slide, text, geometry, settings, formatting = {}) {
  const fit = fittedText(text, { width: geometry.w, height: geometry.h, ...settings });
  textBox(slide, fit.text, geometry, { fontSize: fit.fontSize, lineSpacing: fit.lineSpacing, ...formatting });
}

function addFooter(slide, pptx, theme, page, total) {
  slide.addShape(pptx.ShapeType.rect, {
    x: 0.7, y: 6.91, w: 11.93, h: 0.015,
    line: { color: theme.pale, transparency: 100 }, fill: { color: theme.pale },
  });
  textBox(slide, String(page).padStart(2, '0') + ' / ' + String(total).padStart(2, '0'),
    { x: 11.2, y: 7.08, w: 1.42, h: 0.2 },
    { fontSize: 10, color: theme.muted, align: 'right' });
}

function outputName(fileName, title) {
  const base = (fileName || title).replace(/\.pptx$/iu, '')
    .normalize('NFKD').replace(/[^a-zA-Z0-9 _.-]/gu, '')
    .replace(/^[ .-]+|[ .-]+$/gu, '').replace(/\s+/gu, '-').slice(0, 70);
  return (base || 'presentation') + '.pptx';
}

/**
 * Build an editable OOXML deck in memory. No filesystem, network, or AI calls.
 * Returns a Buffer and metadata; the shared runtime handles delivery/expiry.
 */
export async function createPresentation(input) {
  const data = presentationSchema.parse(input);
  const theme = THEMES[data.theme];
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'Instant Slides';
  pptx.subject = 'Editable presentation created from the supplied outline';
  pptx.title = data.title;
  pptx.company = '';
  pptx.lang = 'en-US';
  pptx.theme = { headFontFace: 'Aptos Display', bodyFontFace: 'Aptos', lang: 'en-US' };
  const total = data.slides.length + 1;

  const cover = pptx.addSlide();
  cover.background = { color: theme.dark };
  cover.addShape(pptx.ShapeType.rect, {
    x: 0.78, y: 1.36, w: 0.7, h: 0.07,
    line: { color: theme.accent, transparency: 100 }, fill: { color: theme.accent },
  });
  addFittedText(cover, data.title, { x: 0.78, y: 1.84, w: 11.7, h: 2.5 },
    { maximum: 48, minimum: 24, maxLines: 4, label: 'Presentation title' },
    { bold: true, color: 'FFFFFF', fontFace: 'Aptos Display' });
  if (data.subtitle) {
    addFittedText(cover, data.subtitle, { x: 0.8, y: 4.75, w: 10.95, h: 1.32 },
      { maximum: 22, minimum: 17, maxLines: 4, label: 'Subtitle' },
      { color: 'DDE9F0' });
  }
  textBox(cover, data.slides.length + ' content slide' + (data.slides.length === 1 ? '' : 's'),
    { x: 0.8, y: 6.8, w: 6, h: 0.25 }, { color: 'DDE9F0', fontSize: 11 });
  textBox(cover, '01 / ' + String(total).padStart(2, '0'),
    { x: 11.2, y: 6.8, w: 1.33, h: 0.25 }, { color: 'DDE9F0', fontSize: 11, align: 'right' });

  for (const [index, content] of data.slides.entries()) {
    const slide = pptx.addSlide();
    slide.background = { color: 'FFFFFF' };
    slide.addShape(pptx.ShapeType.rect, {
      x: 0, y: 0, w: 0.15, h: 7.5,
      line: { color: theme.accent, transparency: 100 }, fill: { color: theme.accent },
    });
    textBox(slide, 'SECTION ' + String(index + 1).padStart(2, '0'),
      { x: 0.78, y: 0.46, w: 10.8, h: 0.25 },
      { fontSize: 11, bold: true, charSpacing: 1.8, color: theme.accent });
    addFittedText(slide, content.title, { x: 0.78, y: 0.94, w: 11.74, h: 1.33 },
      { maximum: 32, minimum: 22, maxLines: 3, label: 'Slide ' + (index + 1) + ' title' },
      { bold: true, color: theme.dark, fontFace: 'Aptos Display' });
    const count = content.bullets.length;
    const top = 2.55;
    const rowHeight = Math.min(1.12, 4.03 / count);
    const textHeight = rowHeight - 0.12;
    for (const [bulletIndex, bullet] of content.bullets.entries()) {
      const y = top + bulletIndex * rowHeight;
      slide.addShape(pptx.ShapeType.ellipse, {
        x: 0.85, y: y + 0.1, w: 0.085, h: 0.085,
        line: { color: theme.accent, transparency: 100 }, fill: { color: theme.accent },
      });
      addFittedText(slide, bullet, { x: 1.13, y, w: 11.19, h: textHeight },
        { maximum: count > 4 ? 21 : 24, minimum: 16, maxLines: count > 4 ? 2 : 3,
          label: 'Slide ' + (index + 1) + ', bullet ' + (bulletIndex + 1) },
        { color: theme.text });
    }
    if (content.notes) slide.addNotes(content.notes);
    addFooter(slide, pptx, theme, index + 2, total);
  }

  const bytes = await pptx.write({ outputType: 'nodebuffer', compression: true });
  return {
    bytes: Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes),
    name: outputName(data.fileName, data.title),
    mimeType: PRESENTATION_MIME,
    slideCount: total,
    contentSlideCount: data.slides.length,
    theme: data.theme,
  };
}

export function registerTools(server, artifacts) {
  server.registerTool('create_presentation', {
    title: 'Create an editable PowerPoint',
    description: 'Turn an approved outline into an editable widescreen .pptx download. '
      + 'Supply 1–14 content slides with 1–6 concise bullets each; a title slide is added. '
      + 'Supports speaker notes and ocean, forest, or ink themes. '
      + 'Does not research, invent content, fetch URLs, or send files to third parties.',
    inputSchema: presentationSchema.shape,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async (input) => {
    try {
      const presentation = await createPresentation(input);
      const { bytes, name, mimeType, ...details } = presentation;
      const artifact = await artifacts.add({ bytes, name, mimeType });
      const result = { ...details, artifact };
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
        structuredContent: result,
      };
    } catch (error) {
      if (error instanceof z.ZodError || error instanceof RangeError) {
        return { isError: true, content: [{ type: 'text', text: error.message }] };
      }
      throw error;
    }
  });
}

import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { createPresentation, presentationSchema, PRESENTATION_MIME, registerTools } from '../src/tools.js';

const outline = () => ({
  title: 'A calmer week',
  subtitle: 'A practical plan for the whole team',
  theme: 'ocean',
  slides: [
    { title: 'R&D <2026>', bullets: ['Protect two focus blocks.', 'Keep meetings purposeful.'], notes: 'Ask: What needs attention & why?' },
    { title: 'Make time visible', bullets: ['Review priorities on Monday.', 'Share progress every Friday.'] },
  ],
});

test('creates a real editable .pptx with a title slide, content and notes', async () => {
  const input = outline();
  const before = structuredClone(input);
  const result = await createPresentation(input);
  assert.deepEqual(input, before);
  assert.ok(Buffer.isBuffer(result.bytes));
  assert.equal(result.bytes.subarray(0, 2).toString(), 'PK');
  assert.equal(result.name, 'A-calmer-week.pptx');
  assert.equal(result.mimeType, PRESENTATION_MIME);
  assert.equal(result.slideCount, 3);
  assert.equal(result.contentSlideCount, 2);

  const zip = await JSZip.loadAsync(result.bytes, { checkCRC32: true });
  const slidePaths = Object.keys(zip.files).filter((path) => /^ppt\/slides\/slide\d+\.xml$/u.test(path)).sort();
  assert.equal(slidePaths.length, 3);
  const cover = await zip.file(slidePaths[0]).async('string');
  const content = await zip.file(slidePaths[1]).async('string');
  assert.match(cover, /A calmer week/u);
  assert.match(content, /R&amp;D &lt;2026&gt;/u);
  assert.match(content, /Protect two focus blocks\./u);
  assert.match(content, /<p:sp>/u, 'text is editable drawing content');
  assert.match(content, /<a:t>/u, 'text is not a flattened image');
  const noteFiles = Object.keys(zip.files).filter((path) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/u.test(path));
  const allNotes = (await Promise.all(noteFiles.map((path) => zip.file(path).async('string')))).join('\n');
  assert.match(allNotes, /What needs attention &amp; why\?/u);
  const manifest = await zip.file('[Content_Types].xml').async('string');
  assert.match(manifest, /presentationml\.presentation\.main\+xml/u);
  assert.doesNotMatch(manifest, /macroEnabled/iu);
  assert.ok(!Object.keys(zip.files).some((path) => /vbaProject|\.bin$/iu.test(path)));
  const relFiles = Object.keys(zip.files).filter((path) => path.endsWith('.rels'));
  for (const path of relFiles) {
    assert.doesNotMatch(await zip.file(path).async('string'), /TargetMode="External"/u);
  }
});

test('all themes produce editable decks and the requested theme colour', async () => {
  for (const [theme, color] of Object.entries({ ocean: '122C45', forest: '173D32', ink: '242634' })) {
    const result = await createPresentation({ ...outline(), theme, fileName: 'Team weekly.pptx' });
    assert.equal(result.name, 'Team-weekly.pptx');
    const zip = await JSZip.loadAsync(result.bytes);
    assert.match(await zip.file('ppt/slides/slide1.xml').async('string'), new RegExp(color, 'u'));
  }
});

test('maximum supported deck contains 15 slides including its title slide', async () => {
  const input = outline();
  input.slides = Array.from({ length: 14 }, (_, index) => ({
    title: 'Week ' + (index + 1),
    bullets: Array.from({ length: 6 }, (__, bullet) => 'Action ' + (bullet + 1) + ': keep the next step clear.'),
  }));
  const result = await createPresentation(input);
  assert.equal(result.slideCount, 15);
  const zip = await JSZip.loadAsync(result.bytes);
  assert.equal(Object.keys(zip.files).filter((path) => /^ppt\/slides\/slide\d+\.xml$/u.test(path)).length, 15);
});

test('schema rejects overflowing inputs and invalid filenames or XML characters', async () => {
  assert.throws(() => presentationSchema.parse({ ...outline(), slides: [] }));
  assert.throws(() => presentationSchema.parse({ ...outline(), slides: Array(15).fill(outline().slides[0]) }));
  assert.throws(() => presentationSchema.parse({ ...outline(), slides: [{ title: 'Seven', bullets: Array(7).fill('A point') }] }));
  assert.throws(() => presentationSchema.parse({ ...outline(), fileName: '../secrets.pptx' }));
  assert.throws(() => presentationSchema.parse({ ...outline(), title: 'Bad\u0000title' }));
  assert.throws(() => presentationSchema.parse({ ...outline(), title: 'Bad\uD800title' }));
  assert.throws(() => presentationSchema.parse({ ...outline(), unexpected: true }));
  const dense = { ...outline(), slides: [{ title: 'Dense', bullets: Array(6).fill('漢'.repeat(140)) }] };
  await assert.rejects(createPresentation(dense), /too dense/u);
});

test('registers a useful MCP tool and delivers bytes only through the artifact store', async () => {
  let callback;
  let config;
  const saved = [];
  const server = { registerTool(name, toolConfig, handler) {
    assert.equal(name, 'create_presentation');
    config = toolConfig;
    callback = handler;
  } };
  const artifacts = { async add(file) {
    saved.push(file);
    return { name: file.name, mimeType: file.mimeType, bytes: file.bytes.length, url: 'https://example.test/files/opaque-token' };
  } };
  registerTools(server, artifacts);
  assert.equal(config.annotations.openWorldHint, false);
  const result = await callback(outline());
  assert.equal(saved.length, 1);
  assert.ok(Buffer.isBuffer(saved[0].bytes));
  assert.equal(result.structuredContent.slideCount, 3);
  assert.equal(result.structuredContent.artifact.url, 'https://example.test/files/opaque-token');
  assert.equal(typeof result.structuredContent.artifact.bytes, 'number');
  assert.deepEqual(JSON.parse(result.content[0].text), result.structuredContent);
  const rejected = await callback({ ...outline(), slides: [] });
  assert.equal(rejected.isError, true);
  assert.equal(saved.length, 1, 'invalid input never creates an artifact');
});

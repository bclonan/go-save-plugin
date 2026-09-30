import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { PDFDocument, PDFName, PDFString, degrees } from 'pdf-lib';
import {
  inspectPdf, assemblePdf, fillPdfForm, decodePdfBase64,
  registerTools, MAX_BYTES,
} from '../src/tools.js';

const encode = bytes => Buffer.from(bytes).toString('base64');

async function makePdf(widths = [200, 300]) {
  const document = await PDFDocument.create();
  document.setTitle('Packing checklist');
  document.setAuthor('Example User');
  widths.forEach(width => document.addPage([width, 400]));
  return encode(await document.save());
}

async function makeForm() {
  const document = await PDFDocument.create();
  const page = document.addPage([600, 800]);
  const form = document.getForm();
  const name = form.createTextField('full_name');
  name.setMaxLength(50);
  name.addToPage(page, { x: 30, y: 700, width: 200, height: 20 });
  form.createButton('submit');
  form.createCheckBox('agree').addToPage(page, { x: 30, y: 650, width: 20, height: 20 });
  const dropdown = form.createDropdown('travel_mode');
  dropdown.addOptions(['Train', 'Bus']);
  dropdown.addToPage(page, { x: 30, y: 600, width: 200, height: 20 });
  const readonly = form.createTextField('reference');
  readonly.setText('REF-01');
  readonly.enableReadOnly();
  readonly.addToPage(page, { x: 30, y: 550, width: 200, height: 20 });
  return encode(await document.save());
}

test('inspection reads real document metadata, page size, and rotation', async () => {
  const document = await PDFDocument.create();
  document.setTitle('Example title');
  document.setAuthor('Example author');
  document.setCreationDate(new Date('2025-01-02T03:04:05Z'));
  document.addPage([200, 400]).setRotation(degrees(90));
  const result = await inspectPdf({ base64: encode(await document.save()) });
  assert.equal(result.pageCount, 1);
  assert.equal(result.metadata.title, 'Example title');
  assert.equal(result.metadata.author, 'Example author');
  assert.equal(result.metadata.creationDate, '2025-01-02T03:04:05.000Z');
  assert.deepEqual(result.pages[0], { number: 1, widthPoints: 200, heightPoints: 400, rotationDegrees: 90 });
  assert.equal(result.formType, 'none');
});

test('assembly merges real PDFs, extracts, reorders, and repeats pages', async () => {
  const first = await makePdf([200, 300, 400]);
  const second = await makePdf([500]);
  const result = await assemblePdf({
    documents: [{ base64: first, pages: [3, 1, 3] }, { base64: second }],
    fileName: 'travel-pack.pdf',
  });
  const roundtrip = await PDFDocument.load(result.bytes);
  assert.equal(result.fileName, 'travel-pack.pdf');
  assert.equal(result.pageCount, 4);
  assert.deepEqual(roundtrip.getPages().map(page => page.getWidth()), [400, 200, 400, 500]);
  assert.match(result.warnings.join(' '), /signatures/);
});

test('invalid and nonexistent page numbers are rejected', async () => {
  const base64 = await makePdf([200]);
  for (const pages of [[0], [-1], [2], [1.5], []]) {
    await assert.rejects(assemblePdf({ documents: [{ base64, pages }] }));
  }
});

test('strict base64 rejects URLs, paths, whitespace, and noncanonical encodings', () => {
  for (const value of ['', 'https://example.com/a.pdf', '/tmp/a.pdf', 'JVBERi0=\n', 'AAAA====', 'A===', 'JVBERi1=', 'not a pdf']) {
    assert.throws(() => decodePdfBase64(value));
  }
});

test('rejects corrupt PDFs and directory paths as output names', async () => {
  await assert.rejects(inspectPdf({ base64: encode(Buffer.from('%PDF-1.7\ntruncated')) }), /Unable to read/);
  const base64 = await makePdf();
  for (const fileName of ['../escape.pdf', '/tmp/output.pdf', 'C:\\out.pdf', 'file.txt']) {
    await assert.rejects(assemblePdf({ documents: [{ base64 }], fileName }));
  }
});

test('combined byte limit applies before loading multiple documents', async () => {
  const small = Buffer.from(await makePdf([200]), 'base64');
  const padded = Buffer.concat([small, Buffer.alloc(3 * 1024 * 1024 - small.length, 0x20)]);
  await assert.rejects(assemblePdf({
    documents: [{ base64: encode(padded) }, { base64: encode(padded) }],
  }), /combined 5 MiB/);
  assert.throws(() => decodePdfBase64(encode(Buffer.alloc(MAX_BYTES + 1))), /base64|5 MiB/);
});

test('document count and source/output page limits are enforced', async () => {
  const base64 = await makePdf([200]);
  await assert.rejects(assemblePdf({ documents: Array.from({ length: 11 }, () => ({ base64 })) }));
  await assert.rejects(assemblePdf({
    documents: [
      { base64, pages: Array(60).fill(1) },
      { base64, pages: Array(60).fill(1) },
    ],
  }), /100 pages/);
  const manyPages = await makePdf(Array(101).fill(200));
  await assert.rejects(inspectPdf({ base64: manyPages }), /100 pages/);
});

test('inspection exposes form names and options; filling survives save/reload', async () => {
  const base64 = await makeForm();
  const inspection = await inspectPdf({ base64 });
  assert.equal(inspection.formType, 'AcroForm');
  assert.deepEqual(inspection.fields.find(field => field.name === 'travel_mode').options, ['Train', 'Bus']);
  assert.equal(inspection.fields.find(field => field.name === 'reference').readOnly, true);
  const result = await fillPdfForm({
    base64, values: { full_name: 'Alex Smith', agree: true, travel_mode: 'Train' },
  });
  const document = await PDFDocument.load(result.bytes);
  const form = document.getForm();
  assert.equal(form.getTextField('full_name').getText(), 'Alex Smith');
  assert.equal(form.getCheckBox('agree').isChecked(), true);
  assert.deepEqual(form.getDropdown('travel_mode').getSelected(), ['Train']);
  assert.equal(result.updatedFields, 3);
  assert.equal(result.flattened, false);
});

test('flattening removes editable fields while preserving the page', async () => {
  const result = await fillPdfForm({
    base64: await makeForm(),
    values: { full_name: 'Alex Smith', agree: false },
    flatten: true,
  });
  const document = await PDFDocument.load(result.bytes);
  assert.equal(document.getForm().getFields().length, 0);
  assert.equal(document.getPageCount(), 1);
  assert.equal(result.flattened, true);
  assert.match(result.warnings[0], /digital signatures/);
});

test('form filling rejects unknown fields, wrong types, read-only fields, and unknown choices', async () => {
  const base64 = await makeForm();
  for (const values of [
    { missing: 'value' }, { agree: 'true' }, { full_name: true },
    { travel_mode: 'Boat' }, { reference: 'changed' }, { submit: 'go' },
    { full_name: 'x'.repeat(51) }, {},
  ]) {
    await assert.rejects(fillPdfForm({ base64, values }));
  }
});

test('XFA forms are identified and rejected for filling without silently removing XFA', async () => {
  const document = await PDFDocument.create();
  document.addPage();
  document.getForm().createTextField('name');
  document.catalog.getAcroForm().dict.set(PDFName.of('XFA'), PDFString.of('unsupported XFA payload'));
  const base64 = encode(await document.save({ updateFieldAppearances: false }));
  const inspection = await inspectPdf({ base64 });
  assert.equal(inspection.formType, 'XFA');
  assert.deepEqual(inspection.fields, []);
  await assert.rejects(fillPdfForm({ base64, values: { name: 'Alex' } }), /XFA/);
});

test('MCP publishes a downloadable artifact and returns safe structured errors', async () => {
  const tools = new Map();
  const published = [];
  registerTools({ registerTool(name, config, handler) { tools.set(name, { config, handler }); } }, {
    async add(artifact) {
      published.push(artifact);
      return { url: 'http://localhost/artifacts/example', name: artifact.name, mimeType: artifact.mimeType, bytes: artifact.bytes.length };
    },
  });
  assert.deepEqual([...tools.keys()], ['inspect_pdf', 'assemble_pdf', 'fill_pdf_form']);
  const response = await tools.get('assemble_pdf').handler({ documents: [{ base64: await makePdf([200]) }] });
  assert.equal(response.structuredContent.artifact.mimeType, 'application/pdf');
  assert.equal(response.structuredContent.artifact.name, 'assembled.pdf');
  assert.equal(published.length, 1);
  assert.equal((await PDFDocument.load(published[0].bytes)).getPageCount(), 1);
  assert.equal(JSON.parse(response.content[0].text).artifact.url, 'http://localhost/artifacts/example');
  const error = await tools.get('inspect_pdf').handler({ base64: 'PRIVATE-DATA' });
  assert.equal(error.isError, true);
  assert.ok(!JSON.stringify(error).includes('PRIVATE-DATA'));
});

test('PDFs declaring encryption are rejected by default', async () => {
  const document = await PDFDocument.create();
  document.addPage();
  document.context.trailerInfo.Encrypt = document.context.register(document.context.obj({
    Filter: 'Standard', V: 1, R: 2, Length: 40, P: -4,
  }));
  const base64 = encode(await document.save({ useObjectStreams: false }));
  await assert.rejects(inspectPdf({ base64 }), /Encrypted|encrypted/);
});

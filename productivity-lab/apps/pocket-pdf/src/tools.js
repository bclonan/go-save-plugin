import { Buffer } from 'node:buffer';
import { z } from 'zod';
import {
  PDFDocument, PDFName, PDFTextField, PDFCheckBox, PDFDropdown,
  PDFOptionList, PDFRadioGroup, PDFSignature,
} from 'pdf-lib';

export const MAX_BYTES = 5 * 1024 * 1024;
export const MAX_PAGES = 100;
export const MAX_DOCUMENTS = 10;
const MAX_BASE64_LENGTH = 4 * Math.ceil(MAX_BYTES / 3);
const pdfInput = z.string().min(1).max(MAX_BASE64_LENGTH);
const fileNameInput = z.string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9._ -]{0,95}\.pdf$/i, 'Use a PDF file name without a directory path.');
const inspectShape = { base64: pdfInput };
const assembleShape = {
  documents: z.array(z.object({
    base64: pdfInput,
    pages: z.array(z.number().int().min(1).max(MAX_PAGES)).min(1).max(MAX_PAGES).optional(),
  }).strict()).min(1).max(MAX_DOCUMENTS),
  fileName: fileNameInput.default('assembled.pdf'),
};
const fillShape = {
  base64: pdfInput,
  values: z.record(z.union([z.string().max(10000), z.boolean()]))
    .refine(value => Object.keys(value).length > 0 && Object.keys(value).length <= 100,
      'Supply between 1 and 100 field values.'),
  flatten: z.boolean().default(false),
  fileName: fileNameInput.default('filled.pdf'),
};

export class PdfInputError extends Error {
  constructor(message) { super(message); this.name = 'PdfInputError'; }
}

function parseInput(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) {
    // Do not echo document content, field values, or schema input in errors.
    throw new PdfInputError('Invalid input. Check the tool schema, PDF file name, and size limits.');
  }
  return result.data;
}

export function decodePdfBase64(value) {
  if (typeof value !== 'string' || value.length === 0 ||
      value.length > MAX_BASE64_LENGTH || value.length % 4 !== 0 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
    throw new PdfInputError('Supply canonical base64 PDF data without a data URL, whitespace, URL, or file path.');
  }
  const bytes = Buffer.from(value, 'base64');
  if (bytes.length > MAX_BYTES) throw new PdfInputError('PDF inputs exceed the combined 5 MiB limit.');
  if (bytes.toString('base64') !== value) throw new PdfInputError('Malformed base64 encoding.');
  if (!bytes.subarray(0, 1024).includes(Buffer.from('%PDF-'))) {
    throw new PdfInputError('Input does not contain a PDF header.');
  }
  return bytes;
}

async function loadPdf(bytes) {
  let document;
  try {
    // ignoreEncryption is deliberately false; password protected PDFs are rejected.
    document = await PDFDocument.load(bytes, { ignoreEncryption: false, updateMetadata: false });
  } catch {
    throw new PdfInputError('Unable to read this PDF. Encrypted, corrupt, or unsupported PDFs cannot be processed.');
  }
  if (document.isEncrypted) throw new PdfInputError('Encrypted PDFs are not supported.');
  if (document.getPageCount() > MAX_PAGES) {
    throw new PdfInputError('Each input PDF may contain at most 100 pages.');
  }
  return document;
}

function hasXfa(document) {
  return Boolean(document.catalog.getAcroForm()?.dict.has(PDFName.of('XFA')));
}

function supportedForm(document) {
  if (hasXfa(document)) throw new PdfInputError('XFA forms are not supported. Supply a standard AcroForm PDF.');
  return document.getForm();
}

function fieldType(field) {
  if (field instanceof PDFTextField) return 'text';
  if (field instanceof PDFCheckBox) return 'checkbox';
  if (field instanceof PDFDropdown) return 'dropdown';
  if (field instanceof PDFOptionList) return 'optionList';
  if (field instanceof PDFRadioGroup) return 'radio';
  if (field instanceof PDFSignature) return 'signature';
  return 'unsupported';
}

function fieldDescription(field) {
  const type = fieldType(field);
  const result = { name: field.getName(), type, readOnly: field.isReadOnly() };
  if (['dropdown', 'optionList', 'radio'].includes(type)) result.options = field.getOptions();
  return result;
}

function metadata(document) {
  const date = getter => {
    try { const value = getter(); return value && Number.isFinite(value.getTime()) ? value.toISOString() : null; }
    catch { return null; }
  };
  return {
    title: document.getTitle() ?? null,
    author: document.getAuthor() ?? null,
    subject: document.getSubject() ?? null,
    keywords: document.getKeywords() ?? null,
    creator: document.getCreator() ?? null,
    producer: document.getProducer() ?? null,
    creationDate: date(() => document.getCreationDate()),
    modificationDate: date(() => document.getModificationDate()),
  };
}

/** Inspect document structure; this does not perform text extraction or OCR. */
export async function inspectPdf(input) {
  const { base64 } = parseInput(z.object(inspectShape).strict(), input);
  const document = await loadPdf(decodePdfBase64(base64));
  const xfa = hasXfa(document);
  const fields = xfa ? [] : supportedForm(document).getFields().map(fieldDescription);
  return {
    pageCount: document.getPageCount(),
    pages: document.getPages().map((page, index) => ({
      number: index + 1, widthPoints: page.getWidth(), heightPoints: page.getHeight(),
      rotationDegrees: page.getRotation().angle,
    })),
    metadata: metadata(document),
    formType: xfa ? 'XFA' : fields.length ? 'AcroForm' : 'none',
    fields,
    warnings: xfa ? ['XFA field inspection and filling are not supported.'] : [],
  };
}

/** Copy selected pages in the exact requested order. Page numbers start at 1. */
export async function assemblePdf(input) {
  const { documents, fileName } = parseInput(z.object(assembleShape).strict(), input);
  const decoded = documents.map(item => ({ ...item, bytes: decodePdfBase64(item.base64) }));
  if (decoded.reduce((sum, item) => sum + item.bytes.length, 0) > MAX_BYTES) {
    throw new PdfInputError('PDF inputs exceed the combined 5 MiB limit.');
  }
  const loaded = [];
  let outputPageCount = 0;
  for (const item of decoded) {
    const document = await loadPdf(item.bytes);
    const pages = item.pages ?? Array.from({ length: document.getPageCount() }, (_, index) => index + 1);
    if (pages.some(page => page > document.getPageCount())) {
      throw new PdfInputError('A requested page does not exist in its input PDF.');
    }
    outputPageCount += pages.length;
    if (outputPageCount > MAX_PAGES) throw new PdfInputError('The assembled PDF may contain at most 100 pages.');
    loaded.push({ document, pages });
  }
  if (outputPageCount === 0) throw new PdfInputError('Select at least one page.');
  const output = await PDFDocument.create();
  for (const { document, pages } of loaded) {
    const copied = await output.copyPages(document, pages.map(page => page - 1));
    copied.forEach(page => output.addPage(page));
  }
  const bytes = await output.save();
  return {
    bytes, fileName, pageCount: outputPageCount,
    warnings: [
      'Page assembly does not preserve interactive forms, document outlines, attachments, metadata, or valid digital signatures. Fill and flatten forms before assembly.',
    ],
  };
}

function validateFieldValue(field, value) {
  if (field.isReadOnly()) throw new PdfInputError('A requested field is read-only.');
  const type = fieldType(field);
  if (type === 'checkbox') {
    if (typeof value !== 'boolean') throw new PdfInputError('Checkbox fields require true or false.');
    return;
  }
  if (!['text', 'dropdown', 'optionList', 'radio'].includes(type)) {
    throw new PdfInputError('A requested field has an unsupported type. Signature and button fields cannot be filled.');
  }
  if (typeof value !== 'string') throw new PdfInputError('Text and choice fields require string values.');
  if (type === 'text') {
    const maximum = field.getMaxLength();
    if (maximum !== undefined && value.length > maximum) {
      throw new PdfInputError('A text value exceeds its field maximum length.');
    }
  } else if (!field.getOptions().includes(value)) {
    throw new PdfInputError('A choice value is not one of its field options. Inspect the PDF first.');
  }
}

export async function fillPdfForm(input) {
  const { base64, values, flatten, fileName } = parseInput(z.object(fillShape).strict(), input);
  const document = await loadPdf(decodePdfBase64(base64));
  const form = supportedForm(document);
  const updates = Object.entries(values).map(([name, value]) => {
    const field = form.getFieldMaybe(name);
    if (!field) throw new PdfInputError('A requested form field does not exist. Inspect the PDF for exact names.');
    validateFieldValue(field, value);
    return { field, value };
  });
  // Validate all names and types before changing any field.
  for (const { field, value } of updates) {
    if (field instanceof PDFCheckBox) value ? field.check() : field.uncheck();
    else if (field instanceof PDFTextField) field.setText(value);
    else field.select(value);
  }
  let bytes;
  try {
    form.updateFieldAppearances();
    if (flatten) form.flatten();
    bytes = await document.save();
  } catch {
    throw new PdfInputError('Unable to render the filled form. Some fonts, characters, or field appearances are unsupported.');
  }
  return {
    bytes, fileName, pageCount: document.getPageCount(),
    updatedFields: updates.length, flattened: flatten,
    warnings: ['Saving a PDF invalidates existing digital signatures, if any.'],
  };
}

function success(result) {
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }], structuredContent: result };
}

function protect(handler) {
  return async input => {
    try { return success(await handler(input)); }
    catch (error) {
      const message = error instanceof PdfInputError ? error.message : 'Unable to process this PDF safely.';
      return { isError: true, content: [{ type: 'text', text: message }], structuredContent: { error: message } };
    }
  };
}

export function registerTools(server, artifacts) {
  server.registerTool('inspect_pdf', {
    title: 'Inspect PDF',
    description: 'Inspect PDF metadata, page sizes, and standard form field names and options. Supply canonical base64; encrypted PDFs, URLs, and file paths are unsupported. Maximum 5 MiB and 100 pages. This does not extract page text.',
    inputSchema: inspectShape,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, protect(inspectPdf));

  const publish = async result => {
    const { bytes, fileName, ...details } = result;
    const artifact = await artifacts.add({ name: fileName, mimeType: 'application/pdf', bytes });
    return { ...details, artifact };
  };
  server.registerTool('assemble_pdf', {
    title: 'Merge, extract, or reorder PDF pages',
    description: 'Create a downloadable PDF from up to 10 base64 PDFs totaling 5 MiB. Optional page numbers are 1-based, ordered, and may repeat. Each input and the output are limited to 100 pages. Forms, signatures, attachments, outlines, and metadata are not preserved.',
    inputSchema: assembleShape,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, protect(async input => publish(await assemblePdf(input))));

  server.registerTool('fill_pdf_form', {
    title: 'Fill a PDF form',
    description: 'Fill standard PDF text, checkbox, and choice fields by exact name. Inspect the PDF first. Checkbox values are booleans; other values are strings. Optional flattening makes fields noneditable. Does not sign documents. Maximum 5 MiB, 100 pages, and 100 field values. Saving invalidates existing digital signatures.',
    inputSchema: fillShape,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, protect(async input => publish(await fillPdfForm(input))));
}

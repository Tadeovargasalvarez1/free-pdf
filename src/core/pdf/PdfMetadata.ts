import { PDFDocument } from "pdf-lib";

/** Bytes accepted by the local PDF Info metadata adapter. */
export type PdfMetadataInput = ArrayBuffer | Uint8Array;

/**
 * Basic values stored in a PDF's standard Info dictionary.
 *
 * `keywords` intentionally remains the raw single Info value because PDF Info
 * stores it as one string; applications may choose their own separators.
 */
export interface PdfInfoMetadata {
  readonly title?: string;
  readonly author?: string;
  readonly subject?: string;
  readonly keywords?: string;
  readonly creator?: string;
  readonly producer?: string;
  readonly creationDate?: Date;
  readonly modificationDate?: Date;
}

/**
 * A partial Info-dictionary update. Omitted properties are preserved. An empty
 * text value writes a blank Info value; it does not remove the PDF key.
 */
export interface PdfInfoMetadataUpdate {
  readonly title?: string;
  readonly author?: string;
  readonly subject?: string;
  readonly keywords?: string;
  readonly creator?: string;
  readonly producer?: string;
  readonly creationDate?: Date;
  readonly modificationDate?: Date;
}

const TEXT_FIELDS = ["title", "author", "subject", "keywords", "creator", "producer"] as const;
const UPDATE_FIELDS = [...TEXT_FIELDS, "creationDate", "modificationDate"] as const;
const MAX_METADATA_TEXT_LENGTH = 4_096;

type TextMetadataField = (typeof TEXT_FIELDS)[number];
type MetadataUpdateField = (typeof UPDATE_FIELDS)[number];
type NormalizedMetadataUpdate = Partial<Record<TextMetadataField, string>> & {
  creationDate?: Date;
  modificationDate?: Date;
};

/**
 * Reads the standard PDF Info dictionary locally. The source bytes are copied
 * before parsing and are never written to.
 *
 * This only reads Info values. It does not inspect XMP metadata, trailer IDs,
 * embedded attachments, or historical incremental revisions.
 */
export async function readPdfMetadata(source: PdfMetadataInput): Promise<PdfInfoMetadata> {
  const document = await loadLocalPdf(source);
  return {
    title: document.getTitle(),
    author: document.getAuthor(),
    subject: document.getSubject(),
    keywords: document.getKeywords(),
    creator: document.getCreator(),
    producer: document.getProducer(),
    creationDate: cloneDate(document.getCreationDate()),
    modificationDate: cloneDate(document.getModificationDate())
  };
}

/**
 * Writes a fresh PDF copy with the requested standard Info values. Omitted
 * fields are preserved, and the input is copied before parsing.
 *
 * Important privacy limit: changing these Info entries does not guarantee the
 * removal of XMP metadata, document IDs, embedded attachments, or historical
 * revisions that another PDF producer may have retained. It is not a complete
 * metadata-sanitisation or redaction operation.
 */
export async function updatePdfMetadata(
  source: PdfMetadataInput,
  update: PdfInfoMetadataUpdate
): Promise<Uint8Array> {
  const normalizedUpdate = validateUpdate(update);
  const document = await loadLocalPdf(source);

  applyTextField(document, "title", normalizedUpdate.title);
  applyTextField(document, "author", normalizedUpdate.author);
  applyTextField(document, "subject", normalizedUpdate.subject);
  applyTextField(document, "keywords", normalizedUpdate.keywords);
  applyTextField(document, "creator", normalizedUpdate.creator);
  applyTextField(document, "producer", normalizedUpdate.producer);

  if (normalizedUpdate.creationDate) document.setCreationDate(normalizedUpdate.creationDate);
  if (normalizedUpdate.modificationDate) document.setModificationDate(normalizedUpdate.modificationDate);

  try {
    return await document.save({ useObjectStreams: true, addDefaultPage: false });
  } catch {
    throw new Error("No pudimos guardar los metadatos en una copia nueva del PDF.");
  }
}

function applyTextField(document: PDFDocument, field: TextMetadataField, value: string | undefined): void {
  if (value === undefined) return;
  switch (field) {
    case "title": document.setTitle(value); break;
    case "author": document.setAuthor(value); break;
    case "subject": document.setSubject(value); break;
    case "keywords": document.setKeywords([value]); break;
    case "creator": document.setCreator(value); break;
    case "producer": document.setProducer(value); break;
  }
}

function validateUpdate(update: PdfInfoMetadataUpdate): NormalizedMetadataUpdate {
  if (!isPlainRecord(update)) {
    throw new Error("Los metadatos deben ser un objeto con valores de texto o fechas validas.");
  }

  for (const field of Object.keys(update)) {
    if (!isMetadataUpdateField(field)) {
      throw new Error(`El campo de metadatos '${field}' no es compatible.`);
    }
  }

  const normalized: NormalizedMetadataUpdate = {};
  for (const field of TEXT_FIELDS) {
    const value = update[field];
    if (value !== undefined) normalized[field] = validateTextValue(field, value);
  }

  if (update.creationDate !== undefined) {
    normalized.creationDate = validateDateValue("creationDate", update.creationDate);
  }
  if (update.modificationDate !== undefined) {
    normalized.modificationDate = validateDateValue("modificationDate", update.modificationDate);
  }
  if (
    normalized.creationDate &&
    normalized.modificationDate &&
    normalized.creationDate.getTime() > normalized.modificationDate.getTime()
  ) {
    throw new Error("La fecha de creacion no puede ser posterior a la fecha de modificacion.");
  }

  return normalized;
}

function validateTextValue(field: TextMetadataField, value: unknown): string {
  if (typeof value !== "string") {
    throw new Error(`El campo '${field}' debe ser texto.`);
  }
  if (value.length > MAX_METADATA_TEXT_LENGTH) {
    throw new Error(`El campo '${field}' supera el limite de ${MAX_METADATA_TEXT_LENGTH} caracteres.`);
  }
  if (value.includes(String.fromCharCode(0))) {
    throw new Error(`El campo '${field}' no puede contener caracteres nulos.`);
  }
  return value;
}

function validateDateValue(field: "creationDate" | "modificationDate", value: unknown): Date {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new Error(`El campo '${field}' debe ser una fecha valida.`);
  }
  const year = value.getUTCFullYear();
  if (year < 1 || year > 9_999) {
    throw new Error(`El campo '${field}' debe estar entre los anos 1 y 9999.`);
  }
  return new Date(value.getTime());
}

async function loadLocalPdf(source: PdfMetadataInput): Promise<PDFDocument> {
  let bytes: Uint8Array;
  try {
    bytes = clonePdfBytes(source);
  } catch {
    throw new Error("No pudimos leer el archivo. Selecciona un PDF valido.");
  }

  try {
    // Avoid pdf-lib injecting a fresh Producer/ModDate merely while opening it.
    return await PDFDocument.load(bytes, { ignoreEncryption: false, updateMetadata: false });
  } catch (error) {
    if (isEncryptedPdfError(error)) {
      throw new Error("El PDF esta protegido con contrasena. Los metadatos locales solo admiten PDFs sin cifrar.");
    }
    throw new Error("No pudimos abrir este PDF. El archivo puede estar danado o no ser compatible.");
  }
}

function clonePdfBytes(source: PdfMetadataInput): Uint8Array {
  if (source instanceof Uint8Array) {
    if (source.byteLength === 0) throw new Error("empty input");
    return new Uint8Array(source);
  }
  if (source instanceof ArrayBuffer) {
    if (source.byteLength === 0) throw new Error("empty input");
    return new Uint8Array(source.slice(0));
  }
  throw new Error("invalid input");
}

function cloneDate(value: Date | undefined): Date | undefined {
  return value ? new Date(value.getTime()) : undefined;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isMetadataUpdateField(field: string): field is MetadataUpdateField {
  return (UPDATE_FIELDS as readonly string[]).includes(field);
}

function isEncryptedPdfError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /encrypt|password|contrasena/i.test(message);
}

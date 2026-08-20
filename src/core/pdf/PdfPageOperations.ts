import { PDFDocument } from "pdf-lib";

/** Bytes accepted by the local page-operation adapter. */
export type PdfPageInput = ArrayBuffer | Uint8Array;

/**
 * Converts a user-facing, one-based page expression into zero-based indexes.
 *
 * The expression accepts individual pages and inclusive ranges separated by
 * commas, for example `1,3,5-9`. The order written by the user is preserved.
 */
export function parsePageRange(expression: string, pageCount: number): number[] {
  assertPageCount(pageCount);

  if (typeof expression !== "string" || !expression.trim()) {
    throw new Error("Indica al menos una página, por ejemplo: 1,3,5-9.");
  }

  const pageIndexes: number[] = [];
  const selectedPages = new Set<number>();
  const segments = expression.split(",");

  for (const rawSegment of segments) {
    const segment = rawSegment.trim();
    if (!segment) {
      throw new Error("El rango de páginas tiene un elemento vacío. Usa un formato como 1,3,5-9.");
    }

    const match = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(segment);
    if (!match) {
      throw new Error(`El rango «${segment}» no es válido. Usa páginas como 1,3,5-9.`);
    }

    const start = parsePageNumber(match[1], segment);
    const end = match[2] === undefined ? start : parsePageNumber(match[2], segment);
    assertPageInBounds(start, pageCount);
    assertPageInBounds(end, pageCount);

    if (end < start) {
      throw new Error(`El rango «${segment}» termina antes de empezar.`);
    }

    for (let pageNumber = start; pageNumber <= end; pageNumber += 1) {
      const pageIndex = pageNumber - 1;
      if (selectedPages.has(pageIndex)) {
        throw new Error(`La página ${pageNumber} aparece más de una vez. Quita los rangos que se solapan.`);
      }
      selectedPages.add(pageIndex);
      pageIndexes.push(pageIndex);
    }
  }

  return pageIndexes;
}

/** Reads a page count locally before a merge, without sending the file away. */
export async function getPdfPageCount(sourceBytes: PdfPageInput): Promise<number> {
  const source = await loadUnencryptedPdf(sourceBytes, "este PDF");
  return allPageIndexes(source.getPageCount(), "Este PDF").length;
}

/**
 * Creates one fresh PDF by copying every page from each input, in input order.
 * Inputs are copied before loading so their buffers stay immutable.
 */
export async function mergePdfFiles(inputs: readonly PdfPageInput[]): Promise<Uint8Array> {
  if (!Array.isArray(inputs) || inputs.length < 2) {
    throw new Error("Selecciona al menos dos PDFs para unirlos.");
  }

  const output = await PDFDocument.create();
  for (const [index, input] of inputs.entries()) {
    const source = await loadUnencryptedPdf(input, `el PDF ${index + 1}`);
    const pageIndexes = allPageIndexes(source.getPageCount(), `El PDF ${index + 1}`);
    await copyPagesToNewDocument(output, source, pageIndexes);
  }

  return saveOutputPdf(output);
}

/**
 * Extracts selected zero-based page indexes from one source PDF. Use
 * `parsePageRange` or `extractRanges` when the selection came from the user.
 */
export async function extractPages(sourceBytes: PdfPageInput, pageIndexes: readonly number[]): Promise<Uint8Array> {
  const source = await loadUnencryptedPdf(sourceBytes, "este PDF");
  const validIndexes = validatePageIndexes(pageIndexes, source.getPageCount());
  return createPdfFromPages(source, validIndexes);
}

/** Extracts a new PDF from a one-based range expression such as `1,3,5-9`. */
export async function extractRanges(sourceBytes: PdfPageInput, expression: string): Promise<Uint8Array> {
  const source = await loadUnencryptedPdf(sourceBytes, "este PDF");
  const pageIndexes = parsePageRange(expression, source.getPageCount());
  return createPdfFromPages(source, pageIndexes);
}

/** Alias that reads naturally at call sites that refer to a page range. */
export const extractPagesByRange = extractRanges;

/**
 * Splits a source PDF into fresh documents containing at most `pagesPerFile`
 * pages each. The final document may contain fewer pages.
 */
export async function splitPdfByCount(sourceBytes: PdfPageInput, pagesPerFile: number): Promise<Uint8Array[]> {
  if (!Number.isSafeInteger(pagesPerFile) || pagesPerFile <= 0) {
    throw new Error("El número de páginas por archivo debe ser un número entero mayor que cero.");
  }

  const source = await loadUnencryptedPdf(sourceBytes, "este PDF");
  const pageCount = source.getPageCount();
  allPageIndexes(pageCount, "Este PDF");

  const documents: Uint8Array[] = [];
  for (let start = 0; start < pageCount; start += pagesPerFile) {
    const end = Math.min(start + pagesPerFile, pageCount);
    const pageIndexes = Array.from({ length: end - start }, (_, offset) => start + offset);
    documents.push(await createPdfFromPages(source, pageIndexes));
  }

  return documents;
}

function assertPageCount(pageCount: number): void {
  if (!Number.isSafeInteger(pageCount) || pageCount <= 0) {
    throw new Error("El PDF no contiene páginas que podamos procesar.");
  }
}

function parsePageNumber(value: string, segment: string): number {
  const pageNumber = Number(value);
  if (!Number.isSafeInteger(pageNumber)) {
    throw new Error(`El número «${segment}» no es válido.`);
  }
  return pageNumber;
}

function assertPageInBounds(pageNumber: number, pageCount: number): void {
  if (pageNumber < 1) {
    throw new Error("Las páginas empiezan en 1.");
  }
  if (pageNumber > pageCount) {
    const suffix = pageCount === 1 ? "página" : "páginas";
    throw new Error(`La página ${pageNumber} no existe. Este PDF tiene ${pageCount} ${suffix}.`);
  }
}

function validatePageIndexes(pageIndexes: readonly number[], pageCount: number): number[] {
  assertPageCount(pageCount);
  if (!Array.isArray(pageIndexes) || pageIndexes.length === 0) {
    throw new Error("Selecciona al menos una página para extraer.");
  }

  const validIndexes: number[] = [];
  const selectedPages = new Set<number>();
  for (const pageIndex of pageIndexes) {
    if (!Number.isSafeInteger(pageIndex) || pageIndex < 0 || pageIndex >= pageCount) {
      throw new Error(`La página seleccionada no existe. El PDF tiene ${pageCount} ${pageCount === 1 ? "página" : "páginas"}.`);
    }
    if (selectedPages.has(pageIndex)) {
      throw new Error(`La página ${pageIndex + 1} aparece más de una vez.`);
    }
    selectedPages.add(pageIndex);
    validIndexes.push(pageIndex);
  }
  return validIndexes;
}

function allPageIndexes(pageCount: number, subject: string): number[] {
  if (!Number.isSafeInteger(pageCount) || pageCount <= 0) {
    throw new Error(`${subject} no contiene páginas que podamos procesar.`);
  }
  return Array.from({ length: pageCount }, (_, index) => index);
}

async function createPdfFromPages(source: PDFDocument, pageIndexes: readonly number[]): Promise<Uint8Array> {
  const output = await PDFDocument.create();
  await copyPagesToNewDocument(output, source, pageIndexes);
  return saveOutputPdf(output);
}

async function copyPagesToNewDocument(output: PDFDocument, source: PDFDocument, pageIndexes: readonly number[]): Promise<void> {
  try {
    const copiedPages = await output.copyPages(source, [...pageIndexes]);
    for (const page of copiedPages) output.addPage(page);
  } catch {
    throw new Error("No pudimos copiar las páginas seleccionadas. El PDF puede usar una estructura no compatible.");
  }
}

async function loadUnencryptedPdf(input: PdfPageInput, subject: string): Promise<PDFDocument> {
  let bytes: Uint8Array;
  try {
    bytes = clonePdfBytes(input);
  } catch {
    throw new Error(`No pudimos leer ${subject}. Selecciona un archivo PDF válido.`);
  }

  try {
    return await PDFDocument.load(bytes, { ignoreEncryption: false, updateMetadata: false });
  } catch (error) {
    if (isEncryptedPdfError(error)) {
      throw new Error(`${capitalize(subject)} está protegido con contraseña. Las operaciones de páginas solo admiten PDFs sin cifrar.`);
    }
    throw new Error(`No pudimos abrir ${subject}. El archivo puede estar dañado o no ser un PDF compatible.`);
  }
}

function clonePdfBytes(input: PdfPageInput): Uint8Array {
  if (input instanceof Uint8Array) {
    if (input.byteLength === 0) throw new Error("empty input");
    return new Uint8Array(input);
  }
  if (input instanceof ArrayBuffer) {
    if (input.byteLength === 0) throw new Error("empty input");
    return new Uint8Array(input.slice(0));
  }
  throw new Error("invalid input");
}

async function saveOutputPdf(document: PDFDocument): Promise<Uint8Array> {
  try {
    return await document.save({ useObjectStreams: true, addDefaultPage: false });
  } catch {
    throw new Error("No pudimos crear el PDF resultante. Inténtalo de nuevo con un PDF compatible.");
  }
}

function isEncryptedPdfError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /encrypt|password|contrase(?:ñ|n)a/i.test(message);
}

function capitalize(value: string): string {
  return value.length > 0 ? `${value[0]?.toUpperCase()}${value.slice(1)}` : value;
}

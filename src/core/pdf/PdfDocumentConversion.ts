import type { PDFPageModel } from "@/types/pdf";
import type { PDFDocumentProxy } from "pdfjs-dist";

export type PdfDocumentFormat = "docx" | "txt" | "html" | "md";

export interface ExtractedPdfTextPage {
  pageNumber: number;
  text: string;
}

export interface PdfDocumentConversionOptions {
  format: PdfDocumentFormat;
  sourceName: string;
  includePageBreaks?: boolean;
  onProgress?: (complete: number, total: number) => void;
}

export interface PdfDocumentConversionResult {
  bytes: Uint8Array;
  name: string;
  mimeType: string;
  pageCount: number;
  format: PdfDocumentFormat;
}

interface TextContentLike {
  items: unknown[];
}

interface TextItemLike {
  str: string;
  transform?: number[];
  width?: number;
  height?: number;
}

interface PositionedTextItem {
  text: string;
  x: number;
  y: number;
}

const MIME_BY_FORMAT: Record<PdfDocumentFormat, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain;charset=utf-8",
  html: "text/html;charset=utf-8",
  md: "text/markdown;charset=utf-8"
};

/**
 * Extracts embedded PDF text and packages it into editable document formats.
 *
 * This is deliberately text-based: it does not OCR scanned pages and does not
 * promise exact Word layout reconstruction. The conversion happens completely
 * in the browser from the already-open PDF.js document.
 */
export async function convertPdfToDocument(
  document: PDFDocumentProxy,
  pages: readonly PDFPageModel[],
  options: PdfDocumentConversionOptions
): Promise<PdfDocumentConversionResult> {
  if (pages.length === 0) {
    throw new Error("No hay páginas disponibles para convertir.");
  }
  const textPages = await extractPdfTextPages(document, pages, options.onProgress);
  return createDocumentFromTextPages(textPages, options);
}

export async function extractPdfTextPages(
  document: PDFDocumentProxy,
  pages: readonly PDFPageModel[],
  onProgress?: (complete: number, total: number) => void
): Promise<ExtractedPdfTextPage[]> {
  const extracted: ExtractedPdfTextPage[] = [];
  let complete = 0;
  for (const [index, pageModel] of pages.entries()) {
    const page = await document.getPage(pageModel.sourcePageIndex + 1);
    const content = await page.getTextContent() as TextContentLike;
    extracted.push({
      pageNumber: index + 1,
      text: textItemsToLines(content.items).join("\n").trim()
    });
    complete += 1;
    onProgress?.(complete, pages.length);
  }
  return extracted;
}

export function createDocumentFromTextPages(
  pages: readonly ExtractedPdfTextPage[],
  options: Omit<PdfDocumentConversionOptions, "onProgress">
): PdfDocumentConversionResult {
  if (pages.length === 0) {
    throw new Error("No hay texto disponible para convertir.");
  }
  const hasText = pages.some((page) => page.text.trim().length > 0);
  if (!hasText) {
    throw new Error("Este PDF no contiene texto seleccionable. Si es un escaneo, primero necesita OCR.");
  }

  const includePageBreaks = options.includePageBreaks ?? true;
  const bytes = createBytesForFormat(pages, options.format, includePageBreaks, options.sourceName);
  return {
    bytes,
    name: `${baseName(options.sourceName)}-convertido.${options.format}`,
    mimeType: MIME_BY_FORMAT[options.format],
    pageCount: pages.length,
    format: options.format
  };
}

function createBytesForFormat(
  pages: readonly ExtractedPdfTextPage[],
  format: PdfDocumentFormat,
  includePageBreaks: boolean,
  sourceName: string
): Uint8Array {
  if (format === "txt") return encodeUtf8(toPlainText(pages, includePageBreaks));
  if (format === "html") return encodeUtf8(toHtmlDocument(pages, sourceName));
  if (format === "md") return encodeUtf8(toMarkdown(pages, includePageBreaks));
  return createDocx(pages, includePageBreaks, sourceName);
}

function textItemsToLines(items: readonly unknown[]): string[] {
  const textItems = items.filter(isTextItem).map((item) => ({
    text: item.str,
    x: item.transform?.[4] ?? 0,
    y: item.transform?.[5] ?? 0
  })).filter((item) => item.text.length > 0);

  if (textItems.length === 0) return [];
  const rows = new Map<number, PositionedTextItem[]>();
  for (const item of textItems) {
    const rowKey = Math.round(item.y / 3) * 3;
    const row = rows.get(rowKey) ?? [];
    row.push(item);
    rows.set(rowKey, row);
  }

  return Array.from(rows.entries())
    .sort(([a], [b]) => b - a)
    .map(([, row]) => row.sort((a, b) => a.x - b.x).map((item) => item.text).join(" ").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function isTextItem(item: unknown): item is TextItemLike {
  return Boolean(item && typeof item === "object" && "str" in item && typeof (item as TextItemLike).str === "string");
}

function toPlainText(pages: readonly ExtractedPdfTextPage[], includePageBreaks: boolean): string {
  return pages.map((page) => page.text.trim()).join(includePageBreaks ? "\n\n\f\n\n" : "\n\n").trimEnd() + "\n";
}

function toMarkdown(pages: readonly ExtractedPdfTextPage[], includePageBreaks: boolean): string {
  return pages.map((page) => `## Página ${page.pageNumber}\n\n${page.text.trim()}`).join(includePageBreaks ? "\n\n---\n\n" : "\n\n").trimEnd() + "\n";
}

function toHtmlDocument(pages: readonly ExtractedPdfTextPage[], sourceName: string): string {
  const sections = pages.map((page) => [
    `<section class="pdf-page" data-page="${page.pageNumber}">`,
    `  <h2>Página ${page.pageNumber}</h2>`,
    ...page.text.split(/\r?\n/).filter(Boolean).map((line) => `  <p>${escapeXml(line)}</p>`),
    "</section>"
  ].join("\n")).join("\n\n");
  return [
    "<!doctype html>",
    '<html lang="es">',
    "<head>",
    '  <meta charset="utf-8">',
    `  <title>${escapeXml(baseName(sourceName))}</title>`,
    '  <meta name="viewport" content="width=device-width, initial-scale=1">',
    "  <style>body{font-family:system-ui,sans-serif;line-height:1.55;margin:2rem;max-width:780px}.pdf-page{break-after:page;margin-bottom:2rem}h2{font-size:1rem;color:#555}</style>",
    "</head>",
    "<body>",
    sections,
    "</body>",
    "</html>",
    ""
  ].join("\n");
}

function createDocx(pages: readonly ExtractedPdfTextPage[], includePageBreaks: boolean, sourceName: string): Uint8Array {
  const paragraphs: string[] = [];
  pages.forEach((page, pageIndex) => {
    if (pageIndex > 0 && includePageBreaks) paragraphs.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>');
    paragraphs.push(paragraphXml(`Página ${page.pageNumber}`, "Heading1"));
    for (const line of page.text.split(/\r?\n/).filter(Boolean)) {
      paragraphs.push(paragraphXml(line));
    }
  });

  const files: ZipFileEntry[] = [
    {
      name: "[Content_Types].xml",
      content: encodeUtf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`)
    },
    {
      name: "_rels/.rels",
      content: encodeUtf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`)
    },
    {
      name: "docProps/core.xml",
      content: encodeUtf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${escapeXml(baseName(sourceName))}</dc:title>
  <dc:creator>Free PDF</dc:creator>
  <cp:lastModifiedBy>Free PDF</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:modified>
</cp:coreProperties>`)
    },
    {
      name: "docProps/app.xml",
      content: encodeUtf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Free PDF</Application>
  <Pages>${pages.length}</Pages>
</Properties>`)
    },
    {
      name: "word/document.xml",
      content: encodeUtf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${paragraphs.join("\n    ")}
    <w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>
  </w:body>
</w:document>`)
    }
  ];
  return createStoredZip(files);
}

function paragraphXml(text: string, style?: string): string {
  const styleXml = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : "";
  return `<w:p>${styleXml}<w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

interface ZipFileEntry {
  name: string;
  content: Uint8Array;
}

function createStoredZip(files: readonly ZipFileEntry[]): Uint8Array {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encodeUtf8(file.name);
    const crc = crc32(file.content);
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const local = new DataView(localHeader.buffer);
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true);
    local.setUint16(8, 0, true);
    local.setUint16(10, 0, true);
    local.setUint16(12, 0, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, file.content.length, true);
    local.setUint32(22, file.content.length, true);
    local.setUint16(26, nameBytes.length, true);
    localHeader.set(nameBytes, 30);
    localParts.push(localHeader, file.content);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const central = new DataView(centralHeader.buffer);
    central.setUint32(0, 0x02014b50, true);
    central.setUint16(4, 20, true);
    central.setUint16(6, 20, true);
    central.setUint16(8, 0x0800, true);
    central.setUint16(10, 0, true);
    central.setUint16(12, 0, true);
    central.setUint16(14, 0, true);
    central.setUint32(16, crc, true);
    central.setUint32(20, file.content.length, true);
    central.setUint32(24, file.content.length, true);
    central.setUint16(28, nameBytes.length, true);
    central.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);
    centralParts.push(centralHeader);

    offset += localHeader.length + file.content.length;
  }

  const centralOffset = offset;
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, centralOffset, true);

  return concatUint8Arrays([...localParts, ...centralParts, end]);
}

let crcTable: Uint32Array | null = null;

function crc32(bytes: Uint8Array): number {
  const table = crcTable ?? (crcTable = createCrcTable());
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = table[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createCrcTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let current = index;
    for (let bit = 0; bit < 8; bit += 1) {
      current = current & 1 ? 0xedb88320 ^ (current >>> 1) : current >>> 1;
    }
    table[index] = current >>> 0;
  }
  return table;
}

function concatUint8Arrays(parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function encodeUtf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function baseName(sourceName: string): string {
  const withoutPath = sourceName.split(/[\\/]/).pop() ?? sourceName;
  return withoutPath.replace(/\.pdf$/i, "").trim() || "documento";
}

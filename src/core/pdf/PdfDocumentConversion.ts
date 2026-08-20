import type { PDFPageModel } from "@/types/pdf";
import type { PDFDocumentProxy } from "pdfjs-dist";

export type PdfDocumentFormat = "docx" | "xlsx" | "csv" | "txt" | "html" | "md";

export interface ExtractedPdfTextPage {
  pageNumber: number;
  text: string;
  /** Best-effort table reconstruction from PDF text coordinates. */
  table?: string[][];
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
  width: number;
  height: number;
}

interface PositionedCell {
  text: string;
  x: number;
  width: number;
}

interface SpreadsheetPage {
  pageNumber: number;
  rows: string[][];
}

const MIME_BY_FORMAT: Record<PdfDocumentFormat, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv;charset=utf-8",
  txt: "text/plain;charset=utf-8",
  html: "text/html;charset=utf-8",
  md: "text/markdown;charset=utf-8"
};

/**
 * Extracts embedded PDF text and packages it into editable document formats.
 *
 * PDF is not a semantic Word/Excel format: most PDFs only expose glyphs and
 * coordinates. For spreadsheets we reconstruct rows and columns from those
 * coordinates. That works best for selectable-text tables; scanned pages still
 * require OCR before a reliable conversion is possible.
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
    const positionedItems = toPositionedTextItems(content.items);
    const rows = groupPositionedRows(positionedItems);
    const lines = rows.map(rowToLine).filter(Boolean);
    extracted.push({
      pageNumber: index + 1,
      text: lines.join("\n").trim(),
      table: rowsToTable(rows)
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
  const hasContent = pages.some((page) => page.text.trim().length > 0 || page.table?.some((row) => row.some((cell) => cell.trim())));
  if (!hasContent) {
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
  if (format === "xlsx") return createXlsx(toSpreadsheetPages(pages, includePageBreaks), sourceName);
  if (format === "csv") return encodeUtf8(`\uFEFF${toCsv(toSpreadsheetPages(pages, includePageBreaks), includePageBreaks)}`);
  if (format === "txt") return encodeUtf8(toPlainText(pages, includePageBreaks));
  if (format === "html") return encodeUtf8(toHtmlDocument(pages, sourceName));
  if (format === "md") return encodeUtf8(toMarkdown(pages, includePageBreaks));
  return createDocx(pages, includePageBreaks, sourceName);
}

function toPositionedTextItems(items: readonly unknown[]): PositionedTextItem[] {
  return items
    .filter(isTextItem)
    .map((item) => {
      const text = item.str.replace(/\s+/g, " ").trim();
      const transform = item.transform ?? [];
      const width = finiteNumber(item.width) ?? Math.max(text.length * 5, 1);
      const height = finiteNumber(item.height) ?? finiteNumber(transform[3]) ?? finiteNumber(transform[0]) ?? 10;
      return {
        text,
        x: finiteNumber(transform[4]) ?? 0,
        y: finiteNumber(transform[5]) ?? 0,
        width: Math.max(Math.abs(width), 1),
        height: Math.max(Math.abs(height), 1)
      };
    })
    .filter((item) => item.text.length > 0);
}

function groupPositionedRows(items: readonly PositionedTextItem[]): PositionedTextItem[][] {
  if (items.length === 0) return [];
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const medianHeight = median(sorted.map((item) => item.height).filter((value) => value > 0)) ?? 10;
  const tolerance = Math.max(3, Math.min(12, medianHeight * 0.58));
  const rows: Array<{ y: number; totalY: number; count: number; items: PositionedTextItem[] }> = [];

  for (const item of sorted) {
    let closestRow: typeof rows[number] | null = null;
    let closestDistance = Number.POSITIVE_INFINITY;
    for (const row of rows) {
      const distance = Math.abs(row.y - item.y);
      if (distance <= tolerance && distance < closestDistance) {
        closestRow = row;
        closestDistance = distance;
      }
    }
    if (closestRow) {
      closestRow.items.push(item);
      closestRow.totalY += item.y;
      closestRow.count += 1;
      closestRow.y = closestRow.totalY / closestRow.count;
    } else {
      rows.push({ y: item.y, totalY: item.y, count: 1, items: [item] });
    }
  }

  return rows
    .sort((a, b) => b.y - a.y)
    .map((row) => row.items.sort((a, b) => a.x - b.x));
}

function rowToLine(row: readonly PositionedTextItem[]): string {
  return row.map((item) => item.text).join(" ").replace(/\s+/g, " ").trim();
}

function rowsToTable(rows: readonly PositionedTextItem[][]): string[][] {
  const segmentedRows = rows.map(rowToCells).filter((row) => row.length > 0);
  if (segmentedRows.length === 0) return [];

  const rowsWithSeveralCells = segmentedRows.filter((row) => row.length > 1).length;
  if (rowsWithSeveralCells < 2) {
    return segmentedRows.map((row) => [row.map((cell) => cell.text).join(" ").replace(/\s+/g, " ").trim()]);
  }

  const anchors = columnAnchors(segmentedRows.flat());
  if (anchors.length <= 1) {
    return segmentedRows.map((row) => [row.map((cell) => cell.text).join(" ").replace(/\s+/g, " ").trim()]);
  }

  return segmentedRows.map((row) => {
    const output = Array.from({ length: anchors.length }, () => "");
    for (const cell of row) {
      const column = nearestAnchorIndex(anchors, cell.x);
      output[column] = output[column] ? `${output[column]} ${cell.text}` : cell.text;
    }
    return trimTrailingEmptyCells(output);
  }).filter((row) => row.some((cell) => cell.trim()));
}

function rowToCells(row: readonly PositionedTextItem[]): PositionedCell[] {
  if (row.length === 0) return [];
  const sorted = [...row].sort((a, b) => a.x - b.x);
  const medianHeight = median(sorted.map((item) => item.height)) ?? 10;
  const medianCharWidth = median(sorted.map((item) => item.width / Math.max(item.text.length, 1)).filter((value) => Number.isFinite(value) && value > 0)) ?? 5;
  const splitThreshold = Math.max(13, Math.min(48, Math.max(medianHeight * 0.95, medianCharWidth * 3.2)));
  const cells: PositionedCell[] = [];
  let current: PositionedCell | null = null;
  let currentEnd = 0;

  for (const item of sorted) {
    const gap = current ? item.x - currentEnd : 0;
    if (!current || gap > splitThreshold) {
      current = { text: item.text, x: item.x, width: item.width };
      currentEnd = item.x + item.width;
      cells.push(current);
    } else {
      current.text = appendText(current.text, item.text);
      currentEnd = Math.max(currentEnd, item.x + item.width);
      current.width = currentEnd - current.x;
    }
  }

  return cells.map((cell) => ({ ...cell, text: cell.text.trim() })).filter((cell) => cell.text.length > 0);
}

function columnAnchors(cells: readonly PositionedCell[]): number[] {
  const starts = cells.map((cell) => cell.x).filter(Number.isFinite).sort((a, b) => a - b);
  if (starts.length === 0) return [];
  const clusters: Array<{ average: number; total: number; count: number }> = [];
  const tolerance = 18;

  for (const start of starts) {
    const current = clusters.at(-1);
    if (current && Math.abs(current.average - start) <= tolerance) {
      current.total += start;
      current.count += 1;
      current.average = current.total / current.count;
    } else {
      clusters.push({ average: start, total: start, count: 1 });
    }
  }

  return clusters.map((cluster) => cluster.average);
}

function nearestAnchorIndex(anchors: readonly number[], x: number): number {
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const [index, anchor] of anchors.entries()) {
    const distance = Math.abs(anchor - x);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }
  return bestIndex;
}

function textRowsFromPage(page: ExtractedPdfTextPage): string[][] {
  return page.text.split(/\r?\n/).map((line) => [line.trim()]).filter((row) => row[0]);
}

function toSpreadsheetPages(pages: readonly ExtractedPdfTextPage[], splitPages: boolean): SpreadsheetPage[] {
  const pageRows = pages.map((page) => ({
    pageNumber: page.pageNumber,
    rows: (page.table?.length ? page.table : textRowsFromPage(page)).filter((row) => row.some((cell) => cell.trim()))
  })).filter((page) => page.rows.length > 0);

  if (splitPages || pageRows.length <= 1) return pageRows;
  return [{
    pageNumber: 1,
    rows: pageRows.flatMap((page, index) => index === 0 ? page.rows : [[], ...page.rows])
  }];
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

function toCsv(pages: readonly SpreadsheetPage[], includePageLabels: boolean): string {
  const rows: string[][] = [];
  pages.forEach((page, pageIndex) => {
    if (includePageLabels && pages.length > 1) {
      if (pageIndex > 0) rows.push([]);
      rows.push([`Página ${page.pageNumber}`]);
    }
    rows.push(...page.rows);
  });
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
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
      content: encodeUtf8(corePropertiesXml(sourceName))
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

function createXlsx(pages: readonly SpreadsheetPage[], sourceName: string): Uint8Array {
  const safePages = pages.length > 0 ? pages : [{ pageNumber: 1, rows: [[""]] }];
  const worksheetFiles = safePages.map((page, index) => ({
    name: `xl/worksheets/sheet${index + 1}.xml`,
    content: encodeUtf8(worksheetXml(page.rows))
  }));

  const files: ZipFileEntry[] = [
    {
      name: "[Content_Types].xml",
      content: encodeUtf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  ${safePages.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("\n  ")}
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`)
    },
    {
      name: "_rels/.rels",
      content: encodeUtf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`)
    },
    {
      name: "docProps/core.xml",
      content: encodeUtf8(corePropertiesXml(sourceName))
    },
    {
      name: "docProps/app.xml",
      content: encodeUtf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Free PDF</Application>
  <Worksheets>${safePages.length}</Worksheets>
</Properties>`)
    },
    {
      name: "xl/workbook.xml",
      content: encodeUtf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    ${safePages.map((page, index) => `<sheet name="${escapeXml(sheetName(page.pageNumber, index))}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("\n    ")}
  </sheets>
</workbook>`)
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      content: encodeUtf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${safePages.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join("\n  ")}
</Relationships>`)
    },
    ...worksheetFiles
  ];

  return createStoredZip(files);
}

function worksheetXml(rows: readonly string[][]): string {
  const rowXml = rows.map((row, rowIndex) => {
    const rowNumber = rowIndex + 1;
    const cells = row.map((value, columnIndex) => cellXml(value, columnIndex, rowNumber)).join("");
    return `<row r="${rowNumber}">${cells}</row>`;
  }).join("\n    ");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    ${rowXml}
  </sheetData>
</worksheet>`;
}

function cellXml(value: string, columnIndex: number, rowNumber: number): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const reference = `${columnName(columnIndex)}${rowNumber}`;
  const numeric = normalizeNumericCell(trimmed);
  if (numeric !== null) return `<c r="${reference}"><v>${numeric}</v></c>`;
  return `<c r="${reference}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
}

function paragraphXml(text: string, style?: string): string {
  const styleXml = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : "";
  return `<w:p>${styleXml}<w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

function corePropertiesXml(sourceName: string): string {
  const now = new Date().toISOString();
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${escapeXml(baseName(sourceName))}</dc:title>
  <dc:creator>Free PDF</dc:creator>
  <cp:lastModifiedBy>Free PDF</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>
</cp:coreProperties>`;
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

function normalizeNumericCell(value: string): string | null {
  let text = value.trim();
  const percent = text.endsWith("%");
  if (percent) text = text.slice(0, -1).trim();
  text = text.replace(/^(?:[$€£¥]|Bs\.?|USD|EUR)\s*/i, "").replace(/\s*(?:[$€£¥]|Bs\.?|USD|EUR)$/i, "");
  if (!/^-?\d[\d.,]*$/.test(text)) return null;

  const sign = text.startsWith("-") ? "-" : "";
  const unsigned = sign ? text.slice(1) : text;
  const hasDot = unsigned.includes(".");
  const hasComma = unsigned.includes(",");
  let normalized: string;

  if (hasDot && hasComma) {
    const lastDot = unsigned.lastIndexOf(".");
    const lastComma = unsigned.lastIndexOf(",");
    const decimalSeparator = lastDot > lastComma ? "." : ",";
    const thousandsSeparator = decimalSeparator === "." ? "," : ".";
    normalized = unsigned.replaceAll(thousandsSeparator, "").replace(decimalSeparator, ".");
  } else if (hasComma) {
    normalized = /^\d{1,3}(,\d{3})+$/.test(unsigned) ? unsigned.replaceAll(",", "") : unsigned.replace(",", ".");
  } else if (hasDot) {
    normalized = /^\d{1,3}(\.\d{3})+$/.test(unsigned) ? unsigned.replaceAll(".", "") : unsigned;
  } else {
    normalized = unsigned;
  }

  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null;
  const number = Number(`${sign}${normalized}`);
  if (!Number.isFinite(number)) return null;
  return String(percent ? number / 100 : number);
}

function columnName(index: number): string {
  let current = index + 1;
  let name = "";
  while (current > 0) {
    const remainder = (current - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    current = Math.floor((current - 1) / 26);
  }
  return name;
}

function csvCell(value: string): string {
  if (!/[",\r\n]/.test(value)) return value;
  return `"${value.replaceAll('"', '""')}"`;
}

function sheetName(pageNumber: number, index: number): string {
  return `Página ${pageNumber || index + 1}`.replace(/[\\/*?:[\]]/g, " ").slice(0, 31);
}

function appendText(current: string, next: string): string {
  if (!current) return next;
  if (/^[,.;:%)]/.test(next) || /[(¿¡]$/.test(current)) return `${current}${next}`;
  return `${current} ${next}`;
}

function trimTrailingEmptyCells(row: string[]): string[] {
  let last = row.length - 1;
  while (last > 0 && !row[last]?.trim()) last -= 1;
  return row.slice(0, last + 1);
}

function median(values: readonly number[]): number | null {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2 : sorted[middle] ?? null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
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

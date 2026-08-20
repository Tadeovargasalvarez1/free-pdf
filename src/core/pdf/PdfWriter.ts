import {
  PDFDocument,
  StandardFonts,
  degrees,
  rgb,
  type PDFPage,
  type PDFFont,
  type RGB
} from "pdf-lib";
import type { LocalAsset } from "@/core/pdf/PdfEngine";
import type {
  DrawingEditorObject,
  EditorObject,
  ImageEditorObject,
  NoteEditorObject,
  PDFProject,
  ShapeEditorObject,
  SignatureEditorObject,
  StampEditorObject,
  TextEditorObject
} from "@/types/pdf";

export interface PdfWriterOptions {
  project: PDFProject;
  sourceBytes: Uint8Array;
  assets: ReadonlyMap<string, LocalAsset>;
}

/**
 * Applies the declarative editor project to a fresh output document. The
 * source document is never mutated; only the returned bytes represent edits.
 */
export async function exportPdfProject({ project, sourceBytes, assets }: PdfWriterOptions): Promise<Uint8Array> {
  let source: PDFDocument;
  try {
    source = await PDFDocument.load(sourceBytes, { ignoreEncryption: false });
  } catch (error) {
    throw new Error(formatPdfExportError(error));
  }

  const output = await PDFDocument.create();
  const copiedPages = await output.copyPages(source, project.pages.map((page) => page.sourcePageIndex));
  for (const [index, copiedPage] of copiedPages.entries()) {
    const pageModel = project.pages[index];
    if (!pageModel) continue;
    if (pageModel.cropBox) {
      copiedPage.setCropBox(pageModel.cropBox.x, pageModel.cropBox.y, pageModel.cropBox.width, pageModel.cropBox.height);
    }
    copiedPage.setRotation(degrees(pageModel.rotation));
    output.addPage(copiedPage);
  }

  const pagesById = new Map(project.pages.map((page, index) => [page.id, output.getPage(index)]));
  const overlays = [...project.overlays]
    .filter((overlay) => !overlay.hidden)
    .sort((left, right) => left.zIndex - right.zIndex);
  const fontCache = new Map<string, PDFFont>();

  for (const overlay of overlays) {
    const page = pagesById.get(overlay.pageId);
    if (page) await drawOverlay(output, page, overlay, assets, fontCache);
  }

  applyMetadata(output, project);
  return output.save({ useObjectStreams: true, addDefaultPage: false });
}

async function drawOverlay(
  document: PDFDocument,
  page: PDFPage,
  overlay: EditorObject,
  assets: ReadonlyMap<string, LocalAsset>,
  fontCache: Map<string, PDFFont>
): Promise<void> {
  switch (overlay.type) {
    case "text": return drawText(document, page, overlay, fontCache);
    case "image": return drawImage(document, page, overlay, assets);
    case "shape": return drawShape(page, overlay);
    case "drawing": return drawDrawing(page, overlay);
    case "signature": return drawSignature(document, page, overlay, assets, fontCache);
    case "note": return drawNote(document, page, overlay, fontCache);
    case "stamp": return drawStamp(document, page, overlay, fontCache);
  }
}

async function drawText(document: PDFDocument, page: PDFPage, overlay: TextEditorObject, fontCache: Map<string, PDFFont>): Promise<void> {
  if (!overlay.text.trim()) return;
  const font = await getStandardFont(document, overlay, fontCache);
  page.drawText(overlay.text, {
    x: overlay.x,
    y: overlay.y,
    size: overlay.fontSize,
    font,
    color: hexToRgb(overlay.color),
    opacity: overlay.opacity,
    rotate: degrees(overlay.rotation),
    lineHeight: overlay.lineHeight
  });

  if (overlay.textDecoration === "underline" || overlay.textDecoration === "line-through") {
    drawTextDecoration(page, overlay, font);
  }
}

function drawTextDecoration(page: PDFPage, overlay: TextEditorObject, font: PDFFont): void {
  const lines = overlay.text.replace(/\r\n?/g, "\n").split("\n");
  const radians = overlay.rotation * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const thickness = Math.max(0.6, overlay.fontSize * 0.055);
  const verticalOffset = overlay.textDecoration === "underline"
    ? -overlay.fontSize * 0.14
    : overlay.fontSize * 0.32;
  const color = hexToRgb(overlay.color);

  for (const [index, line] of lines.entries()) {
    if (!line) continue;
    const baselineOffsetY = verticalOffset - index * overlay.lineHeight;
    const start = {
      x: overlay.x - sin * baselineOffsetY,
      y: overlay.y + cos * baselineOffsetY
    };
    const lineWidth = Math.max(0, font.widthOfTextAtSize(line, overlay.fontSize));
    const end = {
      x: start.x + cos * lineWidth,
      y: start.y + sin * lineWidth
    };
    page.drawLine({ start, end, thickness, color, opacity: overlay.opacity });
  }
}

async function drawImage(document: PDFDocument, page: PDFPage, overlay: ImageEditorObject, assets: ReadonlyMap<string, LocalAsset>): Promise<void> {
  const asset = assets.get(overlay.assetId);
  if (!asset) throw new Error("Falta una imagen local que se había añadido al documento.");
  const image = asset.mimeType === "image/jpeg"
    ? await document.embedJpg(dataUrlToBytes(asset.dataUrl))
    : await document.embedPng(dataUrlToBytes(asset.dataUrl));
  page.drawImage(image, {
    x: overlay.x,
    y: overlay.y,
    width: overlay.width,
    height: overlay.height,
    opacity: overlay.opacity,
    rotate: degrees(overlay.rotation)
  });
}

function drawShape(page: PDFPage, overlay: ShapeEditorObject): void {
  const common = {
    opacity: overlay.opacity,
    color: overlay.fillColor ? hexToRgb(overlay.fillColor) : undefined,
    borderColor: overlay.stroke ? hexToRgb(overlay.stroke.color) : undefined,
    borderWidth: overlay.stroke?.width,
    borderOpacity: overlay.opacity
  };

  if (overlay.shape === "line" || overlay.shape === "arrow") {
    const start = { x: overlay.x, y: overlay.y };
    const end = { x: overlay.x + overlay.width, y: overlay.y + overlay.height };
    const thickness = overlay.stroke?.width ?? 2;
    const color = hexToRgb(overlay.stroke?.color ?? "#2854db");
    page.drawLine({ start, end, thickness, color, opacity: overlay.opacity });
    if (overlay.shape === "arrow") {
      const angle = Math.atan2(end.y - start.y, end.x - start.x);
      const wing = Math.max(8, thickness * 4);
      for (const delta of [Math.PI * 0.78, -Math.PI * 0.78]) {
        page.drawLine({ start: end, end: { x: end.x + Math.cos(angle + delta) * wing, y: end.y + Math.sin(angle + delta) * wing }, thickness, color, opacity: overlay.opacity });
      }
    }
    return;
  }

  if (overlay.shape === "circle" || overlay.shape === "ellipse") {
    page.drawEllipse({ x: overlay.x + overlay.width / 2, y: overlay.y + overlay.height / 2, xScale: Math.abs(overlay.width / 2), yScale: Math.abs(overlay.height / 2), rotate: degrees(overlay.rotation), ...common });
    return;
  }

  page.drawRectangle({ x: overlay.x, y: overlay.y, width: overlay.width, height: overlay.height, rotate: degrees(overlay.rotation), ...common });
}

function drawDrawing(page: PDFPage, overlay: DrawingEditorObject): void {
  for (let index = 1; index < overlay.points.length; index += 1) {
    const previous = overlay.points[index - 1] ? rotateDrawingPoint(overlay, overlay.points[index - 1]) : null;
    const next = overlay.points[index] ? rotateDrawingPoint(overlay, overlay.points[index]) : null;
    if (!previous || !next) continue;
    page.drawLine({ start: previous, end: next, thickness: overlay.stroke.width, color: hexToRgb(overlay.stroke.color), opacity: overlay.opacity });
  }
}

function rotateDrawingPoint(overlay: DrawingEditorObject, point: { x: number; y: number }): { x: number; y: number } {
  const normalizedRotation = ((overlay.rotation % 360) + 360) % 360;
  if (normalizedRotation === 0) {
    return point;
  }

  const radians = normalizedRotation * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const centerX = overlay.x + overlay.width / 2;
  const centerY = overlay.y + overlay.height / 2;
  const localX = point.x - centerX;
  const localY = point.y - centerY;
  return {
    x: centerX + localX * cos - localY * sin,
    y: centerY + localX * sin + localY * cos
  };
}

async function drawSignature(document: PDFDocument, page: PDFPage, overlay: SignatureEditorObject, assets: ReadonlyMap<string, LocalAsset>, fontCache: Map<string, PDFFont>): Promise<void> {
  const signature = overlay.signature;
  if (signature.kind === "drawn") {
    for (const points of signature.strokes) {
      drawDrawing(page, { ...overlay, type: "drawing", points, stroke: signature.stroke });
    }
    return;
  }
  if (signature.kind === "image") {
    return drawImage(document, page, { ...overlay, type: "image", assetId: signature.assetId, mimeType: signature.mimeType, preserveAspectRatio: true }, assets);
  }
  page.drawText(signature.text, {
    x: overlay.x,
    y: overlay.y + overlay.height * 0.22,
    size: Math.max(12, overlay.height * 0.62),
    font: await getFont(document, "Helvetica-Oblique", fontCache),
    color: hexToRgb(signature.color),
    opacity: overlay.opacity,
    rotate: degrees(overlay.rotation)
  });
}

/** Writes a visual sticky note, not a native PDF comment/annotation. */
async function drawNote(document: PDFDocument, page: PDFPage, overlay: NoteEditorObject, fontCache: Map<string, PDFFont>): Promise<void> {
  const width = Math.max(0, overlay.width);
  const height = Math.max(0, overlay.height);
  if (width === 0 || height === 0) return;

  page.drawRectangle({
    x: overlay.x,
    y: overlay.y,
    width,
    height,
    color: hexToRgb(overlay.color),
    borderColor: hexToRgb("#d6b765"),
    borderWidth: 1,
    opacity: overlay.opacity,
    borderOpacity: overlay.opacity,
    rotate: degrees(overlay.rotation)
  });

  const font = await getFont(document, "Helvetica", fontCache);
  const padding = Math.max(7, Math.min(width, height) * 0.09);
  const fontSize = Math.max(7, Math.min(overlay.fontSize, height - padding * 2));
  const lineHeight = fontSize * 1.28;
  const maxLines = Math.max(1, Math.floor((height - padding * 2) / lineHeight));
  const lines = wrapNoteText(font, overlay.content || "Escribe una nota", fontSize, Math.max(1, width - padding * 2)).slice(0, maxLines);

  for (const [index, line] of lines.entries()) {
    const position = rotateLocalPoint(
      overlay.x,
      overlay.y,
      padding,
      height - padding - fontSize - index * lineHeight,
      overlay.rotation
    );
    page.drawText(line, {
      x: position.x,
      y: position.y,
      size: fontSize,
      font,
      color: hexToRgb(overlay.textColor),
      opacity: overlay.opacity,
      rotate: degrees(overlay.rotation),
      lineHeight
    });
  }
}

/**
 * Draws a stamp into the page content stream. This intentionally creates a
 * permanent visual appearance in the exported copy; it does not create a PDF
 * annotation, a workflow approval, or a cryptographic certificate.
 */
async function drawStamp(document: PDFDocument, page: PDFPage, overlay: StampEditorObject, fontCache: Map<string, PDFFont>): Promise<void> {
  const { stamp } = overlay;
  const label = stamp.label.trim();
  const width = Math.max(0, overlay.width);
  const height = Math.max(0, overlay.height);
  if (!label || width === 0 || height === 0) return;

  const borderWidth = Math.max(0.5, Math.min(stamp.borderWidth, Math.min(width, height) / 3));
  const rectangle = {
    x: overlay.x,
    y: overlay.y,
    width,
    height,
    rotate: degrees(overlay.rotation),
    borderColor: hexToRgb(stamp.color),
    borderWidth,
    borderOpacity: overlay.opacity
  };

  if (stamp.style === "filled" && stamp.fillColor) {
    page.drawRectangle({ ...rectangle, color: hexToRgb(stamp.fillColor), opacity: overlay.opacity });
  } else {
    page.drawRectangle(rectangle);
  }

  const font = await getFont(document, "Helvetica-Bold", fontCache);
  const horizontalPadding = Math.max(borderWidth * 2, Math.min(width * 0.12, 18));
  const verticalPadding = Math.max(borderWidth * 1.6, Math.min(height * 0.18, 14));
  const usableWidth = Math.max(1, width - horizontalPadding * 2);
  const usableHeight = Math.max(1, height - verticalPadding * 2);
  const unitWidth = Math.max(font.widthOfTextAtSize(label, 1), 0.01);
  const fontSize = Math.max(6, Math.min(usableHeight, usableWidth / unitWidth));
  const textWidth = font.widthOfTextAtSize(label, fontSize);
  const textPosition = rotateLocalPoint(
    overlay.x,
    overlay.y,
    (width - textWidth) / 2,
    (height - fontSize) / 2,
    overlay.rotation
  );

  page.drawText(label, {
    x: textPosition.x,
    y: textPosition.y,
    size: fontSize,
    font,
    color: hexToRgb(stamp.textColor),
    opacity: overlay.opacity,
    rotate: degrees(overlay.rotation)
  });
}

/** Keeps the label centred inside a rectangle PDF rotates at its lower-left origin. */
function rotateLocalPoint(
  originX: number,
  originY: number,
  localX: number,
  localY: number,
  rotation: number
): { x: number; y: number } {
  const radians = rotation * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    x: originX + localX * cos - localY * sin,
    y: originY + localX * sin + localY * cos
  };
}

function wrapNoteText(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.replace(/\r\n?/g, "\n").split("\n")) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (!line || font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        line = candidate;
      } else {
        lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

async function getStandardFont(document: PDFDocument, overlay: TextEditorObject, cache: Map<string, PDFFont>): Promise<PDFFont> {
  const name = overlay.fontWeight === "bold" && overlay.fontStyle === "italic"
    ? "Helvetica-BoldOblique"
    : overlay.fontWeight === "bold"
      ? "Helvetica-Bold"
      : overlay.fontStyle === "italic"
        ? "Helvetica-Oblique"
        : "Helvetica";
  return getFont(document, name, cache);
}

async function getFont(document: PDFDocument, name: string, cache: Map<string, PDFFont>): Promise<PDFFont> {
  const cached = cache.get(name);
  if (cached) return cached;
  const font = await document.embedFont(name === "Helvetica-Bold" ? StandardFonts.HelveticaBold : name === "Helvetica-Oblique" ? StandardFonts.HelveticaOblique : name === "Helvetica-BoldOblique" ? StandardFonts.HelveticaBoldOblique : StandardFonts.Helvetica);
  cache.set(name, font);
  return font;
}

function applyMetadata(document: PDFDocument, project: PDFProject): void {
  const { metadata } = project;
  if (metadata.title) document.setTitle(metadata.title);
  if (metadata.author) document.setAuthor(metadata.author);
  if (metadata.subject) document.setSubject(metadata.subject);
  if (metadata.keywords) document.setKeywords(metadata.keywords);
  if (metadata.creator) document.setCreator(metadata.creator);
  if (metadata.producer) document.setProducer(metadata.producer);
  if (isUsableTimestamp(metadata.createdAt)) document.setCreationDate(new Date(metadata.createdAt));
  document.setModificationDate(isUsableTimestamp(metadata.modifiedAt) ? new Date(metadata.modifiedAt) : new Date());
}

function isUsableTimestamp(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > -62_135_596_800_000 && value < 253_402_300_800_000;
}

function hexToRgb(hex: string): RGB {
  const value = hex.trim().replace("#", "");
  const expanded = value.length === 3 ? value.split("").map((character) => `${character}${character}`).join("") : value;
  if (!/^[\da-fA-F]{6}$/.test(expanded)) return rgb(0.16, 0.33, 0.86);
  const integer = Number.parseInt(expanded, 16);
  return rgb(((integer >> 16) & 255) / 255, ((integer >> 8) & 255) / 255, (integer & 255) / 255);
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const commaIndex = dataUrl.indexOf(",");
  if (commaIndex < 0) throw new Error("La imagen local tiene un formato no válido.");
  const binary = atob(dataUrl.slice(commaIndex + 1));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function formatPdfExportError(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  return /encrypted|password/i.test(message)
    ? "No podemos exportar una copia de un PDF protegido. Free PDF no intenta eliminar ni romper contraseñas."
    : "No pudimos preparar una copia editable de este PDF. El archivo puede usar una estructura no compatible.";
}

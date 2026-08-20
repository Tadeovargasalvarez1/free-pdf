import type {
  DrawingEditorObject,
  DrawingPoint,
  EditorObject,
  ImageEditorObject,
  NoteEditorObject,
  PDFPageModel,
  PDFPoint,
  ShapeEditorObject,
  SignatureEditorObject,
  StampContent,
  StampEditorObject,
  StampKind,
  TextEditorObject
} from "@/types/pdf";
import type { LocalAsset } from "@/core/pdf/PdfEngine";

interface PageBounds {
  left: number;
  bottom: number;
  width: number;
  height: number;
}

export type PageNumberPosition =
  | "top-left"
  | "top-center"
  | "top-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

export type PageNumberFormat = "number" | "page-number" | "number-of-total" | "page-number-of-total";

export interface PageNumberObjectOptions {
  pageIndex: number;
  pageCount: number;
  startNumber: number;
  position: PageNumberPosition;
  margin: number;
  fontSize: number;
  color: string;
}

export interface WatermarkObjectOptions {
  text: string;
  fontSize: number;
  color: string;
  opacity: number;
  rotation: number;
}

/** Visual defaults for the local stamp presets exposed by `createStampObject`. */
export const STAMP_PRESETS: Readonly<Record<StampKind, Omit<StampContent, "kind">>> = {
  approved: { label: "APROBADO", style: "outline", color: "#15803d", fillColor: null, textColor: "#15803d", borderWidth: 2.4 },
  reviewed: { label: "REVISADO", style: "outline", color: "#1d4ed8", fillColor: null, textColor: "#1d4ed8", borderWidth: 2.4 },
  confidential: { label: "CONFIDENCIAL", style: "outline", color: "#b91c1c", fillColor: null, textColor: "#b91c1c", borderWidth: 2.4 },
  draft: { label: "BORRADOR", style: "outline", color: "#64748b", fillColor: null, textColor: "#64748b", borderWidth: 2.4 },
  final: { label: "FINAL", style: "outline", color: "#6d28d9", fillColor: null, textColor: "#6d28d9", borderWidth: 2.4 },
  paid: { label: "PAGADO", style: "outline", color: "#047857", fillColor: null, textColor: "#047857", borderWidth: 2.4 },
  rejected: { label: "RECHAZADO", style: "outline", color: "#b91c1c", fillColor: null, textColor: "#b91c1c", borderWidth: 2.4 }
};

export function createTextObject(page: PDFPageModel, at?: PDFPoint): TextEditorObject {
  const bounds = getPageBounds(page);
  const width = Math.min(220, bounds.width * 0.52);
  const height = 62;
  const position = positionAtTopLeft(bounds, width, height, at);

  return {
    id: createId(),
    pageId: page.id,
    type: "text",
    ...position,
    width,
    height,
    rotation: 0,
    opacity: 1,
    zIndex: nextZIndex(),
    text: "Escribe aquí",
    fontFamily: "Helvetica",
    fontSize: 18,
    color: "#172033",
    fontWeight: "normal",
    fontStyle: "normal",
    textDecoration: "none",
    textAlign: "left",
    lineHeight: 22,
    letterSpacing: 0
  };
}

/**
 * Creates an ordinary editable text overlay for a page number. It is kept in
 * the same scene as other text so a user can adjust or remove it later; no
 * native page-label metadata is claimed.
 */
export function createPageNumberObject(
  page: PDFPageModel,
  format: PageNumberFormat,
  options: PageNumberObjectOptions
): TextEditorObject {
  const bounds = getPageBounds(page);
  const number = options.startNumber + options.pageIndex;
  const text = formatPageNumber(format, number, options.pageCount);
  const fontSize = clampFinite(options.fontSize, 6, 96, 11);
  const margin = clampFinite(options.margin, 0, Math.min(bounds.width, bounds.height) / 3, 28);
  const height = Math.max(fontSize * 1.35, 12);
  const width = Math.min(
    Math.max(fontSize * 1.9, estimateTextWidth(text, fontSize)),
    Math.max(fontSize * 1.9, bounds.width - margin * 2)
  );
  const isTop = options.position.startsWith("top");
  const isCenter = options.position.endsWith("center");
  const isRight = options.position.endsWith("right");
  const x = isCenter
    ? bounds.left + (bounds.width - width) / 2
    : isRight
      ? bounds.left + bounds.width - margin - width
      : bounds.left + margin;
  const y = isTop
    ? bounds.bottom + bounds.height - margin - height
    : bounds.bottom + margin;

  return {
    id: createId(),
    pageId: page.id,
    type: "text",
    x,
    y,
    width,
    height,
    rotation: 0,
    opacity: 1,
    zIndex: nextZIndex(),
    text,
    fontFamily: "Helvetica",
    fontSize,
    color: options.color,
    fontWeight: "normal",
    fontStyle: "normal",
    textDecoration: "none",
    textAlign: isCenter ? "center" : isRight ? "right" : "left",
    lineHeight: fontSize * 1.22,
    letterSpacing: 0
  };
}

/**
 * Creates a visual watermark above the original page content. It deliberately
 * does not promise a behind-content reconstruction or any document-security
 * property; the user can still edit or remove it before exporting.
 */
export function createWatermarkObject(page: PDFPageModel, options: WatermarkObjectOptions): TextEditorObject {
  const bounds = getPageBounds(page);
  const fontSize = clampFinite(options.fontSize, 12, Math.max(12, Math.min(bounds.width, bounds.height) * 0.3), 42);
  const text = options.text.trim();
  const width = Math.min(Math.max(fontSize * 2, estimateTextWidth(text, fontSize)), bounds.width * 0.82);
  const height = Math.max(fontSize * 1.35, 18);

  return {
    id: createId(),
    pageId: page.id,
    type: "text",
    x: bounds.left + (bounds.width - width) / 2,
    y: bounds.bottom + (bounds.height - height) / 2,
    width,
    height,
    rotation: Number.isFinite(options.rotation) ? options.rotation : -35,
    opacity: clampFinite(options.opacity, 0.05, 0.9, 0.22),
    zIndex: nextZIndex(),
    text,
    fontFamily: "Helvetica",
    fontSize,
    color: options.color,
    fontWeight: "bold",
    fontStyle: "normal",
    textDecoration: "none",
    textAlign: "center",
    lineHeight: fontSize * 1.2,
    letterSpacing: 0
  };
}

export function createShapeObject(page: PDFPageModel, at?: PDFPoint): ShapeEditorObject {
  const bounds = getPageBounds(page);
  const width = Math.min(170, bounds.width * 0.44);
  const height = Math.min(100, bounds.height * 0.2);
  const position = positionAtTopLeft(bounds, width, height, at);

  return {
    id: createId(),
    pageId: page.id,
    type: "shape",
    ...position,
    width,
    height,
    rotation: 0,
    opacity: 1,
    zIndex: nextZIndex(),
    shape: "rectangle",
    fillColor: "#e9efff",
    stroke: { color: "#2854db", width: 1.5, lineCap: "round", lineJoin: "round" },
    cornerRadius: 0
  };
}

/**
 * A manual highlight is an editable translucent rectangle. It never claims to
 * be a native text-markup annotation and does not alter the original text.
 */
export function createHighlightObject(page: PDFPageModel, at?: PDFPoint): ShapeEditorObject {
  const bounds = getPageBounds(page);
  const width = Math.min(220, bounds.width * 0.56);
  const height = Math.min(34, bounds.height * 0.07);
  const position = positionAtTopLeft(bounds, width, height, at);

  return {
    id: createId(),
    pageId: page.id,
    type: "shape",
    ...position,
    width,
    height,
    rotation: 0,
    opacity: 0.42,
    zIndex: nextZIndex(),
    shape: "rectangle",
    fillColor: "#facc15",
    stroke: null
  };
}

/**
 * Creates an editable sticky note that becomes visual page content only when
 * the user exports a new PDF copy.
 */
export function createNoteObject(page: PDFPageModel, at?: PDFPoint): NoteEditorObject {
  const bounds = getPageBounds(page);
  const width = Math.min(190, bounds.width * 0.48);
  const height = Math.min(128, bounds.height * 0.28);
  const position = positionAtTopLeft(bounds, width, height, at);

  return {
    id: createId(),
    pageId: page.id,
    type: "note",
    ...position,
    width,
    height,
    rotation: 0,
    opacity: 1,
    zIndex: nextZIndex(),
    content: "Escribe una nota",
    color: "#fef3c7",
    textColor: "#713f12",
    fontSize: 12
  };
}

/**
 * Creates a local, editable visual stamp. The stamp data is deliberately
 * declarative so a page renderer can draw its border, colours, and label from
 * the project model before it is flattened into an exported PDF.
 */
export function createStampObject(page: PDFPageModel, kind: StampKind, at?: PDFPoint): StampEditorObject {
  const bounds = getPageBounds(page);
  const width = Math.min(230, bounds.width * 0.58);
  const height = Math.min(78, bounds.height * 0.18);
  const position = positionAtTopLeft(bounds, width, height, at);
  const preset = STAMP_PRESETS[kind];
  const stamp: StampContent = { kind, ...preset };

  return {
    id: createId(),
    pageId: page.id,
    type: "stamp",
    ...position,
    width,
    height,
    rotation: -12,
    opacity: 0.9,
    zIndex: nextZIndex(),
    stamp,
    // The generic overlay layer can present this as text until it gains a
    // stamp-specific renderer. Export always uses the richer `stamp` payload.
    signature: { kind: "typed", text: stamp.label, fontFamily: "Helvetica", color: stamp.textColor }
  };
}

export function createImageObject(page: PDFPageModel, asset: LocalAsset): ImageEditorObject {
  const bounds = getPageBounds(page);
  const maxWidth = Math.min(260, bounds.width * 0.52);
  const width = Math.max(48, Math.min(maxWidth, asset.width));
  const height = Math.max(36, width * (asset.height / asset.width));
  const position = positionAtTopLeft(bounds, width, height);

  return {
    id: createId(),
    pageId: page.id,
    type: "image",
    ...position,
    width,
    height,
    rotation: 0,
    opacity: 1,
    zIndex: nextZIndex(),
    assetId: asset.id,
    mimeType: asset.mimeType,
    preserveAspectRatio: true
  };
}

export function createSignatureImageObject(page: PDFPageModel, asset: LocalAsset): SignatureEditorObject {
  const bounds = getPageBounds(page);
  const maxWidth = Math.min(190, bounds.width * 0.48);
  const width = Math.max(48, Math.min(maxWidth, asset.width));
  const height = Math.max(28, width * (asset.height / asset.width));
  const position = positionAtTopLeft(bounds, width, height);

  return {
    id: createId(),
    pageId: page.id,
    type: "signature",
    ...position,
    width,
    height,
    rotation: 0,
    opacity: 1,
    zIndex: nextZIndex(),
    signature: {
      kind: "image",
      assetId: asset.id,
      mimeType: asset.mimeType
    }
  };
}

export function createDrawingObject(pageId: string, points: DrawingPoint[], color = "#2854db", width = 2.5): DrawingEditorObject | null {
  if (points.length < 2) {
    return null;
  }
  const bounds = boundsForPoints(points);
  return {
    id: createId(),
    pageId,
    type: "drawing",
    ...bounds,
    rotation: 0,
    opacity: 1,
    zIndex: nextZIndex(),
    points,
    stroke: { color, width, lineCap: "round", lineJoin: "round" }
  };
}

export interface DrawnSignatureDraft {
  kind: "drawn";
  strokes: Array<Array<{ x: number; y: number }>>;
  color: string;
}

export interface TypedSignatureDraft {
  kind: "typed";
  text: string;
  color: string;
}

export type SignatureDraft = DrawnSignatureDraft | TypedSignatureDraft;

export function createSignatureObject(page: PDFPageModel, draft: SignatureDraft): SignatureEditorObject {
  const bounds = getPageBounds(page);
  const width = Math.min(190, bounds.width * 0.48);
  const height = Math.min(80, bounds.height * 0.18);
  const position = positionAtTopLeft(bounds, width, height);

  if (draft.kind === "typed") {
    return {
      id: createId(),
      pageId: page.id,
      type: "signature",
      ...position,
      width,
      height,
      rotation: 0,
      opacity: 1,
      zIndex: nextZIndex(),
      signature: { kind: "typed", text: draft.text, fontFamily: "cursive", color: draft.color }
    };
  }

  const strokes = draft.strokes.map((stroke) => stroke.map((point) => ({
    x: position.x + point.x * width,
    y: position.y + (1 - point.y) * height
  })));
  return {
    id: createId(),
    pageId: page.id,
    type: "signature",
    ...position,
    width,
    height,
    rotation: 0,
    opacity: 1,
    zIndex: nextZIndex(),
    signature: {
      kind: "drawn",
      strokes,
      stroke: { color: draft.color, width: 2.2, lineCap: "round", lineJoin: "round" }
    }
  };
}

export function getPageBounds(page: PDFPageModel): PageBounds {
  return {
    left: page.cropBox?.x ?? 0,
    bottom: page.cropBox?.y ?? 0,
    width: page.cropBox?.width ?? page.size.width,
    height: page.cropBox?.height ?? page.size.height
  };
}

export function boundsForPoints(points: readonly PDFPoint[]): { x: number; y: number; width: number; height: number } {
  const [first] = points;
  if (!first) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  let minX = first.x;
  let minY = first.y;
  let maxX = first.x;
  let maxY = first.y;
  for (const point of points.slice(1)) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function cloneEditorObject(object: EditorObject, pageId: string): EditorObject {
  return { ...object, id: createId(), pageId };
}

function positionAtTopLeft(bounds: PageBounds, width: number, height: number, at?: PDFPoint): { x: number; y: number } {
  const desiredX = at?.x ?? bounds.left + (bounds.width - width) / 2;
  const desiredTop = at?.y ?? bounds.bottom + (bounds.height + height) / 2;
  return {
    x: clamp(desiredX, bounds.left, bounds.left + bounds.width - width),
    y: clamp(desiredTop - height, bounds.bottom, bounds.bottom + bounds.height - height)
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clampFinite(value: number, min: number, max: number, fallback: number): number {
  return Number.isFinite(value) ? clamp(value, min, max) : fallback;
}

function estimateTextWidth(text: string, fontSize: number): number {
  return Math.max(1, Array.from(text).length) * fontSize * 0.59;
}

function formatPageNumber(format: PageNumberFormat, number: number, pageCount: number): string {
  switch (format) {
    case "page-number": return `Página ${number}`;
    case "number-of-total": return `${number} / ${pageCount}`;
    case "page-number-of-total": return `Página ${number} de ${pageCount}`;
    default: return String(number);
  }
}

function createId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `free-pdf-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function nextZIndex(): number {
  return Date.now();
}

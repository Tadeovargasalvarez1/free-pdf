import { GlobalWorkerOptions, getDocument, type PDFDocumentProxy } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { PDFMetadata, PDFPageModel, PDFPageRotation, PDFProject } from "@/types/pdf";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export interface LocalAsset {
  id: string;
  name: string;
  mimeType: "image/png" | "image/jpeg";
  dataUrl: string;
  width: number;
  height: number;
}

export interface OpenedPdf {
  sourceBytes: Uint8Array;
  document: PDFDocumentProxy;
  project: PDFProject;
}

export interface RenderOptions {
  zoom: number;
  devicePixelRatio?: number;
}

export interface RenderResult {
  width: number;
  height: number;
}

export interface ExportOptions {
  project: PDFProject;
  sourceBytes: Uint8Array;
  assets: ReadonlyMap<string, LocalAsset>;
}

const MAX_FILE_SIZE = 250 * 1024 * 1024;

/** Browser-facing PDF adapter: rendering is kept separate from the lazy writer. */
export class BrowserPdfEngine {
  public async open(file: File): Promise<OpenedPdf> {
    if (file.size > MAX_FILE_SIZE) {
      throw new Error("Este PDF supera los 250 MB. Ábrelo en una versión de escritorio o elige un archivo más pequeño.");
    }

    const sourceBytes = new Uint8Array(await file.arrayBuffer());
    let document: PDFDocumentProxy;
    try {
      document = await getDocument({ data: sourceBytes.slice() }).promise;
    } catch (error) {
      throw new Error(formatPdfOpenError(error));
    }

    const [pages, sourceMetadata] = await Promise.all([
      this.createPageModels(document),
      document.getMetadata().catch(() => null)
    ]);
    const createdAt = Date.now();
    return {
      sourceBytes,
      document,
      project: {
        id: createId(),
        source: {
          id: createId(),
          name: sanitizeFileName(file.name),
          mimeType: "application/pdf",
          byteLength: sourceBytes.byteLength,
          fingerprint: document.fingerprints[0] ?? undefined
        },
        pages,
        overlays: [],
        metadata: toProjectMetadata(sourceMetadata?.info),
        history: { undoDepth: 0, redoDepth: 0, capacity: 100 },
        createdAt,
        updatedAt: createdAt
      }
    };
  }

  public async renderPage(document: PDFDocumentProxy, pageModel: PDFPageModel, canvas: HTMLCanvasElement, options: RenderOptions): Promise<RenderResult> {
    const page = await document.getPage(pageModel.sourcePageIndex + 1);
    const viewport = page.getViewport({ scale: options.zoom, rotation: pageModel.rotation });
    const dpr = Math.max(1, options.devicePixelRatio ?? window.devicePixelRatio ?? 1);
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Tu navegador no pudo crear un lienzo para renderizar este PDF.");

    const cropBounds = pageModel.cropBox ? getViewportCropBounds(viewport, pageModel.cropBox) : null;
    const isCropped = cropBounds && !sameViewportBounds(cropBounds, viewport.width, viewport.height);
    const visibleWidth = cropBounds?.width ?? viewport.width;
    const visibleHeight = cropBounds?.height ?? viewport.height;
    const width = Math.max(1, Math.ceil(visibleWidth * dpr));
    const height = Math.max(1, Math.ceil(visibleHeight * dpr));

    canvas.width = width;
    canvas.height = height;
    canvas.style.width = `${visibleWidth}px`;
    canvas.style.height = `${visibleHeight}px`;
    context.save();
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.restore();

    if (!isCropped || !cropBounds) {
      await page.render({ canvas, viewport, transform: dpr === 1 ? undefined : [dpr, 0, 0, dpr, 0, 0] }).promise;
      return { width: visibleWidth, height: visibleHeight };
    }

    const fullCanvas = globalThis.document.createElement("canvas");
    fullCanvas.width = Math.max(1, Math.ceil(viewport.width * dpr));
    fullCanvas.height = Math.max(1, Math.ceil(viewport.height * dpr));
    await page.render({ canvas: fullCanvas, viewport, transform: dpr === 1 ? undefined : [dpr, 0, 0, dpr, 0, 0] }).promise;
    context.drawImage(
      fullCanvas,
      Math.floor(cropBounds.x * dpr),
      Math.floor(cropBounds.y * dpr),
      Math.ceil(cropBounds.width * dpr),
      Math.ceil(cropBounds.height * dpr),
      0,
      0,
      width,
      height
    );
    return { width: visibleWidth, height: visibleHeight };
  }

  /** Loads pdf-lib only when the user asks to export a new document. */
  public async export(options: ExportOptions): Promise<Uint8Array> {
    const { exportPdfProject } = await import("./PdfWriter");
    return exportPdfProject(options);
  }

  private async createPageModels(document: PDFDocumentProxy): Promise<PDFPageModel[]> {
    return Promise.all(Array.from({ length: document.numPages }, async (_, index) => {
      const page = await document.getPage(index + 1);
      const [left, bottom, right, top] = page.view;
      const width = right - left;
      const height = top - bottom;
      if (width <= 0 || height <= 0) throw new Error(`La página ${index + 1} tiene dimensiones no compatibles.`);
      return {
        id: createId(),
        sourcePageIndex: index,
        size: { width, height },
        cropBox: { x: left, y: bottom, width, height },
        rotation: toPageRotation(page.rotate),
        label: String(index + 1)
      };
    }));
  }
}

function getViewportCropBounds(
  viewport: { convertToViewportPoint(x: number, y: number): number[] },
  cropBox: NonNullable<PDFPageModel["cropBox"]>
): { x: number; y: number; width: number; height: number } {
  const points = [
    viewport.convertToViewportPoint(cropBox.x, cropBox.y),
    viewport.convertToViewportPoint(cropBox.x + cropBox.width, cropBox.y),
    viewport.convertToViewportPoint(cropBox.x, cropBox.y + cropBox.height),
    viewport.convertToViewportPoint(cropBox.x + cropBox.width, cropBox.y + cropBox.height)
  ];
  const xs = points.map(([x]) => x ?? 0);
  const ys = points.map(([, y]) => y ?? 0);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  const right = Math.max(...xs);
  const bottom = Math.max(...ys);
  return { x: left, y: top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
}

function sameViewportBounds(bounds: { x: number; y: number; width: number; height: number }, width: number, height: number): boolean {
  const epsilon = 0.01;
  return Math.abs(bounds.x) < epsilon
    && Math.abs(bounds.y) < epsilon
    && Math.abs(bounds.width - width) < epsilon
    && Math.abs(bounds.height - height) < epsilon;
}

/** Maps PDF.js Info values into the serializable project model without trusting arbitrary metadata. */
function toProjectMetadata(info: unknown): PDFMetadata {
  if (!info || typeof info !== "object") return {};
  const values = info as Record<string, unknown>;
  const title = readInfoString(values, "Title");
  const author = readInfoString(values, "Author");
  const subject = readInfoString(values, "Subject");
  const creator = readInfoString(values, "Creator");
  const producer = readInfoString(values, "Producer");
  const rawKeywords = readInfoString(values, "Keywords");
  const keywords = rawKeywords?.split(/[,;]+/).map((keyword) => keyword.trim()).filter(Boolean);

  return {
    ...(title ? { title } : {}),
    ...(author ? { author } : {}),
    ...(subject ? { subject } : {}),
    ...(keywords?.length ? { keywords } : {}),
    ...(creator ? { creator } : {}),
    ...(producer ? { producer } : {})
  };
}

function readInfoString(info: Record<string, unknown>, key: string): string | undefined {
  const value = info[key];
  if (typeof value !== "string") return undefined;
  const normalized = value.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return normalized.slice(0, 4_096) || undefined;
}

export async function createLocalImageAsset(file: File): Promise<LocalAsset> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    throw new Error("Elige una imagen PNG, JPG o WebP.");
  }

  const image = await loadImage(file);
  const keepJpeg = file.type === "image/jpeg";
  return {
    id: createId(),
    name: sanitizeFileName(file.name),
    mimeType: keepJpeg ? "image/jpeg" : "image/png",
    dataUrl: keepJpeg ? await readAsDataUrl(file) : imageToPng(image),
    width: image.naturalWidth,
    height: image.naturalHeight
  };
}

function toPageRotation(rotation: number): PDFPageRotation {
  const normalized = ((rotation % 360) + 360) % 360;
  return normalized === 90 || normalized === 180 || normalized === 270 ? normalized : 0;
}

function createId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `free-pdf-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function sanitizeFileName(fileName: string): string {
  const cleaned = fileName.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").trim();
  return cleaned || "documento.pdf";
}

function formatPdfOpenError(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (/password/i.test(message) || /PasswordException/i.test(String(error))) {
    return "Este documento está protegido con contraseña. La apertura de PDFs protegidos se añadirá cuando el flujo pueda hacerlo de forma fiable y local.";
  }
  return "No pudimos abrir este PDF. El archivo podría estar dañado, usar una característica no compatible o estar protegido.";
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    image.onload = () => { URL.revokeObjectURL(objectUrl); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error("No pudimos leer esa imagen.")); };
    image.src = objectUrl;
  });
}

function imageToPng(image: HTMLImageElement): string {
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Tu navegador no pudo preparar esta imagen.");
  context.drawImage(image, 0, 0);
  return canvas.toDataURL("image/png");
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("No pudimos leer esa imagen."));
    reader.onerror = () => reject(new Error("No pudimos leer esa imagen."));
    reader.readAsDataURL(file);
  });
}

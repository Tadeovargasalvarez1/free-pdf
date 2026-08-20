import { AlertTriangle, Download, FileImage, LoaderCircle, ShieldCheck, X } from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { type FormEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import { downloadBlob } from "@/core/files/download";
import { BrowserPdfEngine } from "@/core/pdf/PdfEngine";
import { parsePageRange } from "@/core/pdf/PdfPageOperations";
import type { PDFPageModel } from "@/types/pdf";
import "@/styles/pdf-to-image.css";

export interface PdfToImageDialogProps {
  /** PDF.js document already opened by the editor; no file is re-uploaded or re-read. */
  document: PDFDocumentProxy;
  /** Current visual page order, including any local rotation and CropBox edits. */
  pages: readonly PDFPageModel[];
  activePageId: string | null;
  onClose: () => void;
  /** Optional user-facing completion message after local downloads begin. */
  onComplete?: (message: string) => void;
}

type PageSelectionMode = "current" | "all" | "range";
type RenderScale = 1 | 2;

interface SelectedPage {
  page: PDFPageModel;
  visualPageNumber: number;
}

/**
 * Exports rendered PDF pages as standalone local PNG files. It uses the same
 * BrowserPdfEngine renderer as the editor, so visual rotations and CropBox
 * changes are reflected in the image. This is raster export only: it does not
 * perform OCR, Word conversion, or remote processing.
 */
export function PdfToImageDialog({ document: pdfDocument, pages, activePageId, onClose, onComplete }: PdfToImageDialogProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const firstRadioRef = useRef<HTMLInputElement>(null);
  const cancelledRef = useRef(false);
  const [selectionMode, setSelectionMode] = useState<PageSelectionMode>("current");
  const [rangeExpression, setRangeExpression] = useState("");
  const [scale, setScale] = useState<RenderScale>(1);
  const [isWorking, setIsWorking] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [progress, setProgress] = useState<{ complete: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();
  const descriptionId = useId();
  const rangeId = useId();
  const rangeHelpId = useId();
  const qualityId = useId();

  const selectionPreview = useMemo(
    () => resolveSelectedPages(selectionMode, rangeExpression, pages, activePageId),
    [activePageId, pages, rangeExpression, selectionMode]
  );
  const isMultiple = selectionPreview.isValid && selectionPreview.pages.length > 1;
  const activePageNumber = activePageId ? pages.findIndex((page) => page.id === activePageId) + 1 : 0;

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusFrame = window.requestAnimationFrame(() => firstRadioRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isWorking) {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = getFocusableElements(dialogRef.current);
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", onKeyDown);
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [isWorking, onClose]);

  const startExport = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isWorking) return;
    if (!selectionPreview.isValid) {
      setError(selectionPreview.message);
      return;
    }

    setError(null);
    setProgress({ complete: 0, total: selectionPreview.pages.length });
    setIsWorking(true);
    setIsCancelling(false);
    cancelledRef.current = false;
    const engine = new BrowserPdfEngine();
    let completed = 0;

    try {
      for (const selected of selectionPreview.pages) {
        if (cancelledRef.current) break;
        const canvas = globalThis.document.createElement("canvas");
        try {
          await engine.renderPage(pdfDocument, selected.page, canvas, { zoom: scale, devicePixelRatio: 1 });
          if (cancelledRef.current) break;
          const blob = await canvasToPngBlob(canvas);
          if (cancelledRef.current) break;
          const bytes = new Uint8Array(await blob.arrayBuffer());
          if (cancelledRef.current) break;
          downloadBlob(bytes, pngFileName(selected.visualPageNumber, selectionPreview.pages.length), "image/png");
          completed += 1;
          setProgress({ complete: completed, total: selectionPreview.pages.length });
        } finally {
          // Release the largest local bitmap before rendering the next page.
          canvas.width = 1;
          canvas.height = 1;
        }
      }

      if (cancelledRef.current) {
        onComplete?.(completed > 0
          ? `Exportación cancelada. Se descargaron ${completed} ${pngLabel(completed)}.`
          : "Exportación cancelada antes de descargar imágenes.");
      } else {
        onComplete?.(`Se descargaron ${completed} ${pngLabel(completed)} en formato PNG.`);
      }
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "No pudimos crear las imágenes PNG localmente.");
    } finally {
      cancelledRef.current = false;
      setIsCancelling(false);
      setIsWorking(false);
    }
  };

  const requestCancel = () => {
    if (!isWorking) return;
    cancelledRef.current = true;
    setIsCancelling(true);
  };

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget && !isWorking) onClose(); }}
    >
      <section
        ref={dialogRef}
        className="modal pdf-to-image-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        aria-busy={isWorking}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal__header">
          <div>
            <h2 id={titleId}>PDF a PNG</h2>
            <p id={descriptionId} className="modal__subheading">Renderiza páginas del PDF abierto como imágenes PNG locales.</p>
          </div>
          <button className="icon-button" type="button" aria-label="Cerrar diálogo" disabled={isWorking} onClick={onClose}>
            <X size={17} aria-hidden="true" />
          </button>
        </header>

        <form onSubmit={(event) => void startExport(event)} noValidate>
          <div className="modal__body pdf-to-image-dialog__body">
            <p className="local-note pdf-to-image-dialog__privacy"><ShieldCheck size={16} aria-hidden="true" /><span>La renderización y las descargas ocurren solo en este dispositivo.</span></p>

            <fieldset className="pdf-to-image-dialog__fieldset" disabled={isWorking}>
              <legend>Qué páginas exportar</legend>
              <label className="pdf-to-image-dialog__choice">
                <input ref={firstRadioRef} type="radio" name="png-page-selection" value="current" checked={selectionMode === "current"} onChange={() => { setSelectionMode("current"); setError(null); }} />
                <span><strong>Página actual</strong><small>{activePageNumber > 0 ? `Página ${activePageNumber} del orden actual.` : "No hay una página activa."}</small></span>
              </label>
              <label className="pdf-to-image-dialog__choice">
                <input type="radio" name="png-page-selection" value="all" checked={selectionMode === "all"} onChange={() => { setSelectionMode("all"); setError(null); }} />
                <span><strong>Todas las páginas</strong><small>{pages.length} {pageLabel(pages.length)} en el orden actual.</small></span>
              </label>
              <label className="pdf-to-image-dialog__choice">
                <input type="radio" name="png-page-selection" value="range" checked={selectionMode === "range"} onChange={() => { setSelectionMode("range"); setError(null); }} />
                <span><strong>Rango de páginas</strong><small>Ejemplo: 1, 3, 5-9.</small></span>
              </label>
              {selectionMode === "range" && (
                <div className="pdf-to-image-dialog__range">
                  <label className="field-label" htmlFor={rangeId}>Páginas</label>
                  <input
                    id={rangeId}
                    className="field-input"
                    type="text"
                    value={rangeExpression}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="Ej.: 1, 3, 5-9"
                    aria-describedby={rangeHelpId}
                    aria-invalid={!selectionPreview.isValid}
                    onChange={(changeEvent) => { setRangeExpression(changeEvent.target.value); setError(null); }}
                  />
                  <p id={rangeHelpId} className="pdf-to-image-dialog__hint">Los números se refieren al orden actual de las {pages.length} {pageLabel(pages.length)}.</p>
                  {!selectionPreview.isValid && <p className="inline-error" role="alert">{selectionPreview.message}</p>}
                </div>
              )}
            </fieldset>

            <label className="inspector__field" htmlFor={qualityId}>
              <span className="field-label">Resolución PNG</span>
              <select id={qualityId} className="field-input" value={scale} disabled={isWorking} onChange={(changeEvent) => setScale(Number(changeEvent.target.value) as RenderScale)}>
                <option value={1}>1× · tamaño estándar</option>
                <option value={2}>2× · mayor detalle y archivos más grandes</option>
              </select>
            </label>

            {selectionPreview.isValid && <p className="pdf-to-image-dialog__preview" aria-live="polite"><FileImage size={16} aria-hidden="true" />Se preparará {selectionPreview.pages.length} {pngLabel(selectionPreview.pages.length)} PNG a {scale}×.</p>}
            {isMultiple && <p className="pdf-to-image-dialog__warning"><AlertTriangle size={16} aria-hidden="true" /><span>Se iniciarán {selectionPreview.pages.length} descargas separadas. El navegador puede pedir permiso para descargar varios archivos.</span></p>}
            {error && <p className="inline-error" role="alert">{error}</p>}
            {isWorking && <p className="pdf-to-image-dialog__status" role="status"><LoaderCircle size={15} aria-hidden="true" />{isCancelling ? "Cancelando después de la página en curso…" : `Renderizando ${Math.min((progress?.complete ?? 0) + 1, progress?.total ?? 1)} de ${progress?.total ?? 1}…`}</p>}
          </div>
          <footer className="modal__footer">
            {isWorking ? (
              <button className="btn" type="button" disabled={isCancelling} onClick={requestCancel}>{isCancelling ? "Cancelando…" : "Cancelar exportación"}</button>
            ) : <button className="btn" type="button" onClick={onClose}>Cancelar</button>}
            <button className="btn btn--primary" type="submit" disabled={isWorking || !selectionPreview.isValid}>
              <Download size={15} aria-hidden="true" />{isWorking ? "Exportando…" : "Descargar PNG"}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}

type SelectedPagesResult =
  | { isValid: true; pages: SelectedPage[] }
  | { isValid: false; message: string };

function resolveSelectedPages(
  mode: PageSelectionMode,
  expression: string,
  pages: readonly PDFPageModel[],
  activePageId: string | null
): SelectedPagesResult {
  if (pages.length === 0) return { isValid: false, message: "No hay páginas disponibles para exportar." };
  if (mode === "all") return { isValid: true, pages: pages.map((page, index) => ({ page, visualPageNumber: index + 1 })) };
  if (mode === "current") {
    const activeIndex = activePageId ? pages.findIndex((page) => page.id === activePageId) : -1;
    if (activeIndex < 0) return { isValid: false, message: "Selecciona una página activa antes de exportarla." };
    const page = pages[activeIndex];
    if (!page) return { isValid: false, message: "No encontramos la página activa para exportarla." };
    return { isValid: true, pages: [{ page, visualPageNumber: activeIndex + 1 }] };
  }

  try {
    const indexes = parsePageRange(expression, pages.length);
    return {
      isValid: true,
      pages: indexes.flatMap((index) => {
        const page = pages[index];
        return page ? [{ page, visualPageNumber: index + 1 }] : [];
      })
    };
  } catch (rangeError) {
    return { isValid: false, message: rangeError instanceof Error ? rangeError.message : "El rango de páginas no es válido." };
  }
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Tu navegador no pudo convertir la página renderizada en una imagen PNG."));
    }, "image/png");
  });
}

function pngFileName(visualPageNumber: number, total: number): string {
  const digits = Math.max(2, String(total).length);
  return `pagina-${String(visualPageNumber).padStart(digits, "0")}.png`;
}

function pageLabel(count: number): string {
  return count === 1 ? "página" : "páginas";
}

function pngLabel(count: number): string {
  return count === 1 ? "imagen" : "imágenes";
}

function getFocusableElements(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];
  return Array.from(container.querySelectorAll<HTMLElement>(
    "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"
  ));
}

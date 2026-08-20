import { AlertTriangle, Download, FileText, LoaderCircle, ShieldCheck, X } from "lucide-react";
import { type FormEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import { downloadBlob } from "@/core/files/download";
import { convertPdfToDocument, type PdfDocumentFormat } from "@/core/pdf/PdfDocumentConversion";
import { parsePageRange } from "@/core/pdf/PdfPageOperations";
import type { PDFPageModel } from "@/types/pdf";
import type { PDFDocumentProxy } from "pdfjs-dist";
import "@/styles/pdf-to-document.css";

export interface PdfToDocumentDialogProps {
  document: PDFDocumentProxy;
  pages: readonly PDFPageModel[];
  activePageId: string | null;
  sourceName: string;
  onClose: () => void;
  onComplete?: (message: string) => void;
}

type PageSelectionMode = "current" | "all" | "range";

interface ProgressState {
  complete: number;
  total: number;
}

const FORMAT_OPTIONS: Array<{ value: PdfDocumentFormat; label: string; description: string }> = [
  { value: "docx", label: "Word (.docx)", description: "Documento editable con el texto extraído por páginas." },
  { value: "txt", label: "Texto plano (.txt)", description: "Sólo texto UTF-8, útil para copiar o archivar." },
  { value: "html", label: "HTML (.html)", description: "Documento web simple con secciones por página." },
  { value: "md", label: "Markdown (.md)", description: "Texto estructurado con títulos de página." }
];

export function PdfToDocumentDialog({ document: pdfDocument, pages, activePageId, sourceName, onClose, onComplete }: PdfToDocumentDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const rangeId = useId();
  const formatId = useId();
  const rangeHelpId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const firstRadioRef = useRef<HTMLInputElement>(null);
  const [selectionMode, setSelectionMode] = useState<PageSelectionMode>("all");
  const [rangeExpression, setRangeExpression] = useState("1");
  const [format, setFormat] = useState<PdfDocumentFormat>("docx");
  const [includePageBreaks, setIncludePageBreaks] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedPages = useMemo(() => resolveSelectedPages(selectionMode, rangeExpression, pages, activePageId), [activePageId, pages, rangeExpression, selectionMode]);
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
    if (!selectedPages.isValid) {
      setError(selectedPages.message);
      return;
    }

    setError(null);
    setIsWorking(true);
    setProgress({ complete: 0, total: selectedPages.pages.length });
    try {
      const result = await convertPdfToDocument(pdfDocument, selectedPages.pages, {
        format,
        sourceName,
        includePageBreaks,
        onProgress: (complete, total) => setProgress({ complete, total })
      });
      downloadBlob(result.bytes, result.name, result.mimeType);
      onComplete?.(`Se descargó ${result.name}. La conversión extrae texto editable; no incluye OCR ni copia exacta del diseño.`);
    } catch (conversionError) {
      setError(conversionError instanceof Error ? conversionError.message : "No pudimos convertir este PDF a documento.");
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget && !isWorking) onClose(); }}
    >
      <section
        ref={dialogRef}
        className="modal pdf-to-document-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        aria-busy={isWorking}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal__header">
          <div>
            <h2 id={titleId}>PDF a documento</h2>
            <p id={descriptionId} className="modal__subheading">Convierte el texto seleccionable del PDF abierto a Word, texto, HTML o Markdown.</p>
          </div>
          <button className="icon-button" type="button" aria-label="Cerrar diálogo" disabled={isWorking} onClick={onClose}>
            <X size={17} aria-hidden="true" />
          </button>
        </header>

        <form onSubmit={(event) => void startExport(event)} noValidate>
          <div className="modal__body pdf-to-document-dialog__body">
            <p className="local-note pdf-to-document-dialog__privacy"><ShieldCheck size={16} aria-hidden="true" /><span>La extracción de texto y la descarga ocurren solo en este dispositivo.</span></p>

            <fieldset className="pdf-to-document-dialog__fieldset" disabled={isWorking}>
              <legend>Qué páginas convertir</legend>
              <label className="pdf-to-document-dialog__choice">
                <input ref={firstRadioRef} type="radio" name="document-page-selection" value="current" checked={selectionMode === "current"} onChange={() => { setSelectionMode("current"); setError(null); }} />
                <span><strong>Página actual</strong><small>{activePageNumber > 0 ? `Página ${activePageNumber} del orden actual.` : "No hay una página activa."}</small></span>
              </label>
              <label className="pdf-to-document-dialog__choice">
                <input type="radio" name="document-page-selection" value="all" checked={selectionMode === "all"} onChange={() => { setSelectionMode("all"); setError(null); }} />
                <span><strong>Todas las páginas</strong><small>{pages.length} {pageLabel(pages.length)} en el orden actual.</small></span>
              </label>
              <label className="pdf-to-document-dialog__choice">
                <input type="radio" name="document-page-selection" value="range" checked={selectionMode === "range"} onChange={() => { setSelectionMode("range"); setError(null); }} />
                <span><strong>Rango de páginas</strong><small>Ejemplo: 1, 3, 5-9.</small></span>
              </label>
              {selectionMode === "range" && (
                <div className="pdf-to-document-dialog__range">
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
                    aria-invalid={!selectedPages.isValid}
                    onChange={(changeEvent) => { setRangeExpression(changeEvent.target.value); setError(null); }}
                  />
                  <p id={rangeHelpId} className="pdf-to-document-dialog__hint">Los números se refieren al orden actual de las {pages.length} {pageLabel(pages.length)}.</p>
                  {!selectedPages.isValid && <p className="inline-error" role="alert">{selectedPages.message}</p>}
                </div>
              )}
            </fieldset>

            <label className="inspector__field" htmlFor={formatId}>
              <span className="field-label">Formato de salida</span>
              <select id={formatId} className="field-input" value={format} disabled={isWorking} onChange={(changeEvent) => setFormat(changeEvent.target.value as PdfDocumentFormat)}>
                {FORMAT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <p className="pdf-to-document-dialog__hint">{FORMAT_OPTIONS.find((option) => option.value === format)?.description}</p>

            <label className="pdf-to-document-dialog__toggle">
              <input type="checkbox" checked={includePageBreaks} disabled={isWorking} onChange={(changeEvent) => setIncludePageBreaks(changeEvent.target.checked)} />
              <span>Separar páginas en el documento convertido</span>
            </label>

            {selectedPages.isValid && <p className="pdf-to-document-dialog__preview" aria-live="polite"><FileText size={16} aria-hidden="true" />Se preparará {selectedPages.pages.length} {pageLabel(selectedPages.pages.length)} como {formatLabel(format)}.</p>}
            <p className="pdf-to-document-dialog__warning"><AlertTriangle size={16} aria-hidden="true" /><span>No es OCR ni reconstrucción perfecta de diseño. Los PDFs escaneados o con texto como imagen necesitan OCR externo.</span></p>
            {error && <p className="inline-error" role="alert">{error}</p>}
            {isWorking && <p className="pdf-to-document-dialog__status" role="status"><LoaderCircle size={15} aria-hidden="true" />Extrayendo texto {progress ? `${Math.min(progress.complete + 1, progress.total)} de ${progress.total}` : ""}…</p>}
          </div>
          <footer className="modal__footer">
            <button className="btn" type="button" disabled={isWorking} onClick={onClose}>Cancelar</button>
            <button className="btn btn--primary" type="submit" disabled={isWorking || !selectedPages.isValid}>
              <Download size={15} aria-hidden="true" />{isWorking ? "Convirtiendo…" : "Descargar documento"}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}

type SelectedPagesResult =
  | { isValid: true; pages: PDFPageModel[] }
  | { isValid: false; message: string };

function resolveSelectedPages(
  mode: PageSelectionMode,
  expression: string,
  pages: readonly PDFPageModel[],
  activePageId: string | null
): SelectedPagesResult {
  if (pages.length === 0) return { isValid: false, message: "No hay páginas disponibles para convertir." };
  if (mode === "all") return { isValid: true, pages: [...pages] };
  if (mode === "current") {
    const activeIndex = activePageId ? pages.findIndex((page) => page.id === activePageId) : -1;
    if (activeIndex < 0) return { isValid: false, message: "Selecciona una página activa antes de convertirla." };
    const page = pages[activeIndex];
    if (!page) return { isValid: false, message: "No encontramos la página activa para convertirla." };
    return { isValid: true, pages: [page] };
  }

  try {
    const indexes = parsePageRange(expression, pages.length);
    return { isValid: true, pages: indexes.flatMap((index) => pages[index] ? [pages[index]] : []) };
  } catch (rangeError) {
    return { isValid: false, message: rangeError instanceof Error ? rangeError.message : "El rango de páginas no es válido." };
  }
}

function pageLabel(count: number): string {
  return count === 1 ? "página" : "páginas";
}

function formatLabel(format: PdfDocumentFormat): string {
  if (format === "docx") return "Word (.docx)";
  if (format === "txt") return "texto plano (.txt)";
  if (format === "html") return "HTML (.html)";
  return "Markdown (.md)";
}

function getFocusableElements(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];
  return Array.from(container.querySelectorAll<HTMLElement>(
    "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"
  ));
}

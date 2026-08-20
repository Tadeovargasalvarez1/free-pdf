import { FileSearch, LoaderCircle, RotateCw, Search, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { PDFPageModel } from "@/types/pdf";

const MAX_VISIBLE_RESULTS = 200;
const CONTEXT_CHARACTERS = 68;

export interface TextSearchDialogProps {
  /** PDF.js document already opened by the editor; no file is uploaded again. */
  document: PDFDocumentProxy;
  /** Pages in their current visual order, including local reordering or duplicates. */
  pages: readonly PDFPageModel[];
  onClose: () => void;
  /** Lets the editor reveal the visual page that owns a matching text fragment. */
  onGoToPage: (pageId: string) => void;
}

export interface IndexedTextPage {
  pageId: string;
  pageNumber: number;
  text: string;
}

export interface TextSearchResult {
  id: string;
  pageId: string;
  pageNumber: number;
  occurrence: number;
  before: string;
  match: string;
  after: string;
}

interface SearchResultSet {
  results: TextSearchResult[];
  isTruncated: boolean;
}

/**
 * Searches text that PDF.js has already extracted in this browser. It does
 * not inspect editor overlays and cannot find text in image-only scans unless
 * that PDF already has a text layer.
 */
export function TextSearchDialog({ document: pdfDocument, pages, onClose, onGoToPage }: TextSearchDialogProps) {
  const [query, setQuery] = useState("");
  const [indexedPages, setIndexedPages] = useState<IndexedTextPage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [progress, setProgress] = useState({ complete: 0, total: pages.length });
  const [error, setError] = useState<string | null>(null);
  const [retryVersion, setRetryVersion] = useState(0);
  const dialogRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();
  const descriptionId = useId();
  const inputId = useId();
  const helpId = useId();
  const statusId = useId();

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previouslyFocused = globalThis.document.activeElement instanceof HTMLElement
      ? globalThis.document.activeElement
      : null;
    const focusFrame = window.requestAnimationFrame(() => inputRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = getFocusableElements(dialogRef.current);
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && globalThis.document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && globalThis.document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    globalThis.document.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      globalThis.document.removeEventListener("keydown", onKeyDown);
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const indexDocumentText = async () => {
      setIsLoading(true);
      setError(null);
      setIndexedPages([]);
      setProgress({ complete: 0, total: pages.length });

      try {
        const nextPages: IndexedTextPage[] = [];
        for (const [pageIndex, pageModel] of pages.entries()) {
          const sourcePage = await pdfDocument.getPage(pageModel.sourcePageIndex + 1);
          const content = await sourcePage.getTextContent();
          if (cancelled) return;

          nextPages.push({
            pageId: pageModel.id,
            pageNumber: pageIndex + 1,
            text: textFromPdfJsItems(content.items)
          });
          setProgress({ complete: pageIndex + 1, total: pages.length });
        }
        if (!cancelled) setIndexedPages(nextPages);
      } catch (indexError) {
        if (!cancelled) {
          setError(toSearchErrorMessage(indexError));
          setIndexedPages([]);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void indexDocumentText();
    return () => { cancelled = true; };
  }, [pages, pdfDocument, retryVersion]);

  const trimmedQuery = query.trim();
  const searchResultSet = useMemo(
    () => searchIndexedPages(indexedPages, trimmedQuery),
    [indexedPages, trimmedQuery]
  );
  const hasExtractableText = indexedPages.some((page) => page.text.trim().length > 0);

  const goToResult = (result: TextSearchResult) => {
    onGoToPage(result.pageId);
    onClose();
  };

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <section
        ref={dialogRef}
        className="modal text-search-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        aria-busy={isLoading}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal__header">
          <div>
            <h2 id={titleId}>Buscar texto</h2>
            <p id={descriptionId} className="modal__subheading">Busca en la capa de texto del PDF abierto, sin enviar el documento.</p>
          </div>
          <button className="icon-button" type="button" aria-label="Cerrar diálogo de búsqueda" onClick={onClose}>
            <X size={17} aria-hidden="true" />
          </button>
        </header>

        <div className="modal__body text-search-dialog__body">
          <div className="text-search-dialog__search-field">
            <label className="sr-only" htmlFor={inputId}>Texto que quieres buscar</label>
            <Search size={17} aria-hidden="true" />
            <input
              ref={inputRef}
              id={inputId}
              type="search"
              value={query}
              autoComplete="off"
              spellCheck={false}
              placeholder="Escribe para buscar"
              aria-describedby={`${helpId} ${statusId}`}
              onChange={(event) => setQuery(event.target.value)}
            />
            {query && (
              <button className="icon-button text-search-dialog__clear" type="button" aria-label="Limpiar búsqueda" onClick={() => setQuery("")}>
                <X size={15} aria-hidden="true" />
              </button>
            )}
          </div>
          <p id={helpId} className="text-search-dialog__hint">La búsqueda no distingue mayúsculas/minúsculas y no modifica el PDF.</p>

          {isLoading && (
            <p id={statusId} className="text-search-dialog__status" role="status">
              <LoaderCircle size={16} aria-hidden="true" />
              Indexando texto localmente: {progress.complete} de {progress.total} {pageLabel(progress.total)}.
            </p>
          )}

          {!isLoading && error && (
            <div className="text-search-dialog__error">
              <p className="inline-error" role="alert">{error}</p>
              <button className="btn" type="button" onClick={() => setRetryVersion((current) => current + 1)}>
                <RotateCw size={15} aria-hidden="true" />
                Reintentar
              </button>
            </div>
          )}

          {!isLoading && !error && !trimmedQuery && (
            <p id={statusId} className="text-search-dialog__empty" role="status">
              <FileSearch size={18} aria-hidden="true" />
              {pages.length === 0
                ? "No hay páginas disponibles para buscar."
                : hasExtractableText
                  ? "Escribe una palabra o frase para buscar en el documento."
                  : "No encontramos texto extraíble en este PDF. Los escaneos de imagen necesitan OCR, que esta búsqueda no realiza."}
            </p>
          )}

          {!isLoading && !error && trimmedQuery && hasExtractableText && (
            <>
              <p id={statusId} className="text-search-dialog__summary" role="status">
                {searchResultSet.results.length === 0
                  ? `No hay coincidencias para “${trimmedQuery}”.`
                  : `${searchResultSet.results.length} ${resultLabel(searchResultSet.results.length)} para “${trimmedQuery}”.`}
                {searchResultSet.isTruncated ? ` Se muestran los primeros ${MAX_VISIBLE_RESULTS}.` : ""}
              </p>
              {searchResultSet.results.length > 0 && (
                <ol className="text-search-dialog__results" aria-label={`Resultados para ${trimmedQuery}`}>
                  {searchResultSet.results.map((result) => (
                    <li key={result.id}>
                      <button className="text-search-dialog__result" type="button" onClick={() => goToResult(result)}>
                        <span className="text-search-dialog__result-meta">Página {result.pageNumber} · coincidencia {result.occurrence}</span>
                        <span className="text-search-dialog__context">
                          {result.before && <>{result.before} </>}
                          <mark>{result.match}</mark>
                          {result.after && <> {result.after}</>}
                        </span>
                      </button>
                    </li>
                  ))}
                </ol>
              )}
            </>
          )}

          {!isLoading && !error && trimmedQuery && !hasExtractableText && (
            <p id={statusId} className="text-search-dialog__empty" role="status">
              No hay texto extraíble para buscar en este PDF. La búsqueda no usa OCR.
            </p>
          )}
        </div>

        <footer className="modal__footer">
          <button className="btn" type="button" onClick={onClose}>Cerrar</button>
        </footer>
      </section>
    </div>
  );
}

/** Creates local, case-insensitive context snippets from already extracted text. */
export function searchIndexedPages(
  indexedPages: readonly IndexedTextPage[],
  query: string,
  maximumResults = MAX_VISIBLE_RESULTS
): SearchResultSet {
  const normalizedQuery = normalizeForSearch(query);
  if (!normalizedQuery) return { results: [], isTruncated: false };

  const results: TextSearchResult[] = [];
  for (const page of indexedPages) {
    const normalizedText = normalizeForSearch(page.text);
    let searchStart = 0;
    let occurrence = 0;
    while (searchStart <= normalizedText.length) {
      const matchIndex = normalizedText.indexOf(normalizedQuery, searchStart);
      if (matchIndex < 0) break;

      occurrence += 1;
      if (results.length >= maximumResults) return { results, isTruncated: true };
      results.push(createSearchResult(page, matchIndex, normalizedQuery.length, occurrence));
      searchStart = matchIndex + Math.max(1, normalizedQuery.length);
    }
  }
  return { results, isTruncated: false };
}

function createSearchResult(page: IndexedTextPage, matchIndex: number, queryLength: number, occurrence: number): TextSearchResult {
  const contextStart = Math.max(0, matchIndex - CONTEXT_CHARACTERS);
  const contextEnd = Math.min(page.text.length, matchIndex + queryLength + CONTEXT_CHARACTERS);
  const before = compactContext(page.text.slice(contextStart, matchIndex));
  const match = compactContext(page.text.slice(matchIndex, matchIndex + queryLength));
  const after = compactContext(page.text.slice(matchIndex + queryLength, contextEnd));
  return {
    id: `${page.pageId}:${occurrence}:${matchIndex}`,
    pageId: page.pageId,
    pageNumber: page.pageNumber,
    occurrence,
    before: contextStart > 0 && before ? `…${before}` : before,
    match,
    after: contextEnd < page.text.length && after ? `${after}…` : after
  };
}

function textFromPdfJsItems(items: readonly unknown[]): string {
  return items.flatMap((item) => {
    if (isPdfJsTextItem(item)) return [item.str];
    return [];
  }).join(" ");
}

function isPdfJsTextItem(item: unknown): item is { str: string } {
  return typeof item === "object" && item !== null && "str" in item && typeof item.str === "string";
}

function normalizeForSearch(value: string): string {
  return value.toLocaleLowerCase();
}

function compactContext(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function toSearchErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return `No se pudo extraer el texto del PDF: ${error.message}`;
  }
  return "No se pudo extraer el texto del PDF. Vuelve a intentarlo.";
}

function pageLabel(count: number): string {
  return count === 1 ? "página" : "páginas";
}

function resultLabel(count: number): string {
  return count === 1 ? "resultado" : "resultados";
}

function getFocusableElements(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];
  return Array.from(container.querySelectorAll<HTMLElement>(
    "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"
  ));
}

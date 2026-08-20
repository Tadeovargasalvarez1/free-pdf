import {
  ChevronDown,
  ChevronUp,
  Copy,
  GripVertical,
  RotateCw,
  Scissors,
  Trash2,
  X
} from "lucide-react";
import {
  type DragEvent,
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState
} from "react";
import type { PDFPageRotation } from "@/types/pdf";

/**
 * Presentation data for one page in the organizer. `index` is zero-based and
 * should reflect the current order from the parent. Supplying a thumbnail is
 * optional; when omitted the dialog renders a neutral page placeholder.
 */
export interface PageOrganizerPage {
  id: string;
  index: number;
  label?: string;
  rotation?: PDFPageRotation;
  thumbnail?: ReactNode;
}

export interface PageOrganizerDialogProps {
  /** Pages in their current project order. The parent remains the source of truth. */
  pages: readonly PageOrganizerPage[];
  activePageId?: string | null;
  onClose: () => void;
  /** Selects a page in the editor without changing its position. */
  onSelect?: (pageId: string) => void;
  /** Moves `sourcePageId` using `targetPageId` as the destination understood by the parent. */
  onReorder: (sourcePageId: string, targetPageId: string) => void;
  onDuplicate: (pageId: string) => void;
  onDelete: (pageId: string) => void;
  /** Rotates a page by the application's standard increment. */
  onRotate: (pageId: string) => void;
  /** Receives the selected page ids in their current visual order. */
  onExtract: (pageIds: readonly string[]) => void;
}

/**
 * A local-only page management surface. It owns interaction state only; every
 * document mutation is delegated to the supplied callbacks.
 */
export function PageOrganizerDialog({
  pages,
  activePageId = null,
  onClose,
  onSelect,
  onReorder,
  onDuplicate,
  onDelete,
  onRotate,
  onExtract
}: PageOrganizerDialogProps) {
  const [selectedPageIds, setSelectedPageIds] = useState<ReadonlySet<string>>(() => new Set());
  const [draggedPageId, setDraggedPageId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const dialogRef = useRef<HTMLElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const selectionSummaryId = useId();

  const selectedPages = useMemo(
    () => pages.filter((page) => selectedPageIds.has(page.id)),
    [pages, selectedPageIds]
  );
  const areAllPagesSelected = pages.length > 0 && selectedPages.length === pages.length;

  useEffect(() => {
    const availableIds = new Set(pages.map((page) => page.id));
    setSelectedPageIds((current) => {
      const retained = [...current].filter((pageId) => availableIds.has(pageId));
      return retained.length === current.size ? current : new Set(retained);
    });
  }, [pages]);

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusDialog = window.requestAnimationFrame(() => {
      const closeButton = dialogRef.current?.querySelector<HTMLButtonElement>("[data-page-organizer-close]");
      closeButton?.focus();
    });
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const focusableElements = getFocusableElements(dialogRef.current);
      const firstElement = focusableElements[0];
      const lastElement = focusableElements.at(-1);
      if (!firstElement || !lastElement) return;

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusDialog);
      document.removeEventListener("keydown", handleKeyDown);
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [onClose]);

  const togglePageSelection = (pageId: string) => {
    setSelectedPageIds((current) => {
      const next = new Set(current);
      if (next.has(pageId)) next.delete(pageId); else next.add(pageId);
      return next;
    });
  };

  const toggleAllPages = () => {
    setSelectedPageIds(areAllPagesSelected ? new Set() : new Set(pages.map((page) => page.id)));
  };

  const movePage = (page: PageOrganizerPage, direction: -1 | 1) => {
    const currentPosition = pages.findIndex((candidate) => candidate.id === page.id);
    const target = pages[currentPosition + direction];
    if (!target) return;

    onReorder(page.id, target.id);
    setAnnouncement(`Página ${page.index + 1} movida ${direction < 0 ? "una posición arriba" : "una posición abajo"}.`);
  };

  const handleDragStart = (event: DragEvent<HTMLElement>, pageId: string) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", pageId);
    setDraggedPageId(pageId);
    setAnnouncement("Página tomada. Suéltala sobre otra página para reordenarla.");
  };

  const handleDrop = (event: DragEvent<HTMLElement>, targetPage: PageOrganizerPage) => {
    event.preventDefault();
    const sourcePageId = draggedPageId ?? event.dataTransfer.getData("text/plain");
    if (sourcePageId && sourcePageId !== targetPage.id) {
      const sourcePage = pages.find((page) => page.id === sourcePageId);
      onReorder(sourcePageId, targetPage.id);
      setAnnouncement(`${sourcePage ? `Página ${sourcePage.index + 1}` : "La página"} fue reordenada.`);
    }
    setDraggedPageId(null);
    setDropTargetId(null);
  };

  const selectedCount = selectedPages.length;
  const selectedPageText = selectedCount === 1 ? "página seleccionada" : "páginas seleccionadas";

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className="modal page-organizer"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <header className="modal__header page-organizer__header">
          <div>
            <h2 id={titleId}>Organizar páginas</h2>
            <p id={descriptionId} className="modal__subheading">
              Reordena, rota, duplica o elimina páginas sin modificar el archivo original.
            </p>
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label="Cerrar organizador de páginas"
            data-page-organizer-close
            onClick={onClose}
          >
            <X size={17} aria-hidden="true" />
          </button>
        </header>

        <div className="page-organizer__body">
          <div className="page-organizer__toolbar">
            <p className="page-organizer__hint">
              Arrastra una tarjeta o usa las flechas para cambiar el orden. Marca páginas para extraerlas en un PDF nuevo.
            </p>
            <button className="btn page-organizer__select-all" type="button" onClick={toggleAllPages} disabled={pages.length === 0}>
              {areAllPagesSelected ? "Quitar selección" : "Seleccionar todas"}
            </button>
          </div>

          {pages.length > 0 ? (
            <ol className="page-organizer__grid" aria-label="Páginas del documento">
              {pages.map((page, position) => (
                <li
                  key={page.id}
                  className={[
                    "page-organizer__card",
                    page.id === activePageId ? "is-active" : "",
                    page.id === draggedPageId ? "is-dragging" : "",
                    page.id === dropTargetId ? "is-drop-target" : ""
                  ].filter(Boolean).join(" ")}
                  draggable
                  onDragStart={(event) => handleDragStart(event, page.id)}
                  onDragEnd={() => {
                    setDraggedPageId(null);
                    setDropTargetId(null);
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                  }}
                  onDragEnter={() => {
                    if (draggedPageId && draggedPageId !== page.id) setDropTargetId(page.id);
                  }}
                  onDragLeave={(event) => {
                    if (event.currentTarget === event.target) setDropTargetId(null);
                  }}
                  onDrop={(event) => handleDrop(event, page)}
                >
                  <div className="page-organizer__card-topline">
                    <label className="page-organizer__selection">
                      <input
                        type="checkbox"
                        checked={selectedPageIds.has(page.id)}
                        onChange={() => togglePageSelection(page.id)}
                        aria-label={`Seleccionar página ${page.index + 1} para extraer`}
                      />
                      <span>Seleccionar</span>
                    </label>
                    <GripVertical className="page-organizer__grip" size={16} aria-label="Arrastrar para reordenar" />
                  </div>

                  {onSelect ? (
                    <button
                      className="page-organizer__preview"
                      type="button"
                      aria-label={`Ir a la página ${page.index + 1}`}
                      onClick={() => onSelect(page.id)}
                    >
                      {page.thumbnail ?? <PagePlaceholder pageNumber={page.index + 1} />}
                    </button>
                  ) : (
                    <div className="page-organizer__preview" aria-hidden="true">
                      {page.thumbnail ?? <PagePlaceholder pageNumber={page.index + 1} />}
                    </div>
                  )}

                  <div className="page-organizer__card-caption">
                    <span className="page-organizer__page-name">Página {page.index + 1}</span>
                    {(page.label || page.rotation) && (
                      <span className="page-organizer__page-meta">
                        {[page.label ? `Original ${page.label}` : null, page.rotation ? `Rotación ${page.rotation}°` : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    )}
                  </div>

                  <div className="page-organizer__card-actions" aria-label={`Acciones de página ${page.index + 1}`}>
                    <button
                      className="icon-button"
                      type="button"
                      aria-label={`Mover página ${page.index + 1} arriba`}
                      title="Mover arriba"
                      disabled={position === 0}
                      onClick={() => movePage(page, -1)}
                    >
                      <ChevronUp size={15} aria-hidden="true" />
                    </button>
                    <button
                      className="icon-button"
                      type="button"
                      aria-label={`Mover página ${page.index + 1} abajo`}
                      title="Mover abajo"
                      disabled={position === pages.length - 1}
                      onClick={() => movePage(page, 1)}
                    >
                      <ChevronDown size={15} aria-hidden="true" />
                    </button>
                    <button
                      className="icon-button"
                      type="button"
                      aria-label={`Rotar página ${page.index + 1} 90 grados`}
                      title="Rotar 90°"
                      onClick={() => onRotate(page.id)}
                    >
                      <RotateCw size={15} aria-hidden="true" />
                    </button>
                    <button
                      className="icon-button"
                      type="button"
                      aria-label={`Duplicar página ${page.index + 1}`}
                      title="Duplicar"
                      onClick={() => onDuplicate(page.id)}
                    >
                      <Copy size={14} aria-hidden="true" />
                    </button>
                    <button
                      className="icon-button page-organizer__delete"
                      type="button"
                      aria-label={`Eliminar página ${page.index + 1}`}
                      title="Eliminar"
                      disabled={pages.length <= 1}
                      onClick={() => onDelete(page.id)}
                    >
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="page-organizer__empty">No hay páginas disponibles para organizar.</p>
          )}
        </div>

        <footer className="modal__footer page-organizer__footer">
          <span id={selectionSummaryId} className="page-organizer__selection-summary">
            {selectedCount} {selectedPageText}
          </span>
          <button className="btn" type="button" onClick={onClose}>Cerrar</button>
          <button
            className="btn btn--primary"
            type="button"
            disabled={selectedCount === 0}
            aria-describedby={selectionSummaryId}
            onClick={() => {
              onExtract(selectedPages.map((page) => page.id));
              setAnnouncement(`${selectedCount} ${selectedPageText} enviada${selectedCount === 1 ? "" : "s"} a extracción.`);
            }}
          >
            <Scissors size={15} aria-hidden="true" />
            Extraer selección
          </button>
        </footer>
        <p className="page-organizer__sr-status" role="status" aria-live="polite">{announcement}</p>
      </section>
    </div>
  );
}

function PagePlaceholder({ pageNumber }: { pageNumber: number }) {
  return <span className="page-organizer__placeholder" aria-hidden="true">{pageNumber}</span>;
}

function getFocusableElements(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];
  return Array.from(container.querySelectorAll<HTMLElement>(
    "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"
  ));
}

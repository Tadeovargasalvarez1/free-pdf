import { Copy, Crop, LayoutGrid, RotateCw, Scissors, Split, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { BrowserPdfEngine } from "@/core/pdf/PdfEngine";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { PDFPageModel, PDFProject } from "@/types/pdf";

interface PageSidebarProps {
  project: PDFProject;
  document: PDFDocumentProxy;
  activePageId: string | null;
  onSelect: (pageId: string) => void;
  onRotate: (pageId: string) => void;
  onDuplicate: (pageId: string) => void;
  onDelete: (pageId: string) => void;
  onReorder: (sourcePageId: string, targetPageId: string) => void;
  onOrganize: () => void;
  onCrop: () => void;
  onExtract: () => void;
  onSplit: () => void;
}

const thumbnailEngine = new BrowserPdfEngine();

export function PageSidebar({
  project,
  document,
  activePageId,
  onSelect,
  onRotate,
  onDuplicate,
  onDelete,
  onReorder,
  onOrganize,
  onCrop,
  onExtract,
  onSplit
}: PageSidebarProps) {
  const activePage = project.pages.find((page) => page.id === activePageId) ?? project.pages[0];
  const [draggedPageId, setDraggedPageId] = useState<string | null>(null);

  return (
    <aside className="page-sidebar" aria-label="Páginas del documento">
      <div className="panel-heading">
        <h2>Páginas</h2>
        <span className="panel-heading__meta">{project.pages.length}</span>
      </div>
      {activePage && (
        <div className="page-sidebar__actions" aria-label="Acciones de página seleccionada">
          <button className="icon-button" type="button" title="Rotar página 90 grados" aria-label="Rotar página 90 grados" onClick={() => onRotate(activePage.id)}><RotateCw size={15} /></button>
          <button className="icon-button" type="button" title="Duplicar página" aria-label="Duplicar página" onClick={() => onDuplicate(activePage.id)}><Copy size={14} /></button>
          <button className="icon-button" type="button" title="Organizar páginas" aria-label="Organizar páginas" onClick={onOrganize}><LayoutGrid size={14} /></button>
          <button className="icon-button" type="button" title="Recortar página" aria-label="Recortar página" onClick={onCrop}><Crop size={14} /></button>
          <button className="icon-button" type="button" title="Extraer páginas" aria-label="Extraer páginas" onClick={onExtract}><Scissors size={14} /></button>
          <button className="icon-button" type="button" title="Dividir PDF" aria-label="Dividir PDF" onClick={onSplit}><Split size={14} /></button>
          <button className="icon-button" type="button" title="Eliminar página" aria-label="Eliminar página" disabled={project.pages.length <= 1} onClick={() => onDelete(activePage.id)}><Trash2 size={14} /></button>
        </div>
      )}
      <div className="thumbnail-list">
        {project.pages.map((page, index) => (
          <Thumbnail
            key={page.id}
            page={page}
            pageNumber={index + 1}
            document={document}
            isActive={page.id === activePageId}
            onSelect={() => onSelect(page.id)}
            onDragStart={() => setDraggedPageId(page.id)}
            onDrop={() => {
              if (draggedPageId) onReorder(draggedPageId, page.id);
              setDraggedPageId(null);
            }}
          />
        ))}
      </div>
    </aside>
  );
}

interface ThumbnailProps {
  page: PDFPageModel;
  pageNumber: number;
  document: PDFDocumentProxy;
  isActive: boolean;
  onSelect: () => void;
  onDragStart: () => void;
  onDrop: () => void;
}

function Thumbnail({ page, pageNumber, document, isActive, onSelect, onDragStart, onDrop }: ThumbnailProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLButtonElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isRendered, setIsRendered] = useState(false);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return undefined;
    if (!("IntersectionObserver" in window)) {
      setIsVisible(true);
      return undefined;
    }
    const observer = new IntersectionObserver(([entry]) => setIsVisible(Boolean(entry?.isIntersecting)), { rootMargin: "240px 0px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible || !canvasRef.current) return undefined;
    let disposed = false;
    thumbnailEngine.renderPage(document, page, canvasRef.current, { zoom: 0.23, devicePixelRatio: 1 })
      .then(() => { if (!disposed) setIsRendered(true); })
      .catch(() => { if (!disposed) setIsRendered(false); });
    return () => { disposed = true; };
  }, [document, isVisible, page]);

  return (
    <button
      ref={containerRef}
      className={`thumbnail-item ${isActive ? "is-active" : ""}`}
      type="button"
      draggable
      aria-label={`Ir a la página ${pageNumber}`}
      onClick={onSelect}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        onDrop();
      }}
    >
      <span className="thumbnail-canvas-wrap">
        {!isRendered && <span className="thumbnail-placeholder">{pageNumber}</span>}
        <canvas ref={canvasRef} aria-hidden="true" />
      </span>
      <span>{pageNumber}</span>
    </button>
  );
}

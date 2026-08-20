import { Crop, FileImage, FilePenLine, FileText, Hash, Highlighter, Info, LayoutGrid, PenLine, Scissors, Search, Shapes, Split, SquarePen, Stamp, StickyNote, Undo2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { EditorTool } from "@/types/pdf";

export interface EditorCommand {
  id: string;
  title: string;
  description: string;
  aliases: string[];
  icon: typeof FilePenLine;
  shortcut?: string;
  run: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onChooseTool: (tool: EditorTool) => void;
  onOpenSignature: () => void;
  onOpenStamp: () => void;
  onOpenPageNumbers: () => void;
  onOpenWatermark: () => void;
  onOpenMetadata: () => void;
  onOpenPdfToImage: () => void;
  onOpenPdfToDocument: () => void;
  onOpenFormFill: () => void;
  onOpenTextSearch: () => void;
  onOpenPageOrganizer: () => void;
  onOpenCrop: () => void;
  onOpenExtract: () => void;
  onOpenSplit: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onExport: () => void;
}

export function CommandPalette({ open, onClose, onChooseTool, onOpenSignature, onOpenStamp, onOpenPageNumbers, onOpenWatermark, onOpenMetadata, onOpenPdfToImage, onOpenPdfToDocument, onOpenFormFill, onOpenTextSearch, onOpenPageOrganizer, onOpenCrop, onOpenExtract, onOpenSplit, onUndo, onRedo, onExport }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const commands = useMemo<EditorCommand[]>(() => [
    { id: "text", title: "Añadir texto", description: "Haz clic en una página para colocar texto.", aliases: ["texto", "editar", "escribir"], icon: SquarePen, shortcut: "T", run: () => onChooseTool("text") },
    { id: "shape", title: "Añadir forma", description: "Haz clic en una página para colocar un rectángulo.", aliases: ["forma", "rectángulo", "cuadro"], icon: Shapes, run: () => onChooseTool("shape") },
    { id: "highlight", title: "Resaltar manualmente", description: "Coloca y ajusta una banda semitransparente sobre la página.", aliases: ["resaltar", "resaltador", "marcador"], icon: Highlighter, run: () => onChooseTool("highlight") },
    { id: "note", title: "Añadir nota visual", description: "Haz clic en una página para colocar una nota editable.", aliases: ["nota", "comentario", "adhesiva"], icon: StickyNote, run: () => onChooseTool("note") },
    { id: "draw", title: "Dibujar", description: "Dibuja un trazo libre sobre la página activa.", aliases: ["dibujo", "lápiz", "anotar"], icon: PenLine, run: () => onChooseTool("draw") },
    { id: "signature", title: "Añadir firma visual", description: "Dibuja o escribe una firma visual local.", aliases: ["firma", "firmar", "iniciales"], icon: FilePenLine, run: onOpenSignature },
    { id: "stamp", title: "Añadir sello visual", description: "Coloca un sello visual permanente en la copia exportada.", aliases: ["sello", "aprobado", "confidencial", "revisado"], icon: Stamp, run: onOpenStamp },
    { id: "page-numbers", title: "Numerar páginas", description: "Añade una serie de números editables a todas las páginas.", aliases: ["número", "numeración", "paginación", "pie"], icon: Hash, run: onOpenPageNumbers },
    { id: "watermark", title: "Añadir marca de agua", description: "Añade un texto visual editable a todas las páginas.", aliases: ["marca", "watermark", "borrador"], icon: Stamp, run: onOpenWatermark },
    { id: "metadata", title: "Editar metadatos", description: "Actualiza los campos Info básicos de la copia exportada.", aliases: ["metadatos", "título", "autor", "info"], icon: Info, run: onOpenMetadata },
    { id: "pdf-to-image", title: "PDF a PNG", description: "Exporta la página actual, todas o un rango como imágenes PNG locales.", aliases: ["png", "imagen", "convertir", "exportar páginas"], icon: FileImage, run: onOpenPdfToImage },
    { id: "pdf-to-document", title: "PDF a documento", description: "Extrae texto del PDF como Word (.docx), TXT, HTML o Markdown.", aliases: ["word", "docx", "documento", "txt", "html", "markdown", "convertir"], icon: FileText, run: onOpenPdfToDocument },
    { id: "form", title: "Rellenar formulario", description: "Rellena campos AcroForm locales y abre una copia nueva.", aliases: ["formulario", "acroform", "campo", "aplanar"], icon: FileText, run: onOpenFormFill },
    { id: "find", title: "Buscar texto", description: "Busca texto en las páginas del PDF abierto sin subirlo.", aliases: ["buscar", "encontrar", "ctrl f", "texto"], icon: Search, shortcut: "Ctrl F", run: onOpenTextSearch },
    { id: "organize-pages", title: "Organizar páginas", description: "Reordena, rota, duplica, elimina o extrae páginas en una cuadrícula.", aliases: ["páginas", "reordenar", "duplicar", "eliminar", "rotar"], icon: LayoutGrid, run: onOpenPageOrganizer },
    { id: "crop-page", title: "Recortar página activa", description: "Ajusta el CropBox visual de la página activa; no elimina contenido de forma segura.", aliases: ["recortar", "crop", "márgenes"], icon: Crop, run: onOpenCrop },
    { id: "extract-pages", title: "Extraer páginas", description: "Descarga una copia con un rango de páginas elegido.", aliases: ["extraer", "rango", "selección"], icon: Scissors, run: onOpenExtract },
    { id: "split-pdf", title: "Dividir PDF", description: "Descarga copias separadas cada cierta cantidad de páginas.", aliases: ["dividir", "separar", "partir"], icon: Split, run: onOpenSplit },
    { id: "undo", title: "Deshacer", description: "Revierte la última edición.", aliases: ["undo", "atrás"], icon: Undo2, shortcut: "Ctrl Z", run: onUndo },
    { id: "redo", title: "Rehacer", description: "Restaura una edición deshecha.", aliases: ["redo", "adelante"], icon: Undo2, shortcut: "Ctrl ⇧ Z", run: onRedo },
    { id: "export", title: "Descargar PDF", description: "Exporta una copia nueva del documento.", aliases: ["exportar", "guardar", "descargar"], icon: FilePenLine, shortcut: "Ctrl S", run: onExport }
  ], [onChooseTool, onExport, onOpenCrop, onOpenExtract, onOpenFormFill, onOpenMetadata, onOpenPageNumbers, onOpenPageOrganizer, onOpenPdfToDocument, onOpenPdfToImage, onOpenSignature, onOpenSplit, onOpenStamp, onOpenTextSearch, onOpenWatermark, onRedo, onUndo]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  if (!open) return null;
  const normalizedQuery = query.trim().toLocaleLowerCase("es");
  const matches = commands.filter((command) => !normalizedQuery || [command.title, command.description, ...command.aliases].some((value) => value.toLocaleLowerCase("es").includes(normalizedQuery)));

  const runCommand = (command: EditorCommand) => {
    command.run();
    onClose();
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="modal command-palette" role="dialog" aria-modal="true" aria-label="Buscar herramientas" onMouseDown={(event) => event.stopPropagation()}>
        <div className="command-palette__search"><Search size={18} aria-hidden="true" /><input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="¿Qué quieres hacer?" aria-label="Buscar herramientas" onKeyDown={(event) => { if (event.key === "Escape") onClose(); if (event.key === "Enter" && matches[0]) runCommand(matches[0]); }} /><kbd>Esc</kbd></div>
        <div className="command-list">
          {matches.map((command) => {
            const Icon = command.icon;
            return <button className="command-item" type="button" key={command.id} onClick={() => runCommand(command)}><span className="command-item__icon"><Icon size={15} /></span><span className="command-item__body"><strong>{command.title}</strong><span>{command.description}</span></span>{command.shortcut && <kbd>{command.shortcut}</kbd>}</button>;
          })}
          {matches.length === 0 && <p className="inspector__empty">No encontramos una herramienta disponible con ese nombre.</p>}
        </div>
      </section>
    </div>
  );
}

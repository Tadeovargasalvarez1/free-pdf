import {
  ChevronLeft,
  Crop,
  Download,
  FileImage,
  FileText,
  FolderOpen,
  Highlighter,
  Hash,
  Info,
  LayoutGrid,
  MousePointer2,
  MoreHorizontal,
  Pencil,
  Redo2,
  Search,
  Signature,
  Scissors,
  Split,
  Stamp,
  StickyNote,
  SquareDashedMousePointer,
  SquarePen,
  Undo2
} from "lucide-react";
import { type ChangeEvent, type KeyboardEvent as ReactKeyboardEvent, useEffect, useRef, useState } from "react";
import type { ThemePreference } from "@/app/App";
import { ThemeToggle } from "@/components/common/ThemeToggle";
import { useEditorStore } from "@/features/editor/store/editorStore";
import type { EditorTool } from "@/types/pdf";

interface EditorTopBarProps {
  theme: ThemePreference;
  onThemeChange: (theme: ThemePreference) => void;
  onHome: () => void;
  onOpenPdf: (file: File) => void;
  onOpenImage: (file: File) => void;
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
  onExport: () => void;
  isExporting: boolean;
}

interface ToolButtonProps {
  tool?: EditorTool;
  label: string;
  icon: typeof MousePointer2;
  onClick?: () => void;
}

export function EditorTopBar({
  theme,
  onThemeChange,
  onHome,
  onOpenPdf,
  onOpenImage,
  onOpenSignature,
  onOpenStamp,
  onOpenPageNumbers,
  onOpenWatermark,
  onOpenMetadata,
  onOpenPdfToImage,
  onOpenPdfToDocument,
  onOpenFormFill,
  onOpenTextSearch,
  onOpenPageOrganizer,
  onOpenCrop,
  onOpenExtract,
  onOpenSplit,
  onExport,
  isExporting
}: EditorTopBarProps) {
  const project = useEditorStore((state) => state.project);
  const activeTool = useEditorStore((state) => state.activeTool);
  const setActiveTool = useEditorStore((state) => state.setActiveTool);
  const undo = useEditorStore((state) => state.undo);
  const redo = useEditorStore((state) => state.redo);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const documentMenuRef = useRef<HTMLDivElement>(null);
  const documentMenuButtonRef = useRef<HTMLButtonElement>(null);
  const firstDocumentMenuItemRef = useRef<HTMLButtonElement>(null);
  const [isDocumentMenuOpen, setIsDocumentMenuOpen] = useState(false);

  const focusFirstDocumentMenuItem = () => {
    window.requestAnimationFrame(() => firstDocumentMenuItemRef.current?.focus());
  };

  const closeDocumentMenu = (restoreFocus = false) => {
    setIsDocumentMenuOpen(false);
    if (restoreFocus) {
      window.requestAnimationFrame(() => documentMenuButtonRef.current?.focus());
    }
  };

  useEffect(() => {
    if (!isDocumentMenuOpen) return undefined;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !documentMenuRef.current?.contains(event.target)) {
        setIsDocumentMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeDocumentMenu(true);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isDocumentMenuOpen]);

  const handlePdf = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) onOpenPdf(file);
    event.target.value = "";
  };
  const handleImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) onOpenImage(file);
    event.target.value = "";
  };

  const handleDocumentMenuTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setIsDocumentMenuOpen(true);
      focusFirstDocumentMenuItem();
    }
    if (event.key === "Escape") {
      closeDocumentMenu();
    }
  };

  const handleDocumentMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
    if (items.length === 0) return;

    const focusedIndex = items.indexOf(document.activeElement as HTMLButtonElement);
    let nextIndex: number | null = null;
    if (event.key === "ArrowDown") nextIndex = focusedIndex < 0 || focusedIndex === items.length - 1 ? 0 : focusedIndex + 1;
    if (event.key === "ArrowUp") nextIndex = focusedIndex <= 0 ? items.length - 1 : focusedIndex - 1;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = items.length - 1;
    if (nextIndex !== null) {
      event.preventDefault();
      items[nextIndex]?.focus();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      closeDocumentMenu(true);
    }
  };

  const tool = (props: ToolButtonProps) => <ToolbarTool {...props} activeTool={activeTool} onSetTool={setActiveTool} />;

  return (
    <header className="editor-topbar">
      <button className="editor-topbar__brand" type="button" onClick={onHome} title="Volver al inicio">
        <span className="brand-mark"><ChevronLeft size={18} /></span><span>Free PDF</span>
      </button>
      <div className="editor-topbar__document" title={project?.source.name}>
        <strong>{project?.source.name ?? "Documento"}</strong>
        <span>{project ? `${project.pages.length} ${project.pages.length === 1 ? "página" : "páginas"} · original protegido` : ""}</span>
      </div>
      <div className="toolbar-divider" />
      <div className="editor-topbar__tools" aria-label="Herramientas del editor">
        <button className="toolbar-tool" type="button" title="Abrir otro PDF" onClick={() => pdfInputRef.current?.click()}><FolderOpen size={16} /><span>Abrir</span></button>
        {tool({ tool: "select", label: "Seleccionar", icon: MousePointer2 })}
        {tool({ tool: "text", label: "Texto", icon: SquarePen })}
        {tool({ label: "Imagen", icon: FileImage, onClick: () => imageInputRef.current?.click() })}
        {tool({ tool: "shape", label: "Forma", icon: SquareDashedMousePointer })}
        {tool({ tool: "highlight", label: "Resaltar", icon: Highlighter })}
        {tool({ tool: "note", label: "Nota", icon: StickyNote })}
        {tool({ tool: "draw", label: "Dibujar", icon: Pencil })}
        {tool({ label: "Firma", icon: Signature, onClick: onOpenSignature })}
        {tool({ label: "Sello", icon: Stamp, onClick: onOpenStamp })}
        <div ref={documentMenuRef} className="editor-topbar__more">
          <button
            ref={documentMenuButtonRef}
            className={`toolbar-tool ${isDocumentMenuOpen ? "is-active" : ""}`}
            type="button"
            title="Más herramientas de documento"
            aria-label="Más herramientas de documento"
            aria-haspopup="menu"
            aria-expanded={isDocumentMenuOpen}
            aria-controls="document-tools-menu"
            onKeyDown={handleDocumentMenuTriggerKeyDown}
            onClick={() => setIsDocumentMenuOpen((open) => !open)}
          ><MoreHorizontal size={17} /><span>Más</span></button>
          {isDocumentMenuOpen && (
            <div id="document-tools-menu" className="editor-topbar__more-menu" role="menu" aria-label="Herramientas de documento" onKeyDown={handleDocumentMenuKeyDown}>
              <button ref={firstDocumentMenuItemRef} type="button" role="menuitem" onClick={() => { closeDocumentMenu(); onOpenPageOrganizer(); }}><LayoutGrid size={15} /> Organizar páginas</button>
              <button type="button" role="menuitem" onClick={() => { closeDocumentMenu(); onOpenCrop(); }}><Crop size={15} /> Recortar página activa</button>
              <button type="button" role="menuitem" onClick={() => { closeDocumentMenu(); onOpenExtract(); }}><Scissors size={15} /> Extraer páginas</button>
              <button type="button" role="menuitem" onClick={() => { closeDocumentMenu(); onOpenSplit(); }}><Split size={15} /> Dividir PDF</button>
              <button type="button" role="menuitem" onClick={() => { closeDocumentMenu(); onOpenTextSearch(); }}><Search size={15} /> Buscar texto</button>
              <button type="button" role="menuitem" onClick={() => { closeDocumentMenu(); onOpenPageNumbers(); }}><Hash size={15} /> Numerar páginas</button>
              <button type="button" role="menuitem" onClick={() => { closeDocumentMenu(); onOpenWatermark(); }}><Stamp size={15} /> Marca de agua</button>
              <button type="button" role="menuitem" onClick={() => { closeDocumentMenu(); onOpenMetadata(); }}><Info size={15} /> Metadatos</button>
              <button type="button" role="menuitem" onClick={() => { closeDocumentMenu(); onOpenPdfToImage(); }}><FileImage size={15} /> PDF a PNG</button>
              <button type="button" role="menuitem" onClick={() => { closeDocumentMenu(); onOpenPdfToDocument(); }}><FileText size={15} /> PDF a documento</button>
              <button type="button" role="menuitem" onClick={() => { closeDocumentMenu(); onOpenFormFill(); }}><FileText size={15} /> Rellenar formulario</button>
            </div>
          )}
        </div>
      </div>
      <div className="editor-topbar__actions">
        <button className="icon-button" type="button" title="Deshacer (Ctrl+Z)" aria-label="Deshacer" onClick={undo} disabled={!project?.history.undoDepth}><Undo2 size={16} /></button>
        <button className="icon-button" type="button" title="Rehacer (Ctrl+Mayús+Z)" aria-label="Rehacer" onClick={redo} disabled={!project?.history.redoDepth}><Redo2 size={16} /></button>
        <ThemeToggle compact value={theme} onChange={onThemeChange} />
        <button className="btn btn--primary" type="button" onClick={onExport} disabled={isExporting || !project}>{isExporting ? "Preparando…" : <><Download size={15} /> Descargar</>}</button>
      </div>
      <input ref={pdfInputRef} hidden type="file" accept="application/pdf,.pdf" onChange={handlePdf} />
      <input ref={imageInputRef} hidden type="file" accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp" onChange={handleImage} />
    </header>
  );
}

function ToolbarTool({ tool, label, icon: Icon, onClick, activeTool, onSetTool }: ToolButtonProps & { activeTool: EditorTool; onSetTool: (tool: EditorTool) => void }) {
  const isActive = tool === activeTool;
  return <button className={`toolbar-tool ${isActive ? "is-active" : ""}`} type="button" title={label} aria-pressed={tool ? isActive : undefined} onClick={() => onClick ? onClick() : tool && onSetTool(tool)}><Icon size={16} /><span>{label}</span></button>;
}

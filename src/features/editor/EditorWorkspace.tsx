import { AlertCircle, FilePenLine, Minus, Plus, RotateCcw } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import type { ThemePreference } from "@/app/App";
import { DocumentViewport } from "@/features/editor/components/DocumentViewport";
import { EditorTopBar } from "@/features/editor/components/EditorTopBar";
import { InspectorPanel } from "@/features/editor/components/InspectorPanel";
import { PageSidebar } from "@/features/editor/components/PageSidebar";
import { BrowserPdfEngine, createLocalImageAsset } from "@/core/pdf/PdfEngine";
import { downloadPdf } from "@/core/files/download";
import { useEditorStore } from "@/features/editor/store/editorStore";
import {
  createImageObject,
  createPageNumberObject,
  createSignatureObject,
  createSignatureImageObject,
  createStampObject,
  createWatermarkObject,
  type SignatureDraft
} from "@/features/editor/utils/editorObjects";
import type { DocumentOverlayMode, DocumentOverlaySettings } from "@/features/editor/components/DocumentOverlayDialog";
import type { EditorTool, PDFPageModel, PDFProject, StampKind } from "@/types/pdf";
import type { EditorLaunchIntent } from "@/features/home/HomeScreen";
import type { PDFDocumentProxy } from "pdfjs-dist";

const organizerThumbnailEngine = new BrowserPdfEngine();
const CommandPalette = lazy(async () => ({ default: (await import("@/features/editor/components/CommandPalette")).CommandPalette }));
const CropDialog = lazy(async () => ({ default: (await import("@/features/editor/components/CropDialog")).CropDialog }));
const DocumentOverlayDialog = lazy(async () => ({ default: (await import("@/features/editor/components/DocumentOverlayDialog")).DocumentOverlayDialog }));
const MetadataDialog = lazy(async () => ({ default: (await import("@/features/editor/components/MetadataDialog")).MetadataDialog }));
const PdfToImageDialog = lazy(async () => ({ default: (await import("@/features/convert/PdfToImageDialog")).PdfToImageDialog }));
const FormFillDialog = lazy(async () => ({ default: (await import("@/features/forms/FormFillDialog")).FormFillDialog }));
const TextSearchDialog = lazy(async () => ({ default: (await import("@/features/editor/components/TextSearchDialog")).TextSearchDialog }));
const PageOrganizerDialog = lazy(async () => ({ default: (await import("@/features/editor/components/PageOrganizerDialog")).PageOrganizerDialog }));
const PageRangeDialog = lazy(async () => ({ default: (await import("@/features/editor/components/PageRangeDialog")).PageRangeDialog }));
const SignatureDialog = lazy(async () => ({ default: (await import("@/features/editor/components/SignatureDialog")).SignatureDialog }));
const StampDialog = lazy(async () => ({ default: (await import("@/features/editor/components/StampDialog")).StampDialog }));

interface EditorWorkspaceProps {
  file: File;
  initialTool: EditorLaunchIntent;
  theme: ThemePreference;
  onThemeChange: (theme: ThemePreference) => void;
  onClose: () => void;
  onOpenAnother: (file: File, intent: EditorLaunchIntent) => void;
}

export function EditorWorkspace({ file, initialTool, theme, onThemeChange, onClose, onOpenAnother }: EditorWorkspaceProps) {
  const engineRef = useRef(new BrowserPdfEngine());
  const loadIdRef = useRef(0);
  const openedSignatureRef = useRef(false);
  const [scrollToPageId, setScrollToPageId] = useState<string | null>(null);
  const [showSignature, setShowSignature] = useState(false);
  const [showStamp, setShowStamp] = useState(false);
  const [showCrop, setShowCrop] = useState(false);
  const [documentOverlayMode, setDocumentOverlayMode] = useState<DocumentOverlayMode | null>(null);
  const [showMetadata, setShowMetadata] = useState(false);
  const [showPdfToImage, setShowPdfToImage] = useState(false);
  const [showFormFill, setShowFormFill] = useState(false);
  const [showTextSearch, setShowTextSearch] = useState(false);
  const [showCommands, setShowCommands] = useState(false);
  const [showPageOrganizer, setShowPageOrganizer] = useState(false);
  const [pageRangeMode, setPageRangeMode] = useState<"extract" | "split" | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const project = useEditorStore((state) => state.project);
  const document = useEditorStore((state) => state.document);
  const isLoading = useEditorStore((state) => state.isLoading);
  const error = useEditorStore((state) => state.error);
  const isDirty = useEditorStore((state) => state.isDirty);
  const activePageId = useEditorStore((state) => state.activePageId);
  const zoom = useEditorStore((state) => state.zoom);
  const setOpenedPdf = useEditorStore((state) => state.setOpenedPdf);
  const setLoading = useEditorStore((state) => state.setLoading);
  const setError = useEditorStore((state) => state.setError);
  const reset = useEditorStore((state) => state.reset);
  const setActivePage = useEditorStore((state) => state.setActivePage);
  const setActiveTool = useEditorStore((state) => state.setActiveTool);
  const setZoom = useEditorStore((state) => state.setZoom);
  const addAsset = useEditorStore((state) => state.addAsset);
  const addObject = useEditorStore((state) => state.addObject);
  const addObjects = useEditorStore((state) => state.addObjects);
  const updateMetadata = useEditorStore((state) => state.updateMetadata);
  const removeSelectedObjects = useEditorStore((state) => state.removeSelectedObjects);
  const rotatePage = useEditorStore((state) => state.rotatePage);
  const cropPage = useEditorStore((state) => state.cropPage);
  const duplicatePage = useEditorStore((state) => state.duplicatePage);
  const deletePage = useEditorStore((state) => state.deletePage);
  const reorderPage = useEditorStore((state) => state.reorderPage);
  const undo = useEditorStore((state) => state.undo);
  const redo = useEditorStore((state) => state.redo);

  useEffect(() => {
    const loadId = ++loadIdRef.current;
    const engine = engineRef.current;
    let cancelled = false;
    let loadedDocument: Awaited<ReturnType<BrowserPdfEngine["open"]>>["document"] | null = null;
    openedSignatureRef.current = false;
    setShowSignature(false);
    setShowStamp(false);
    setShowCrop(false);
    setDocumentOverlayMode(null);
    setShowMetadata(false);
    setShowPdfToImage(false);
    setShowFormFill(false);
    setShowTextSearch(false);
    setShowCommands(false);
    setShowPageOrganizer(false);
    setPageRangeMode(null);
    reset();
    setLoading(true);

    engine.open(file)
      .then((openedPdf) => {
        loadedDocument = openedPdf.document;
        if (cancelled || loadId !== loadIdRef.current) {
          void openedPdf.document.cleanup();
          return;
        }
        setOpenedPdf(openedPdf, toEditorTool(initialTool));
        setZoom(initialZoomForViewport(openedPdf.project.pages[0]));
        if (initialTool === "pages") {
          setShowPageOrganizer(true);
        }
        if (initialTool === "extract" || initialTool === "split") {
          setPageRangeMode(initialTool);
        }
        if (initialTool === "signature") {
          openedSignatureRef.current = true;
          setShowSignature(true);
        }
      })
      .catch((openError: unknown) => {
        if (!cancelled && loadId === loadIdRef.current) {
          setError(openError instanceof Error ? openError.message : "No pudimos abrir este PDF.");
        }
      });

    return () => {
      cancelled = true;
      if (loadedDocument) void loadedDocument.cleanup();
    };
  }, [file, initialTool, reset, setError, setLoading, setOpenedPdf]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void handleExport();
        return;
      }
      if (modifier && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo(); else undo();
        return;
      }
      if (modifier && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setShowCommands(true);
        return;
      }
      if (modifier && event.key.toLowerCase() === "f") {
        event.preventDefault();
        setShowTextSearch(true);
        return;
      }
      if (isTyping) return;
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        removeSelectedObjects();
      }
      if (event.key === "Escape") {
        setActiveTool("select");
        setShowCommands(false);
      }
      if (event.key === "0") setZoom(1);
      if (event.key === "+") setZoom(zoom + 0.1);
      if (event.key === "-") setZoom(zoom - 0.1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(null), 4_500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const handleSelectPage = useCallback((pageId: string) => {
    setActivePage(pageId);
    setScrollToPageId(pageId);
  }, [setActivePage]);

  const handleOpenPdf = (nextFile: File) => {
    if (!isPdf(nextFile)) {
      setNotice("Elige un archivo PDF para abrir otro documento.");
      return;
    }
    if (isDirty && !window.confirm("Hay cambios sin exportar. ¿Abrir otro documento de todas formas?")) return;
    onOpenAnother(nextFile, "select");
  };

  const handleImage = async (imageFile: File) => {
    const state = useEditorStore.getState();
    const page = state.project?.pages.find((candidate) => candidate.id === state.activePageId) ?? state.project?.pages[0];
    if (!page) return;
    try {
      const asset = await createLocalImageAsset(imageFile);
      addAsset(asset);
      addObject(createImageObject(page, asset));
      setNotice("Imagen añadida localmente. Arrástrala o ajusta sus propiedades.");
    } catch (imageError) {
      setNotice(imageError instanceof Error ? imageError.message : "No pudimos añadir esa imagen.");
    }
  };

  const handleSignature = (draft: SignatureDraft) => {
    const state = useEditorStore.getState();
    const page = state.project?.pages.find((candidate) => candidate.id === state.activePageId) ?? state.project?.pages[0];
    if (!page) return;
    addObject(createSignatureObject(page, draft));
    setShowSignature(false);
    setNotice("Firma visual añadida. No equivale a una firma digital certificada.");
  };

  const handleSignatureImage = async (imageFile: File) => {
    const state = useEditorStore.getState();
    const page = state.project?.pages.find((candidate) => candidate.id === state.activePageId) ?? state.project?.pages[0];
    if (!page) return;
    try {
      const asset = await createLocalImageAsset(imageFile);
      addAsset(asset);
      addObject(createSignatureImageObject(page, asset));
      setShowSignature(false);
      setNotice("Firma visual por imagen añadida. No equivale a una firma digital certificada.");
    } catch (imageError) {
      setNotice(imageError instanceof Error ? imageError.message : "No pudimos añadir esa imagen como firma.");
    }
  };

  const handleStamp = (kind: StampKind) => {
    const state = useEditorStore.getState();
    const page = state.project?.pages.find((candidate) => candidate.id === state.activePageId) ?? state.project?.pages[0];
    if (!page) return;
    addObject(createStampObject(page, kind));
    setShowStamp(false);
    setNotice("Sello visual añadido. Se incorporará como contenido permanente al exportar.");
  };

  const handleDocumentOverlay = (settings: DocumentOverlaySettings) => {
    const currentProject = useEditorStore.getState().project;
    if (!currentProject) return;
    const objects = settings.kind === "page-numbers"
      ? currentProject.pages.map((page, pageIndex) => createPageNumberObject(page, settings.format, {
        pageIndex,
        pageCount: currentProject.pages.length,
        startNumber: settings.startNumber,
        position: settings.position,
        margin: settings.margin,
        fontSize: settings.fontSize,
        color: settings.color
      }))
      : currentProject.pages.map((page) => createWatermarkObject(page, settings));
    addObjects(objects);
    setDocumentOverlayMode(null);
    setNotice(settings.kind === "page-numbers"
      ? `Añadimos números editables a ${objects.length} ${objects.length === 1 ? "página" : "páginas"}. Puedes retirarlos con un solo Deshacer.`
      : `Añadimos una marca de agua visual editable a ${objects.length} ${objects.length === 1 ? "página" : "páginas"}.`);
  };

  const handleOpenFormFill = () => {
    if (isDirty && !window.confirm("Rellenar formularios crea una copia basada en el PDF abierto originalmente. Exporta tus cambios actuales antes de continuar, porque la nueva copia sustituirá esta sesión.")) {
      return;
    }
    setShowFormFill(true);
  };

  const handleExport = useCallback(async () => {
    const state = useEditorStore.getState();
    if (!state.project || !state.sourceBytes || isExporting) return;
    setIsExporting(true);
    try {
      const bytes = await engineRef.current.export({
        project: state.project,
        sourceBytes: state.sourceBytes,
        assets: state.assets
      });
      downloadPdf(bytes, outputName(state.project.source.name));
      setNotice("Tu copia editada está lista para descargar.");
    } catch (exportError) {
      setNotice(exportError instanceof Error ? exportError.message : "No pudimos exportar este PDF.");
    } finally {
      setIsExporting(false);
    }
  }, [isExporting]);

  const handleExtractPages = async (rangeExpression: string) => {
    const state = useEditorStore.getState();
    if (!state.project || !state.sourceBytes || isExporting) return;
    setIsExporting(true);
    try {
      const { parsePageRange } = await import("@/core/pdf/PdfPageOperations");
      const indexes = parsePageRange(rangeExpression, state.project.pages.length);
      const subset = projectSubset(state.project, indexes);
      const bytes = await engineRef.current.export({ project: subset, sourceBytes: state.sourceBytes, assets: state.assets });
      downloadPdf(bytes, `${outputBaseName(state.project.source.name)}-páginas.pdf`);
      setPageRangeMode(null);
      setNotice(`Creamos un PDF nuevo con ${indexes.length} ${indexes.length === 1 ? "página" : "páginas"}.`);
    } catch (operationError) {
      setNotice(operationError instanceof Error ? operationError.message : "No pudimos extraer esas páginas.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleSplitPages = async (chunkSize: number) => {
    const state = useEditorStore.getState();
    if (!state.project || !state.sourceBytes || isExporting) return;
    setIsExporting(true);
    try {
      const groups = splitIndexes(state.project.pages.length, chunkSize);
      for (const [groupIndex, indexes] of groups.entries()) {
        const subset = projectSubset(state.project, indexes);
        const bytes = await engineRef.current.export({ project: subset, sourceBytes: state.sourceBytes, assets: state.assets });
        downloadPdf(bytes, `${outputBaseName(state.project.source.name)}-${groupIndex + 1}.pdf`);
      }
      setPageRangeMode(null);
      setNotice(`Se prepararon ${groups.length} PDFs nuevos. Es posible que el navegador te pida permitir varias descargas.`);
    } catch (operationError) {
      setNotice(operationError instanceof Error ? operationError.message : "No pudimos dividir este PDF.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleExtractPageIds = async (pageIds: readonly string[]) => {
    const state = useEditorStore.getState();
    if (!state.project || !state.sourceBytes || isExporting) return;
    const pageIdSet = new Set(pageIds);
    const indexes = state.project.pages.reduce<number[]>((result, page, index) => {
      if (pageIdSet.has(page.id)) result.push(index);
      return result;
    }, []);
    if (indexes.length === 0) {
      setNotice("Selecciona al menos una página para extraer.");
      return;
    }

    setIsExporting(true);
    try {
      const subset = projectSubset(state.project, indexes);
      const bytes = await engineRef.current.export({ project: subset, sourceBytes: state.sourceBytes, assets: state.assets });
      downloadPdf(bytes, `${outputBaseName(state.project.source.name)}-selección.pdf`);
      setShowPageOrganizer(false);
      setNotice(`Creamos un PDF nuevo con ${indexes.length} ${indexes.length === 1 ? "página" : "páginas"}.`);
    } catch (operationError) {
      setNotice(operationError instanceof Error ? operationError.message : "No pudimos extraer esas páginas.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleClose = () => {
    if (isDirty && !window.confirm("Hay cambios sin exportar. ¿Volver al inicio de todas formas?")) return;
    reset();
    onClose();
  };

  if (isLoading || !project || !document) {
    return <LoadingState fileName={file.name} error={error} onBack={handleClose} />;
  }

  const activePage = project.pages.find((page) => page.id === activePageId) ?? project.pages[0] ?? null;

  return (
    <main className="editor-shell">
      <EditorTopBar
        theme={theme}
        onThemeChange={onThemeChange}
        onHome={handleClose}
        onOpenPdf={handleOpenPdf}
        onOpenImage={handleImage}
        onOpenSignature={() => setShowSignature(true)}
        onOpenStamp={() => setShowStamp(true)}
        onOpenPageNumbers={() => setDocumentOverlayMode("page-numbers")}
        onOpenWatermark={() => setDocumentOverlayMode("watermark")}
        onOpenMetadata={() => setShowMetadata(true)}
        onOpenPdfToImage={() => setShowPdfToImage(true)}
        onOpenFormFill={handleOpenFormFill}
        onOpenTextSearch={() => setShowTextSearch(true)}
        onOpenPageOrganizer={() => setShowPageOrganizer(true)}
        onOpenCrop={() => setShowCrop(true)}
        onOpenExtract={() => setPageRangeMode("extract")}
        onOpenSplit={() => setPageRangeMode("split")}
        onExport={() => void handleExport()}
        isExporting={isExporting}
      />
      <div className="editor-main">
        <PageSidebar
          project={project}
          document={document}
          activePageId={activePageId}
          onSelect={handleSelectPage}
          onRotate={(pageId) => rotatePage(pageId, 90)}
          onDuplicate={duplicatePage}
          onDelete={(pageId) => {
            if (!deletePage(pageId)) setNotice("Un documento debe conservar al menos una página.");
          }}
          onReorder={reorderPage}
          onOrganize={() => setShowPageOrganizer(true)}
          onCrop={() => setShowCrop(true)}
          onExtract={() => setPageRangeMode("extract")}
          onSplit={() => setPageRangeMode("split")}
        />
        <DocumentViewport scrollToPageId={scrollToPageId} />
        <InspectorPanel />
      </div>
      <footer className="editor-statusbar">
        <span className="statusbar-group"><FilePenLine size={14} /> Tu archivo original no se modifica.</span>
        <span className="statusbar-group">Página {(project.pages.findIndex((page) => page.id === activePageId) + 1) || 1} de {project.pages.length}</span>
        <span className="zoom-group"><button className="icon-button" type="button" aria-label="Alejar" title="Alejar" onClick={() => setZoom(zoom - 0.1)}><Minus size={14} /></button><span className="zoom-value">{Math.round(zoom * 100)}%</span><button className="icon-button" type="button" aria-label="Acercar" title="Acercar" onClick={() => setZoom(zoom + 0.1)}><Plus size={14} /></button><button className="icon-button" type="button" aria-label="Restablecer zoom" title="Ajustar a 100%" onClick={() => setZoom(1)}><RotateCcw size={13} /></button></span>
      </footer>
      {notice && <div className="editor-notice" role="status">{notice}</div>}
      {showSignature && <Suspense fallback={null}><SignatureDialog onClose={() => setShowSignature(false)} onCreate={handleSignature} onCreateImage={(signatureFile) => void handleSignatureImage(signatureFile)} /></Suspense>}
      {showStamp && <Suspense fallback={null}><StampDialog onClose={() => setShowStamp(false)} onCreate={handleStamp} /></Suspense>}
      {documentOverlayMode && <Suspense fallback={null}><DocumentOverlayDialog
        mode={documentOverlayMode}
        pageCount={project.pages.length}
        onClose={() => setDocumentOverlayMode(null)}
        onApply={handleDocumentOverlay}
      /></Suspense>}
      {showMetadata && <Suspense fallback={null}><MetadataDialog
        metadata={project.metadata}
        onClose={() => setShowMetadata(false)}
        onApply={(metadata) => {
          updateMetadata(metadata);
          setShowMetadata(false);
          setNotice("Los metadatos Info se actualizarán en la copia exportada. No se presenta como limpieza completa de metadatos.");
        }}
      /></Suspense>}
      {showPdfToImage && <Suspense fallback={null}><PdfToImageDialog
        document={document}
        pages={project.pages}
        activePageId={activePageId}
        onClose={() => setShowPdfToImage(false)}
        onComplete={(message) => {
          setShowPdfToImage(false);
          setNotice(message);
        }}
      /></Suspense>}
      {showFormFill && <Suspense fallback={null}><FormFillDialog
        file={file}
        onClose={() => setShowFormFill(false)}
        onOpenResult={(filledFile) => {
          setShowFormFill(false);
          onOpenAnother(filledFile, "select");
        }}
      /></Suspense>}
      {showTextSearch && <Suspense fallback={null}><TextSearchDialog
        document={document}
        pages={project.pages}
        onClose={() => setShowTextSearch(false)}
        onGoToPage={handleSelectPage}
      /></Suspense>}
      {showCrop && activePage && <Suspense fallback={null}><CropDialog
        page={activePage}
        onClose={() => setShowCrop(false)}
        onApply={(cropBox) => {
          setShowCrop(false);
          try {
            cropPage(activePage.id, cropBox);
            setNotice("Recorte aplicado a la copia de trabajo. El contenido exterior no se considera eliminado de forma segura.");
          } catch (cropError) {
            setNotice(cropError instanceof Error ? cropError.message : "No pudimos aplicar el recorte a esta página.");
          }
        }}
      /></Suspense>}
      {showPageOrganizer && <Suspense fallback={null}><PageOrganizerDialog
        pages={project.pages.map((page, index) => ({
          id: page.id,
          index,
          label: page.label,
          rotation: page.rotation,
          thumbnail: <OrganizerThumbnail document={document} page={page} pageNumber={index + 1} />
        }))}
        activePageId={activePageId}
        onClose={() => setShowPageOrganizer(false)}
        onSelect={(pageId) => {
          handleSelectPage(pageId);
          setShowPageOrganizer(false);
        }}
        onReorder={reorderPage}
        onDuplicate={duplicatePage}
        onDelete={(pageId) => {
          if (!deletePage(pageId)) setNotice("Un documento debe conservar al menos una página.");
        }}
        onRotate={(pageId) => rotatePage(pageId, 90)}
        onExtract={(pageIds) => void handleExtractPageIds(pageIds)}
      /></Suspense>}
      {pageRangeMode && <Suspense fallback={null}><PageRangeDialog
        mode={pageRangeMode}
        pageCount={project.pages.length}
        onClose={() => setPageRangeMode(null)}
        onExtract={(expression) => void handleExtractPages(expression)}
        onSplit={(chunkSize) => void handleSplitPages(chunkSize)}
      /></Suspense>}
      {showCommands && <Suspense fallback={null}><CommandPalette
        open={showCommands}
        onClose={() => setShowCommands(false)}
        onChooseTool={setActiveTool}
        onOpenSignature={() => setShowSignature(true)}
        onOpenStamp={() => setShowStamp(true)}
        onOpenPageNumbers={() => setDocumentOverlayMode("page-numbers")}
        onOpenWatermark={() => setDocumentOverlayMode("watermark")}
        onOpenMetadata={() => setShowMetadata(true)}
        onOpenPdfToImage={() => setShowPdfToImage(true)}
        onOpenFormFill={handleOpenFormFill}
        onOpenTextSearch={() => setShowTextSearch(true)}
        onOpenPageOrganizer={() => setShowPageOrganizer(true)}
        onOpenCrop={() => setShowCrop(true)}
        onOpenExtract={() => setPageRangeMode("extract")}
        onOpenSplit={() => setPageRangeMode("split")}
        onUndo={undo}
        onRedo={redo}
        onExport={() => void handleExport()}
      /></Suspense>}
    </main>
  );
}

function LoadingState({ fileName, error, onBack }: { fileName: string; error: string | null; onBack: () => void }) {
  if (error) {
    return <main className="editor-error"><section className="editor-error__card"><AlertCircle size={31} color="currentColor" /><h1>No pudimos abrir este PDF</h1><p>{error}</p><button className="btn btn--primary" type="button" onClick={onBack}>Volver al inicio</button></section></main>;
  }
  return <main className="loading-screen"><section className="loading-card"><span className="loading-spinner" aria-hidden="true" /><strong>Abriendo {fileName}</strong><span>El documento se procesa en este dispositivo.</span></section></main>;
}

function toEditorTool(intent: EditorLaunchIntent): EditorTool {
  if (intent === "pages" || intent === "signature" || intent === "image" || intent === "extract" || intent === "split") {
    return "select";
  }
  return intent;
}

/**
 * Fit the first page into the available editor column on compact layouts.
 * Desktop keeps the deliberate 100% initial view; users can always adjust
 * zoom afterwards with the visible controls or Ctrl/Cmd + wheel.
 */
function initialZoomForViewport(page: PDFPageModel | undefined): number {
  if (!page || typeof window === "undefined" || window.innerWidth > 820) return 1;
  const crop = page.cropBox ?? { x: 0, y: 0, width: page.size.width, height: page.size.height };
  const isQuarterTurn = page.rotation === 90 || page.rotation === 270;
  const visiblePageWidth = isQuarterTurn ? crop.height : crop.width;
  const compactViewportPadding = window.innerWidth <= 570
    ? 24
    : 155 + 2 * Math.min(56, Math.max(18, window.innerWidth * 0.04));
  const availableWidth = Math.max(240, window.innerWidth - compactViewportPadding);
  return Math.min(1, Math.max(0.25, availableWidth / visiblePageWidth));
}

function isPdf(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function outputName(sourceName: string): string {
  return `${outputBaseName(sourceName)}-editado.pdf`;
}

function outputBaseName(sourceName: string): string {
  return sourceName.replace(/\.pdf$/i, "") || "documento";
}

function projectSubset(project: PDFProject, indexes: readonly number[]): PDFProject {
  const pages = indexes.map((index) => project.pages[index]).filter((page): page is NonNullable<typeof page> => Boolean(page));
  if (pages.length !== indexes.length || pages.length === 0) {
    throw new Error("Las páginas elegidas no están disponibles en el documento actual.");
  }
  const selectedPageIds = new Set(pages.map((page) => page.id));
  return { ...project, pages, overlays: project.overlays.filter((overlay) => selectedPageIds.has(overlay.pageId)) };
}

function splitIndexes(pageCount: number, chunkSize: number): number[][] {
  if (!Number.isSafeInteger(chunkSize) || chunkSize < 1 || chunkSize > pageCount) {
    throw new Error("Elige un número válido de páginas por archivo.");
  }
  const groups: number[][] = [];
  for (let start = 0; start < pageCount; start += chunkSize) {
    groups.push(Array.from({ length: Math.min(chunkSize, pageCount - start) }, (_, index) => start + index));
  }
  return groups;
}

function OrganizerThumbnail({
  document,
  page,
  pageNumber
}: {
  document: PDFDocumentProxy;
  page: PDFPageModel;
  pageNumber: number;
}) {
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isRendered, setIsRendered] = useState(false);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return undefined;
    if (!("IntersectionObserver" in window)) {
      setIsVisible(true);
      return undefined;
    }
    const observer = new IntersectionObserver(([entry]) => setIsVisible(Boolean(entry?.isIntersecting)), { rootMargin: "320px 0px" });
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible || !canvasRef.current) return undefined;
    let disposed = false;
    setIsRendered(false);
    organizerThumbnailEngine
      .renderPage(document, page, canvasRef.current, { zoom: 0.2, devicePixelRatio: 1 })
      .then(() => { if (!disposed) setIsRendered(true); })
      .catch(() => { if (!disposed) setIsRendered(false); });
    return () => { disposed = true; };
  }, [document, isVisible, page]);

  return (
    <span ref={wrapperRef} className="page-organizer__thumbnail">
      {!isRendered && <span className="page-organizer__placeholder" aria-hidden="true">{pageNumber}</span>}
      <canvas ref={canvasRef} aria-hidden="true" />
    </span>
  );
}

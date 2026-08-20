import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { CoordinateTransformer } from "@/core/coordinates/CoordinateTransformer";
import { BrowserPdfEngine, type LocalAsset } from "@/core/pdf/PdfEngine";
import { useEditorStore } from "@/features/editor/store/editorStore";
import {
  createDrawingObject,
  createHighlightObject,
  createNoteObject,
  createShapeObject,
  createTextObject,
  getPageBounds
} from "@/features/editor/utils/editorObjects";
import type {
  DrawingPoint,
  EditorObject,
  PDFPageModel,
  PDFPoint,
  SignatureContent,
  SignatureEditorObject
} from "@/types/pdf";

type PlaceableObject = Exclude<EditorObject, Extract<EditorObject, { type: "drawing" }>>;
type PageBounds = ReturnType<typeof getPageBounds>;
type DrawnSignatureObject = SignatureEditorObject & {
  signature: Extract<SignatureContent, { kind: "drawn" }>;
};

interface DocumentViewportProps {
  scrollToPageId: string | null;
}

const renderEngine = new BrowserPdfEngine();

export function DocumentViewport({ scrollToPageId }: DocumentViewportProps) {
  const project = useEditorStore((state) => state.project);
  const document = useEditorStore((state) => state.document);
  const zoom = useEditorStore((state) => state.zoom);
  const setZoom = useEditorStore((state) => state.setZoom);
  const setActivePage = useEditorStore((state) => state.setActivePage);
  const viewportRef = useRef<HTMLDivElement>(null);
  const stageRefs = useRef(new Map<string, HTMLDivElement>());

  useEffect(() => {
    if (!scrollToPageId) return;
    const stage = stageRefs.current.get(scrollToPageId);
    stage?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
  }, [scrollToPageId]);

  if (!project || !document) {
    return null;
  }

  return (
    <section
      ref={viewportRef}
      className="document-viewport"
      aria-label="Vista del documento"
      onWheel={(event) => {
        if (!event.ctrlKey && !event.metaKey) return;
        event.preventDefault();
        const direction = event.deltaY > 0 ? -0.1 : 0.1;
        setZoom(Number((zoom + direction).toFixed(2)));
      }}
    >
      <div className="document-viewport__inner">
        {project.pages.map((page) => (
          <PdfPageStage
            key={page.id}
            page={page}
            document={document}
            zoom={zoom}
            viewportRoot={viewportRef.current}
            onStageRef={(node) => {
              if (node) stageRefs.current.set(page.id, node);
              else stageRefs.current.delete(page.id);
            }}
            onActivate={() => setActivePage(page.id)}
          />
        ))}
      </div>
    </section>
  );
}

interface PdfPageStageProps {
  page: PDFPageModel;
  document: Parameters<BrowserPdfEngine["renderPage"]>[0];
  zoom: number;
  viewportRoot: HTMLDivElement | null;
  onStageRef: (node: HTMLDivElement | null) => void;
  onActivate: () => void;
}

function PdfPageStage({ page, document, zoom, viewportRoot, onStageRef, onActivate }: PdfPageStageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isRendered, setIsRendered] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const transformer = useMemo(() => CoordinateTransformer.fromPage(page, { zoom }), [page, zoom]);
  const canvasSize = transformer.cssPageSize;
  const activeTool = useEditorStore((state) => state.activeTool);
  const activePageId = useEditorStore((state) => state.activePageId);
  const selectedObjectIds = useEditorStore((state) => state.selectedObjectIds);
  const project = useEditorStore((state) => state.project);
  const assets = useEditorStore((state) => state.assets);
  const selectObject = useEditorStore((state) => state.selectObject);
  const addObject = useEditorStore((state) => state.addObject);
  const setActiveTool = useEditorStore((state) => state.setActiveTool);
  const setActivePage = useEditorStore((state) => state.setActivePage);
  const [draftPoints, setDraftPoints] = useState<DrawingPoint[]>([]);

  useEffect(() => {
    const node = stageRef.current;
    if (!node) return undefined;

    if (!("IntersectionObserver" in window)) {
      setIsVisible(true);
      return undefined;
    }

    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(Boolean(entry?.isIntersecting)),
      { root: viewportRoot, rootMargin: "600px 0px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [viewportRoot]);

  useEffect(() => {
    if (!isVisible || !canvasRef.current) return undefined;
    let disposed = false;
    setRenderError(null);
    renderEngine.renderPage(document, page, canvasRef.current, { zoom })
      .then(() => {
        if (!disposed) setIsRendered(true);
      })
      .catch((error: unknown) => {
        if (!disposed) setRenderError(error instanceof Error ? error.message : "No pudimos mostrar esta página.");
      });
    return () => { disposed = true; };
  }, [document, isVisible, page, zoom]);

  const objects = project?.overlays.filter((object) => object.pageId === page.id) ?? [];
  const drawPath = pointsToSvgPath(draftPoints, transformer);

  const getPdfPoint = (event: ReactPointerEvent<Element>): PDFPoint | null => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return transformer.cssToPdf({ x: event.clientX - rect.left, y: event.clientY - rect.top });
  };

  const createAtPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || event.button !== 0) return;
    setActivePage(page.id);
    onActivate();
    const point = getPdfPoint(event);
    if (!point) return;

    if (activeTool === "text") {
      addObject(createTextObject(page, point));
      return;
    }
    if (activeTool === "shape") {
      addObject(createShapeObject(page, point));
      return;
    }
    if (activeTool === "highlight") {
      addObject(createHighlightObject(page, point));
      return;
    }
    if (activeTool === "note") {
      addObject(createNoteObject(page, point));
      return;
    }
    if (activeTool === "select") {
      selectObject(null);
    }
  };

  const beginDrawing = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (activeTool !== "draw" || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    setActivePage(page.id);
    onActivate();
    const point = getPdfPoint(event);
    if (!point) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraftPoints([{ ...point, pressure: event.pressure || undefined }]);
  };

  const continueDrawing = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (activeTool !== "draw" || draftPoints.length === 0) return;
    const point = getPdfPoint(event);
    if (!point) return;
    setDraftPoints((points) => [...points, { ...point, pressure: event.pressure || undefined }]);
  };

  const finishDrawing = () => {
    if (draftPoints.length < 2) {
      setDraftPoints([]);
      return;
    }
    const drawing = createDrawingObject(page.id, draftPoints);
    if (drawing) addObject(drawing);
    setDraftPoints([]);
    setActiveTool("select");
  };

  return (
    <div
      ref={(node) => {
        stageRef.current = node;
        onStageRef(node);
      }}
      className={`page-stage ${activePageId === page.id ? "is-active-page" : ""}`}
      style={{ width: canvasSize.width, height: canvasSize.height }}
      onPointerDown={createAtPointer}
      aria-label={`Página ${page.label ?? page.sourcePageIndex + 1}`}
    >
      <canvas ref={canvasRef} aria-hidden="true" />
      {!isRendered && !renderError && <div className="page-stage__loading">Cargando página…</div>}
      {renderError && <div className="page-stage__loading">{renderError}</div>}
      <div className="overlay-layer">
        {objects.filter(isPlaceableObject).map((object) => (
          <EditorObjectView
            key={object.id}
            object={object}
            page={page}
            transformer={transformer}
            asset={object.type === "image"
              ? assets.get(object.assetId)
              : object.type === "signature" && object.signature.kind === "image"
                ? assets.get(object.signature.assetId)
                : undefined}
            isSelected={selectedObjectIds.includes(object.id)}
          />
        ))}
      </div>
      <svg
        className={`drawing-layer ${activeTool === "draw" ? "is-drawing" : ""}`}
        viewBox={`0 0 ${canvasSize.width} ${canvasSize.height}`}
        onPointerDown={beginDrawing}
        onPointerMove={continueDrawing}
        onPointerUp={finishDrawing}
        onPointerCancel={finishDrawing}
      >
        {objects.filter((object): object is EditorObject & ({ type: "drawing" } | SignatureEditorObject) => object.type === "drawing" || (object.type === "signature" && object.signature.kind === "drawn")).map((object) => (
          <PersistedDrawing key={object.id} object={object} transformer={transformer} />
        ))}
        {drawPath && <path className="drawing-path" d={drawPath} stroke="#2854db" strokeWidth={2.5 * transformer.scale} />}
      </svg>
    </div>
  );
}

interface PersistedDrawingProps {
  object: Extract<EditorObject, { type: "drawing" }> | SignatureEditorObject;
  transformer: CoordinateTransformer;
}

function PersistedDrawing({ object, transformer }: PersistedDrawingProps) {
  const paths = object.type === "drawing" ? [object.points] : object.signature.kind === "drawn" ? object.signature.strokes : [];
  const stroke = object.type === "drawing" ? object.stroke : object.signature.kind === "drawn" ? object.signature.stroke : null;
  if (!stroke) return null;
  return (
    <g opacity={object.opacity}>
      {paths.map((points, index) => {
        const path = pointsToSvgPath(rotatePointsForObject(points, object), transformer);
        return path ? <path key={index} className="drawing-path" d={path} stroke={stroke.color} strokeWidth={stroke.width * transformer.scale} /> : null;
      })}
    </g>
  );
}

interface EditorObjectViewProps {
  object: PlaceableObject;
  page: PDFPageModel;
  transformer: CoordinateTransformer;
  asset?: LocalAsset;
  isSelected: boolean;
}

function EditorObjectView({ object, page, transformer, asset, isSelected }: EditorObjectViewProps) {
  const activeTool = useEditorStore((state) => state.activeTool);
  const selectObject = useEditorStore((state) => state.selectObject);
  const updateObject = useEditorStore((state) => state.updateObject);
  const updateObjectLive = useEditorStore((state) => state.updateObjectLive);
  const beginTransaction = useEditorStore((state) => state.beginTransaction);
  const commitTransaction = useEditorStore((state) => state.commitTransaction);
  const rect = transformer.pdfRectToCss(object);
  const cssRotation = transformer.pdfRotationToCss(object.rotation);
  const dragRef = useRef<{
    mode: "move" | "resize";
    startClientX: number;
    startClientY: number;
    object: EditorObject;
  } | null>(null);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const deltaX = (event.clientX - drag.startClientX) / transformer.scale;
      const deltaY = -(event.clientY - drag.startClientY) / transformer.scale;
      const bounds = getPageBounds(page);
      updateObjectLive(object.id, (current) => {
        return nextDraggedObject(current, drag.object, drag.mode, deltaX, deltaY, bounds);
      });
    };
    const onPointerUp = () => {
      if (!dragRef.current) return;
      dragRef.current = null;
      commitTransaction();
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [commitTransaction, object.id, page, transformer, updateObjectLive]);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || activeTool !== "select" || object.locked) return;
    event.stopPropagation();
    selectObject(object.id);
    const node = event.currentTarget.getBoundingClientRect();
    const isResize = isSelected && event.clientX >= node.right - 16 && event.clientY >= node.bottom - 16;
    dragRef.current = {
      mode: isResize ? "resize" : "move",
      startClientX: event.clientX,
      startClientY: event.clientY,
      object
    };
    beginTransaction();
  };

  const visualStyle: CSSProperties = {
    left: rect.x,
    top: rect.y,
    width: rect.width,
    height: rect.height,
    opacity: object.opacity,
    zIndex: object.zIndex,
    transform: cssRotation ? `rotate(${cssRotation}deg)` : undefined
  };

  if (object.type === "text") {
    return (
      <div className={`editor-object editor-object--text ${isSelected ? "is-selected" : ""}`} style={{ ...visualStyle, color: object.color, fontFamily: object.fontFamily, fontSize: object.fontSize * transformer.scale, fontWeight: object.fontWeight, fontStyle: object.fontStyle, textDecoration: object.textDecoration, textAlign: object.textAlign, lineHeight: object.lineHeight * transformer.scale, letterSpacing: object.letterSpacing * transformer.scale, backgroundColor: object.backgroundColor }} onPointerDown={onPointerDown}>
        {isSelected ? (
          <textarea
            value={object.text}
            aria-label="Texto añadido"
            onPointerDown={(event) => event.stopPropagation()}
            onChange={(event) => updateObject(object.id, (current) => current.type === "text" ? { ...current, text: event.target.value } : current)}
          />
        ) : <span>{object.text}</span>}
      </div>
    );
  }

  if (object.type === "note") {
    return (
      <div
        className={`editor-object editor-object--note ${isSelected ? "is-selected" : ""}`}
        style={{ ...visualStyle, backgroundColor: object.color, color: object.textColor, fontSize: object.fontSize * transformer.scale }}
        onPointerDown={onPointerDown}
        aria-label="Nota visual añadida"
      >
        {isSelected ? (
          <textarea
            value={object.content}
            aria-label="Contenido de la nota"
            onPointerDown={(event) => event.stopPropagation()}
            onChange={(event) => updateObject(object.id, (current) => current.type === "note" ? { ...current, content: event.target.value } : current)}
          />
        ) : <span>{object.content}</span>}
      </div>
    );
  }

  if (object.type === "image") {
    return (
      <div className={`editor-object editor-object--image ${isSelected ? "is-selected" : ""}`} style={visualStyle} onPointerDown={onPointerDown}>
        {asset ? <img src={asset.dataUrl} alt="Imagen añadida por el usuario" draggable={false} /> : <span className="sr-only">Imagen no disponible</span>}
      </div>
    );
  }

  if (object.type === "shape") {
    const style: CSSProperties = {
      ...visualStyle,
      border: object.stroke ? `${Math.max(1, object.stroke.width * transformer.scale)}px solid ${object.stroke.color}` : "none",
      borderRadius: object.shape === "circle" || object.shape === "ellipse" ? "50%" : object.cornerRadius ? object.cornerRadius * transformer.scale : 0,
      background: object.fillColor ?? "transparent"
    };
    return <div className={`editor-object editor-object--shape ${isSelected ? "is-selected" : ""}`} style={style} onPointerDown={onPointerDown} aria-label="Forma añadida" />;
  }

  if (object.type === "stamp") {
    const stampStyle: CSSProperties = {
      ...visualStyle,
      boxSizing: "border-box",
      border: `${Math.max(1, object.stamp.borderWidth * transformer.scale)}px solid ${object.stamp.color}`,
      borderRadius: Math.max(3, 4 * transformer.scale),
      background: object.stamp.style === "filled" ? object.stamp.fillColor ?? "transparent" : "transparent",
      color: object.stamp.textColor,
      fontSize: Math.max(9, Math.min(object.height * 0.45, object.width / Math.max(1, object.stamp.label.length) * 1.28) * transformer.scale)
    };
    return (
      <div
        className={`editor-object editor-object--stamp ${isSelected ? "is-selected" : ""}`}
        style={stampStyle}
        onPointerDown={onPointerDown}
        aria-label={`Sello visual: ${object.stamp.label}`}
      >
        {object.stamp.label}
      </div>
    );
  }

  if (object.signature.kind === "typed" || object.signature.kind === "initials") {
    return <div className={`editor-object editor-object--text ${isSelected ? "is-selected" : ""}`} style={{ ...visualStyle, color: object.signature.color, fontFamily: "cursive", fontSize: Math.max(12, object.height * 0.62 * transformer.scale) }} onPointerDown={onPointerDown}>{object.signature.text}</div>;
  }

  if (object.signature.kind === "image") {
    const signatureAsset = asset;
    return <div className={`editor-object editor-object--signature ${isSelected ? "is-selected" : ""}`} style={visualStyle} onPointerDown={onPointerDown}>{signatureAsset ? <img src={signatureAsset.dataUrl} alt="Firma visual" draggable={false} /> : null}</div>;
  }

  if (object.signature.kind === "drawn") {
    return <div className={`editor-object editor-object--signature ${isSelected ? "is-selected" : ""}`} style={visualStyle} onPointerDown={onPointerDown} aria-label="Firma visual dibujada" />;
  }

  return null;
}

function pointsToSvgPath(points: readonly PDFPoint[], transformer: CoordinateTransformer): string {
  return points.map((point, index) => {
    const css = transformer.pdfToCss(point);
    return `${index === 0 ? "M" : "L"}${css.x.toFixed(2)} ${css.y.toFixed(2)}`;
  }).join(" ");
}

function nextDraggedObject(
  current: EditorObject,
  original: EditorObject,
  mode: "move" | "resize",
  deltaX: number,
  deltaY: number,
  bounds: PageBounds
): EditorObject {
  if (isDrawnSignatureObject(current) && isDrawnSignatureObject(original)) {
    return nextDraggedDrawnSignature(current, original, mode, deltaX, deltaY, bounds);
  }

  return mode === "move"
    ? {
        ...current,
        x: clamp(original.x + deltaX, bounds.left, bounds.left + bounds.width - current.width),
        y: clamp(original.y + deltaY, bounds.bottom, bounds.bottom + bounds.height - current.height)
      }
    : {
        ...current,
        width: clamp(original.width + deltaX, 16, bounds.left + bounds.width - current.x),
        height: clamp(original.height - deltaY, 16, bounds.bottom + bounds.height - original.y)
      };
}

function nextDraggedDrawnSignature(
  current: DrawnSignatureObject,
  original: DrawnSignatureObject,
  mode: "move" | "resize",
  deltaX: number,
  deltaY: number,
  bounds: PageBounds
): DrawnSignatureObject {
  if (mode === "move") {
    const x = clamp(original.x + deltaX, bounds.left, bounds.left + bounds.width - original.width);
    const y = clamp(original.y + deltaY, bounds.bottom, bounds.bottom + bounds.height - original.height);
    const shiftX = x - original.x;
    const shiftY = y - original.y;
    return {
      ...current,
      x,
      y,
      signature: {
        ...current.signature,
        strokes: original.signature.strokes.map((stroke) => stroke.map((point) => ({
          ...point,
          x: point.x + shiftX,
          y: point.y + shiftY
        })))
      }
    };
  }

  const width = clamp(original.width + deltaX, 16, bounds.left + bounds.width - original.x);
  const height = clamp(original.height - deltaY, 16, bounds.bottom + bounds.height - original.y);
  const scaleX = width / Math.max(1, original.width);
  const scaleY = height / Math.max(1, original.height);
  return {
    ...current,
    x: original.x,
    y: original.y,
    width,
    height,
    signature: {
      ...current.signature,
      strokes: original.signature.strokes.map((stroke) => stroke.map((point) => ({
        ...point,
        x: original.x + (point.x - original.x) * scaleX,
        y: original.y + (point.y - original.y) * scaleY
      })))
    }
  };
}

function rotatePointsForObject(
  points: readonly PDFPoint[],
  object: { x: number; y: number; width: number; height: number; rotation: number }
): PDFPoint[] {
  const normalizedRotation = ((object.rotation % 360) + 360) % 360;
  if (normalizedRotation === 0) {
    return [...points];
  }

  const radians = normalizedRotation * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const centerX = object.x + object.width / 2;
  const centerY = object.y + object.height / 2;
  return points.map((point) => {
    const localX = point.x - centerX;
    const localY = point.y - centerY;
    return {
      ...point,
      x: centerX + localX * cos - localY * sin,
      y: centerY + localX * sin + localY * cos
    };
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function isDrawnSignatureObject(object: EditorObject): object is DrawnSignatureObject {
  return object.type === "signature" && object.signature.kind === "drawn";
}

function isPlaceableObject(object: EditorObject): object is PlaceableObject {
  return object.type !== "drawing";
}

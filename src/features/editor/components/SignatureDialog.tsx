import { ImageUp, PenLine, Type, X } from "lucide-react";
import {
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState
} from "react";
import type { DrawnSignatureDraft, SignatureDraft } from "@/features/editor/utils/editorObjects";

export interface SignatureDialogProps {
  /** Closes the dialog without creating a signature. */
  onClose: () => void;
  /** Receives a serializable, visual-signature draft. The parent owns insertion. */
  onCreate: (draft: SignatureDraft) => void;
  /**
   * Receives a local raster file chosen as a visual signature. It is optional
   * so callers that only support drawn/typed signatures keep their current flow.
   */
  onCreateImage?: (file: File) => void;
}

type SignatureMode = "draw" | "type" | "image";
type SignaturePoint = DrawnSignatureDraft["strokes"][number][number];

interface SelectedSignatureImage {
  file: File;
  previewUrl: string;
}

const SIGNATURE_COLOR = "#172033";
const STROKE_WIDTH = 2.5;
const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp";
const MAX_SIGNATURE_IMAGE_BYTES = 10 * 1024 * 1024;
const SUPPORTED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const SUPPORTED_IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp"]);

/**
 * Dialog for creating a visual signature. It deliberately has no editor-store
 * dependency: callers decide how and where the returned draft or image is inserted.
 */
export function SignatureDialog({ onClose, onCreate, onCreateImage }: SignatureDialogProps) {
  const [mode, setMode] = useState<SignatureMode>("draw");
  const [strokes, setStrokes] = useState<DrawnSignatureDraft["strokes"]>([]);
  const [typedName, setTypedName] = useState("");
  const [selectedImage, setSelectedImage] = useState<SelectedSignatureImage | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const imageButtonRef = useRef<HTMLButtonElement | null>(null);
  const typedInputRef = useRef<HTMLInputElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const typedInputId = useId();
  const drawTabId = useId();
  const typeTabId = useId();
  const imageTabId = useId();
  const drawPanelId = useId();
  const typePanelId = useId();
  const imagePanelId = useId();
  const canUploadImage = typeof onCreateImage === "function";

  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    drawSignature(canvas, strokes);
  }, [strokes]);

  useEffect(() => {
    redrawCanvas();

    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === "undefined") {
      return undefined;
    }

    const observer = new ResizeObserver(redrawCanvas);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [mode, redrawCanvas]);

  useEffect(() => {
    previouslyFocusedRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;

    return () => {
      const elementToRestore = previouslyFocusedRef.current;
      window.requestAnimationFrame(() => {
        if (elementToRestore?.isConnected) {
          elementToRestore.focus();
        }
      });
    };
  }, []);

  useEffect(() => {
    const animationFrame = window.requestAnimationFrame(() => {
      if (mode === "type") {
        typedInputRef.current?.focus();
        return;
      }

      if (mode === "image") {
        imageButtonRef.current?.focus();
        return;
      }

      canvasRef.current?.focus();
    });

    return () => window.cancelAnimationFrame(animationFrame);
  }, [mode]);

  useEffect(() => {
    return () => {
      if (selectedImage) {
        URL.revokeObjectURL(selectedImage.previewUrl);
      }
    };
  }, [selectedImage]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const getPointerPoint = (event: ReactPointerEvent<HTMLCanvasElement>): SignaturePoint => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: clamp((event.clientX - bounds.left) / Math.max(bounds.width, 1), 0, 1),
      y: clamp((event.clientY - bounds.top) / Math.max(bounds.height, 1), 0, 1)
    };
  };

  const appendPoint = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const point = getPointerPoint(event);
    setStrokes((currentStrokes) => {
      const activeStroke = currentStrokes.at(-1);
      if (!activeStroke) {
        return currentStrokes;
      }

      const previousPoint = activeStroke.at(-1);
      if (previousPoint && pointsAreNear(previousPoint, point)) {
        return currentStrokes;
      }

      return [...currentStrokes.slice(0, -1), [...activeStroke, point]];
    });
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    activePointerIdRef.current = event.pointerId;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setStrokes((currentStrokes) => [...currentStrokes, [getPointerPoint(event)]]);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (activePointerIdRef.current !== event.pointerId) {
      return;
    }

    event.preventDefault();
    appendPoint(event);
  };

  const finishStroke = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (activePointerIdRef.current !== event.pointerId) {
      return;
    }

    appendPoint(event);
    activePointerIdRef.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
  };

  const selectMode = (nextMode: SignatureMode) => {
    setMode(nextMode);
    if (nextMode === "image") {
      setImageError(null);
    }
  };

  const handleImageInput = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";

    if (!file) {
      return;
    }

    const validationError = validateSignatureImage(file);
    if (validationError) {
      setImageError(validationError);
      return;
    }

    setImageError(null);
    setSelectedImage({
      file,
      previewUrl: URL.createObjectURL(file)
    });
  };

  const handleImagePreviewError = () => {
    setSelectedImage(null);
    setImageError("No se pudo abrir esa imagen. Elige un PNG, JPEG o WebP válido.");
  };

  const handleDialogKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key !== "Tab") {
      return;
    }

    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }

    const focusableElements = getFocusableElements(dialog);
    if (focusableElements.length === 0) {
      return;
    }

    const firstElement = focusableElements[0];
    const lastElement = focusableElements.at(-1);
    if (!firstElement || !lastElement) {
      return;
    }

    if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault();
      lastElement.focus();
      return;
    }

    if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  };

  const handleCreate = () => {
    if (mode === "image") {
      if (selectedImage && onCreateImage) {
        onCreateImage(selectedImage.file);
      }
      return;
    }

    if (mode === "type") {
      const text = typedName.trim();
      if (!text) {
        return;
      }

      onCreate({ kind: "typed", text, color: SIGNATURE_COLOR });
      return;
    }

    const drawableStrokes = strokes.filter((stroke) => stroke.length > 1);
    if (drawableStrokes.length === 0) {
      return;
    }

    onCreate({ kind: "drawn", strokes: drawableStrokes, color: SIGNATURE_COLOR });
  };

  const canCreate = mode === "image"
    ? selectedImage !== null && canUploadImage
    : mode === "type"
      ? typedName.trim().length > 0
      : strokes.some((stroke) => stroke.length > 1);

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        ref={dialogRef}
        className="modal signature-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="signature-dialog-title"
        onKeyDown={handleDialogKeyDown}
      >
        <header className="modal__header">
          <h2 id="signature-dialog-title">Crear firma</h2>
          <button className="icon-button" type="button" aria-label="Cerrar diálogo" onClick={onClose}>
            <X size={17} aria-hidden="true" />
          </button>
        </header>

        <div className="modal__body">
          <p className="inspector__hint" id="signature-dialog-disclaimer">
            Esta es una firma visual. No crea, certifica ni verifica una firma digital criptográfica.
          </p>

          <div className="signature-tabs" role="tablist" aria-label="Método para crear la firma">
            <button
              className={"signature-tab " + (mode === "draw" ? "is-active" : "")}
              type="button"
              role="tab"
              id={drawTabId}
              aria-controls={drawPanelId}
              aria-selected={mode === "draw"}
              onClick={() => selectMode("draw")}
            >
              <PenLine size={15} aria-hidden="true" />
              Dibujar
            </button>
            <button
              className={"signature-tab " + (mode === "type" ? "is-active" : "")}
              type="button"
              role="tab"
              id={typeTabId}
              aria-controls={typePanelId}
              aria-selected={mode === "type"}
              onClick={() => selectMode("type")}
            >
              <Type size={15} aria-hidden="true" />
              Escribir
            </button>
            {canUploadImage && (
              <button
                className={"signature-tab " + (mode === "image" ? "is-active" : "")}
                type="button"
                role="tab"
                id={imageTabId}
                aria-controls={imagePanelId}
                aria-selected={mode === "image"}
                onClick={() => selectMode("image")}
              >
                <ImageUp size={15} aria-hidden="true" />
                Imagen
              </button>
            )}
          </div>

          {mode === "draw" ? (
            <div id={drawPanelId} role="tabpanel" aria-labelledby={drawTabId} aria-describedby="signature-dialog-disclaimer">
              <canvas
                ref={canvasRef}
                className="signature-canvas"
                tabIndex={0}
                aria-label="Área para dibujar tu firma"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={finishStroke}
                onPointerCancel={finishStroke}
              />
              <button
                className="signature-dialog__clear"
                type="button"
                onClick={() => setStrokes([])}
                disabled={strokes.length === 0}
              >
                Limpiar firma
              </button>
            </div>
          ) : null}

          {mode === "type" ? (
            <div id={typePanelId} role="tabpanel" aria-labelledby={typeTabId} aria-describedby="signature-dialog-disclaimer">
              <label className="field-label" htmlFor={typedInputId}>Tu nombre</label>
              <input
                ref={typedInputRef}
                id={typedInputId}
                className="field-input"
                type="text"
                value={typedName}
                onChange={(event) => setTypedName(event.target.value)}
                placeholder="Escribe tu nombre"
                autoComplete="name"
              />
              <div className="signature-preview" aria-live="polite">
                {typedName.trim() || "Tu firma"}
              </div>
            </div>
          ) : null}

          {mode === "image" && canUploadImage ? (
            <div id={imagePanelId} className="signature-upload" role="tabpanel" aria-labelledby={imageTabId} aria-describedby="signature-dialog-disclaimer">
              <input
                ref={imageInputRef}
                hidden
                tabIndex={-1}
                aria-hidden="true"
                type="file"
                accept={IMAGE_ACCEPT}
                onChange={handleImageInput}
              />
              <button
                ref={imageButtonRef}
                className="btn signature-upload__button"
                type="button"
                onClick={() => imageInputRef.current?.click()}
              >
                <ImageUp size={16} aria-hidden="true" />
                Elegir PNG, JPEG o WebP
              </button>
              <p className="signature-upload__hint">Solo se usa la imagen que eliges en este dispositivo. Máximo 10 MB.</p>
              {selectedImage ? (
                <figure className="signature-image-preview">
                  <img
                    src={selectedImage.previewUrl}
                    alt="Vista previa de la imagen de firma seleccionada"
                    onError={handleImagePreviewError}
                  />
                  <figcaption>{selectedImage.file.name} · {formatFileSize(selectedImage.file.size)}</figcaption>
                </figure>
              ) : (
                <div className="signature-image-preview signature-image-preview--empty" aria-live="polite">
                  La vista previa aparecerá aquí.
                </div>
              )}
              {imageError ? <p className="inline-error" role="alert">{imageError}</p> : null}
            </div>
          ) : null}
        </div>

        <footer className="modal__footer">
          <button className="btn" type="button" onClick={onClose}>Cancelar</button>
          <button className="btn btn--primary" type="button" onClick={handleCreate} disabled={!canCreate}>
            Crear firma
          </button>
        </footer>
      </section>
    </div>
  );
}

function drawSignature(canvas: HTMLCanvasElement, strokes: DrawnSignatureDraft["strokes"]): void {
  const bounds = canvas.getBoundingClientRect();
  if (bounds.width <= 0 || bounds.height <= 0) {
    return;
  }

  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(bounds.width * pixelRatio));
  const height = Math.max(1, Math.round(bounds.height * pixelRatio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }

  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, bounds.width, bounds.height);
  context.strokeStyle = SIGNATURE_COLOR;
  context.lineWidth = STROKE_WIDTH;
  context.lineCap = "round";
  context.lineJoin = "round";

  for (const stroke of strokes) {
    if (stroke.length < 2) {
      continue;
    }

    const firstPoint = stroke[0];
    if (!firstPoint) {
      continue;
    }

    context.beginPath();
    context.moveTo(firstPoint.x * bounds.width, firstPoint.y * bounds.height);
    for (const point of stroke.slice(1)) {
      context.lineTo(point.x * bounds.width, point.y * bounds.height);
    }
    context.stroke();
  }
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      "button:not([disabled]), input:not([disabled]):not([hidden]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])"
    )
  ).filter((element) => !element.hasAttribute("hidden") && element.getAttribute("aria-hidden") !== "true");
}

function validateSignatureImage(file: File): string | null {
  const extension = file.name.split(".").at(-1)?.toLowerCase();
  const hasSupportedType = SUPPORTED_IMAGE_TYPES.has(file.type.toLowerCase());
  const hasSupportedExtension = extension ? SUPPORTED_IMAGE_EXTENSIONS.has(extension) : false;

  if (!hasSupportedType && !hasSupportedExtension) {
    return "Elige una imagen PNG, JPEG o WebP.";
  }

  if (file.size === 0) {
    return "La imagen está vacía. Elige otro archivo.";
  }

  if (file.size > MAX_SIGNATURE_IMAGE_BYTES) {
    return "La imagen supera el límite de 10 MB. Elige una versión más pequeña.";
  }

  return null;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return (bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0) + " KB";
  }

  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function pointsAreNear(first: SignaturePoint, second: SignaturePoint): boolean {
  return Math.abs(first.x - second.x) < 0.001 && Math.abs(first.y - second.y) < 0.001;
}

import { FileImage, FilePlus2, LoaderCircle, ShieldCheck, Trash2, Upload, X } from "lucide-react";
import {
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
  type RefObject,
  useEffect,
  useId,
  useRef,
  useState
} from "react";
import {
  createPdfFromImages,
  createPdfFromText,
  type ImagePageOrientation,
  type PdfPageSizePreset,
  type PdfPageOrientation
} from "@/core/pdf/PdfConversion";
import "@/styles/conversion.css";

export interface ConversionDialogProps {
  /** Images create one PDF page per PNG/JPEG. Text accepts typed content or a UTF-8 .txt file. */
  mode: "images" | "text";
  onClose: () => void;
  /** Receives a newly-created local PDF so the caller can open it in the editor. */
  onOpenResult: (file: File) => void;
}

type WorkState = "idle" | "reading" | "generating";
type SelectedTextFile = { name: string; mimeType: string };

const IMAGE_ACCEPT = "image/png,image/jpeg,.png,.jpg,.jpeg";
const TEXT_ACCEPT = "text/plain,.txt";

/**
 * Local PNG/JPEG and UTF-8 text converter. It intentionally has no WebP,
 * OCR, or document-format fallbacks: every visible action maps to a local
 * PdfConversion operation that can produce a real PDF.
 */
export function ConversionDialog({ mode, onClose, onOpenResult }: ConversionDialogProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);
  const firstTextInputRef = useRef<HTMLTextAreaElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const imageHelpId = useId();
  const textHelpId = useId();
  const [files, setFiles] = useState<File[]>([]);
  const [text, setText] = useState("");
  const [selectedTextFile, setSelectedTextFile] = useState<SelectedTextFile | null>(null);
  const [pageSize, setPageSize] = useState<PdfPageSizePreset>("a4");
  const [orientation, setOrientation] = useState<ImagePageOrientation | PdfPageOrientation>(mode === "images" ? "auto" : "portrait");
  const [workState, setWorkState] = useState<WorkState>("idle");
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isWorking = workState !== "idle";
  const isImages = mode === "images";
  const imageOrientation: ImagePageOrientation = orientation === "portrait" || orientation === "landscape" || orientation === "auto"
    ? orientation
    : "auto";
  const textOrientation: PdfPageOrientation = orientation === "landscape" ? "landscape" : "portrait";
  const dialogTitle = isImages ? "Imagen a PDF" : "Texto a PDF";
  const dialogDescription = isImages
    ? "Crea un PDF nuevo con una página por cada imagen PNG o JPEG."
    : "Convierte texto escrito o un archivo .txt UTF-8 en un PDF nuevo.";

  useEffect(() => {
    setFiles([]);
    setText("");
    setSelectedTextFile(null);
    setOrientation(mode === "images" ? "auto" : "portrait");
    setError(null);
    setWorkState("idle");
  }, [mode]);

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusFrame = window.requestAnimationFrame(() => {
      if (mode === "images") {
        dialogRef.current?.querySelector<HTMLElement>("[data-conversion-dropzone]")?.focus();
      } else {
        firstTextInputRef.current?.focus();
      }
    });
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
  }, [isWorking, mode, onClose]);

  const addImages = (candidates: Iterable<File>) => {
    const incoming = Array.from(candidates);
    const accepted = incoming.filter(isSupportedImage);
    const rejected = incoming.filter((file) => !isSupportedImage(file));
    if (accepted.length === 0) {
      setError("Selecciona imágenes PNG o JPEG. WebP y otros formatos no se convierten en esta herramienta.");
      return;
    }
    setFiles((current) => [...current, ...accepted]);
    setError(rejected.length > 0
      ? `Se añadieron ${accepted.length} ${imageLabel(accepted.length)}. Se omitieron ${rejected.length} archivo(s) que no son PNG o JPEG.`
      : null);
  };

  const handleImageInput = (event: ChangeEvent<HTMLInputElement>) => {
    addImages(event.target.files ?? []);
    event.target.value = "";
  };

  const handleTextInput = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!isSupportedTextFile(file)) {
      setError("Selecciona un archivo .txt de texto plano codificado en UTF-8.");
      return;
    }

    setWorkState("reading");
    setError(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if (!decoded.trim()) {
        throw new Error("El archivo de texto está vacío.");
      }
      setText(decoded.replace(/\r\n?/g, "\n"));
      setSelectedTextFile({ name: file.name, mimeType: normalizedTextMimeType() });
    } catch (readError) {
      setSelectedTextFile(null);
      setError(readError instanceof Error && readError.message === "El archivo de texto está vacío."
        ? readError.message
        : "No pudimos leer este archivo como texto UTF-8. Guárdalo como .txt UTF-8 e inténtalo de nuevo.");
    } finally {
      setWorkState("idle");
    }
  };

  const handleTextChange = (value: string) => {
    setText(value);
    if (selectedTextFile) setSelectedTextFile(null);
    if (error) setError(null);
  };

  const generate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isWorking) return;

    setError(null);
    if (isImages && files.length === 0) {
      setError("Añade al menos una imagen PNG o JPEG antes de crear el PDF.");
      imageInputRef.current?.focus();
      return;
    }
    if (!isImages && !text.trim()) {
      setError("Escribe texto o carga un archivo .txt UTF-8 antes de crear el PDF.");
      firstTextInputRef.current?.focus();
      return;
    }

    setWorkState("generating");
    try {
      const result = isImages
        ? await createPdfFromImages(
          await Promise.all(files.map(async (file) => ({
            bytes: await file.arrayBuffer(),
            name: file.name,
            mimeType: normalizedImageMimeType(file)
          }))),
          { pageSize, orientation: imageOrientation }
        )
        : await createPdfFromText(
          selectedTextFile
            ? { text, name: selectedTextFile.name, mimeType: selectedTextFile.mimeType }
            : { text, name: "texto.txt", mimeType: "text/plain" },
          { pageSize, orientation: textOrientation }
        );
      const output = new File([toArrayBuffer(result.bytes)], result.name, { type: result.mimeType });
      onOpenResult(output);
    } catch (conversionError) {
      setError(conversionError instanceof Error ? conversionError.message : "No pudimos crear el PDF local. Inténtalo de nuevo.");
      setWorkState("idle");
    }
  };

  const pageSizeId = useId();
  const orientationId = useId();

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget && !isWorking) onClose(); }}
    >
      <section
        ref={dialogRef}
        className="modal conversion-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        aria-busy={isWorking}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal__header">
          <div>
            <h2 id={titleId}>{dialogTitle}</h2>
            <p id={descriptionId} className="modal__subheading">{dialogDescription}</p>
          </div>
          <button className="icon-button" type="button" aria-label="Cerrar diálogo" disabled={isWorking} onClick={onClose}>
            <X size={17} aria-hidden="true" />
          </button>
        </header>

        <form onSubmit={(event) => void generate(event)} noValidate>
          <div className="modal__body conversion-dialog__body">
            <p className="local-note conversion-dialog__privacy"><ShieldCheck size={16} aria-hidden="true" /><span>Los archivos se procesan solo en este dispositivo.</span></p>

            {isImages ? (
              <ImagePicker
                files={files}
                inputRef={imageInputRef}
                helpId={imageHelpId}
                isDragging={isDragging}
                disabled={isWorking}
                onDragChange={setIsDragging}
                onAdd={addImages}
                onInput={handleImageInput}
                onRemove={(index) => setFiles((current) => current.filter((_, currentIndex) => currentIndex !== index))}
              />
            ) : (
              <TextPicker
                value={text}
                selectedFileName={selectedTextFile?.name}
                inputRef={textInputRef}
                textAreaRef={firstTextInputRef}
                helpId={textHelpId}
                disabled={isWorking}
                onInput={handleTextInput}
                onChange={handleTextChange}
              />
            )}

            <div className="conversion-dialog__options" aria-label="Opciones de página">
              <label className="inspector__field" htmlFor={pageSizeId}>
                <span className="field-label">Tamaño</span>
                <select id={pageSizeId} className="field-input" value={pageSize} disabled={isWorking} onChange={(event) => setPageSize(event.target.value as PdfPageSizePreset)}>
                  <option value="a4">A4</option>
                  <option value="letter">Carta</option>
                </select>
              </label>
              <label className="inspector__field" htmlFor={orientationId}>
                <span className="field-label">Orientación</span>
                <select
                  id={orientationId}
                  className="field-input"
                  value={isImages ? imageOrientation : textOrientation}
                  disabled={isWorking}
                  onChange={(event) => setOrientation(event.target.value as ImagePageOrientation | PdfPageOrientation)}
                >
                  {isImages && <option value="auto">Automática por imagen</option>}
                  <option value="portrait">Vertical</option>
                  <option value="landscape">Horizontal</option>
                </select>
              </label>
            </div>

            {error && <p className="inline-error" role="alert">{error}</p>}
            {isWorking && <p className="conversion-dialog__status" role="status"><LoaderCircle size={15} aria-hidden="true" />{workState === "reading" ? "Leyendo texto localmente…" : "Creando el PDF localmente…"}</p>}
          </div>
          <footer className="modal__footer">
            <button className="btn" type="button" disabled={isWorking} onClick={onClose}>Cancelar</button>
            <button className="btn btn--primary" type="submit" disabled={isWorking}>
              {isWorking ? "Procesando…" : "Crear y abrir PDF"}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}

interface ImagePickerProps {
  files: readonly File[];
  inputRef: RefObject<HTMLInputElement | null>;
  helpId: string;
  isDragging: boolean;
  disabled: boolean;
  onDragChange: (dragging: boolean) => void;
  onAdd: (files: Iterable<File>) => void;
  onInput: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemove: (index: number) => void;
}

function ImagePicker({ files, inputRef, helpId, isDragging, disabled, onDragChange, onAdd, onInput, onRemove }: ImagePickerProps) {
  return (
    <div className="conversion-dialog__picker">
      <div
        className={`conversion-dropzone ${isDragging ? "is-dragging" : ""}`}
        data-conversion-dropzone
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        aria-describedby={helpId}
        onClick={() => { if (!disabled) inputRef.current?.click(); }}
        onKeyDown={(event) => {
          if (disabled || (event.key !== "Enter" && event.key !== " ")) return;
          event.preventDefault();
          inputRef.current?.click();
        }}
        onDragEnter={(event) => { event.preventDefault(); if (!disabled) onDragChange(true); }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => { if (event.target === event.currentTarget) onDragChange(false); }}
        onDrop={(event: DragEvent<HTMLDivElement>) => {
          event.preventDefault();
          onDragChange(false);
          if (!disabled) onAdd(event.dataTransfer.files);
        }}
      >
        <FilePlus2 size={21} aria-hidden="true" />
        <span><strong>Añadir imágenes</strong><small>Arrastra PNG o JPEG, o selecciónalas. Se respeta este orden.</small></span>
      </div>
      <input ref={inputRef} hidden type="file" accept={IMAGE_ACCEPT} multiple disabled={disabled} onChange={onInput} />
      <p id={helpId} className="conversion-dialog__hint">PNG y JPEG solamente. Cada imagen se convierte en una página del PDF.</p>
      {files.length > 0 ? (
        <ol className="conversion-dialog__file-list" aria-label="Imágenes seleccionadas">
          {files.map((file, index) => (
            <li key={`${file.name}-${file.lastModified}-${index}`} className="conversion-dialog__file">
              <FileImage size={17} aria-hidden="true" />
              <span><strong>{file.name}</strong><small>{formatBytes(file.size)}</small></span>
              <button className="icon-button conversion-dialog__remove" type="button" disabled={disabled} aria-label={`Quitar ${file.name}`} onClick={() => onRemove(index)}>
                <Trash2 size={14} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ol>
      ) : <p className="conversion-dialog__empty">Aún no has añadido imágenes.</p>}
    </div>
  );
}

interface TextPickerProps {
  value: string;
  selectedFileName: string | undefined;
  inputRef: RefObject<HTMLInputElement | null>;
  textAreaRef: RefObject<HTMLTextAreaElement | null>;
  helpId: string;
  disabled: boolean;
  onInput: (event: ChangeEvent<HTMLInputElement>) => void;
  onChange: (value: string) => void;
}

function TextPicker({ value, selectedFileName, inputRef, textAreaRef, helpId, disabled, onInput, onChange }: TextPickerProps) {
  const textId = useId();
  return (
    <div className="conversion-dialog__picker">
      <div className="conversion-dialog__text-header">
        <label className="field-label" htmlFor={textId}>Texto</label>
        <button className="btn btn--subtle conversion-dialog__upload" type="button" disabled={disabled} onClick={() => inputRef.current?.click()}>
          <Upload size={14} aria-hidden="true" />Cargar .txt
        </button>
      </div>
      <textarea
        ref={textAreaRef}
        id={textId}
        className="field-input conversion-dialog__textarea"
        value={value}
        disabled={disabled}
        rows={9}
        placeholder="Escribe o pega aquí el texto que quieres convertir…"
        aria-describedby={helpId}
        onChange={(event) => onChange(event.target.value)}
      />
      <input ref={inputRef} hidden type="file" accept={TEXT_ACCEPT} disabled={disabled} onChange={(event) => void onInput(event)} />
      <p id={helpId} className="conversion-dialog__hint">
        {selectedFileName ? <>Editando <strong>{selectedFileName}</strong>. El contenido se ha leído como UTF-8.</> : "También puedes cargar un archivo .txt UTF-8. No se admiten Word, OCR ni otros formatos."}
      </p>
    </div>
  );
}

function isSupportedImage(file: File): boolean {
  const mime = mimeEssence(file.type);
  if (mime && mime !== "application/octet-stream") {
    return mime === "image/png" || mime === "image/jpeg" || mime === "image/jpg";
  }
  const extension = file.name.toLowerCase().split(".").at(-1);
  return extension === "png"
    || extension === "jpg"
    || extension === "jpeg";
}

function isSupportedTextFile(file: File): boolean {
  const mime = mimeEssence(file.type);
  if (mime && mime !== "application/octet-stream") return mime === "text/plain";
  return file.name.toLowerCase().endsWith(".txt");
}

function normalizedImageMimeType(file: File): string {
  if (mimeEssence(file.type) === "image/png" || file.name.toLowerCase().endsWith(".png")) return "image/png";
  return "image/jpeg";
}

function normalizedTextMimeType(): string {
  return "text/plain";
}

function mimeEssence(value: string): string {
  return value.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function imageLabel(count: number): string {
  return count === 1 ? "imagen" : "imágenes";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFocusableElements(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];
  return Array.from(container.querySelectorAll<HTMLElement>(
    "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"
  ));
}

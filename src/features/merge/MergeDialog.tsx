import { ArrowDown, ArrowUp, FilePlus2, Files, GripVertical, ShieldCheck, Trash2, X } from "lucide-react";
import { type ChangeEvent, type DragEvent, useEffect, useRef, useState } from "react";

interface MergeDialogProps {
  onClose: () => void;
  onOpenResult: (file: File) => void;
}

interface MergeFile {
  id: string;
  file: File;
  pageCount: number | null;
  pageCountError?: string;
}

function isPdf(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

export function MergeDialog({ onClose, onOpenResult }: MergeDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<MergeFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape" && !isWorking) onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isWorking, onClose]);

  const addFiles = (candidates: Iterable<File>) => {
    const additions = [...candidates].filter(isPdf);
    if (additions.length === 0) {
      setError("Elige archivos PDF para unir.");
      return;
    }
    const entries = additions.map((file) => ({ id: createId(), file, pageCount: null }));
    setFiles((current) => [...current, ...entries]);
    setError(null);
    void Promise.all(entries.map(async (entry) => {
      try {
        const { getPdfPageCount } = await import("@/core/pdf/PdfPageOperations");
        const pageCount = await getPdfPageCount(new Uint8Array(await entry.file.arrayBuffer()));
        setFiles((current) => current.map((item) => item.id === entry.id ? { ...item, pageCount } : item));
      } catch (pageCountError) {
        const message = pageCountError instanceof Error ? pageCountError.message : "No pudimos leer las páginas de este PDF.";
        setFiles((current) => current.map((item) => item.id === entry.id ? { ...item, pageCountError: message } : item));
      }
    }));
  };

  const handleInput = (event: ChangeEvent<HTMLInputElement>) => {
    addFiles(event.target.files ?? []);
    event.target.value = "";
  };

  const move = (index: number, direction: -1 | 1) => {
    setFiles((current) => {
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= current.length) return current;
      const next = [...current];
      const [file] = next.splice(index, 1);
      if (file) next.splice(targetIndex, 0, file);
      return next;
    });
  };

  const merge = async () => {
    if (files.length < 2 || isWorking) return;
    setIsWorking(true);
    setError(null);
    try {
      const { mergePdfFiles } = await import("@/core/pdf/PdfPageOperations");
      const inputs = await Promise.all(files.map(async ({ file }) => new Uint8Array(await file.arrayBuffer())));
      const bytes = await mergePdfFiles(inputs);
      const output = new File([toArrayBuffer(bytes)], "PDF-unido.pdf", { type: "application/pdf" });
      onOpenResult(output);
    } catch (mergeError) {
      setError(mergeError instanceof Error ? mergeError.message : "No pudimos unir estos documentos.");
      setIsWorking(false);
    }
  };

  const isReadingFiles = files.some((file) => file.pageCount === null && !file.pageCountError);
  const canMerge = files.length >= 2 && !isReadingFiles && files.every((file) => !file.pageCountError);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !isWorking) onClose(); }}>
      <section className="modal merge-dialog" role="dialog" aria-modal="true" aria-labelledby="merge-dialog-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="modal__header">
          <div><h2 id="merge-dialog-title">Unir PDFs</h2><p className="modal__subheading">Combina documentos localmente, en el orden que elijas.</p></div>
          <button className="icon-button" type="button" aria-label="Cerrar" disabled={isWorking} onClick={onClose}><X size={17} /></button>
        </header>
        <div className="modal__body">
          <div className="local-note merge-dialog__privacy"><ShieldCheck size={16} /><span>Los archivos se procesan en este dispositivo.</span></div>
          <div
            className={`merge-dropzone ${isDragging ? "is-dragging" : ""}`}
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); inputRef.current?.click(); } }}
            onDragEnter={(event) => { event.preventDefault(); setIsDragging(true); }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => { if (event.currentTarget === event.target) setIsDragging(false); }}
            onDrop={(event: DragEvent<HTMLDivElement>) => { event.preventDefault(); setIsDragging(false); addFiles(event.dataTransfer.files); }}
          >
            <FilePlus2 size={20} /><span><strong>Añadir PDFs</strong><small>Selecciona varios archivos o arrástralos aquí.</small></span>
          </div>
          <input ref={inputRef} hidden type="file" accept="application/pdf,.pdf" multiple onChange={handleInput} />
          {files.length > 0 && <ol className="merge-file-list" aria-label="Orden de documentos">
            {files.map((entry, index) => {
              const { file } = entry;
              return <li key={entry.id} className="merge-file">
                <GripVertical className="merge-file__grip" size={16} aria-hidden="true" />
                <Files className="merge-file__icon" size={17} aria-hidden="true" />
                <span className="merge-file__name"><strong>{file.name}</strong><small>{formatMergeFileDetails(entry)}</small></span>
                <span className="merge-file__actions">
                  <button className="icon-button" type="button" aria-label={`Subir ${file.name}`} disabled={isWorking || index === 0} onClick={() => move(index, -1)}><ArrowUp size={14} /></button>
                  <button className="icon-button" type="button" aria-label={`Bajar ${file.name}`} disabled={isWorking || index === files.length - 1} onClick={() => move(index, 1)}><ArrowDown size={14} /></button>
                  <button className="icon-button merge-file__remove" type="button" aria-label={`Quitar ${file.name}`} disabled={isWorking} onClick={() => setFiles((current) => current.filter((item) => item.id !== entry.id))}><Trash2 size={14} /></button>
                </span>
              </li>;
            })}
          </ol>}
          {files.length === 0 && <p className="merge-dialog__empty">Añade al menos dos PDFs para crear un solo documento.</p>}
          {error && <p className="inline-error" role="alert">{error}</p>}
        </div>
        <footer className="modal__footer">
          <button className="btn" type="button" disabled={isWorking} onClick={onClose}>Cancelar</button>
          <button className="btn btn--primary" type="button" disabled={!canMerge || isWorking} onClick={() => void merge()}>{isWorking ? "Uniendo…" : isReadingFiles ? "Leyendo…" : "Unir y abrir"}</button>
        </footer>
      </section>
    </div>
  );
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatMergeFileDetails(entry: MergeFile): string {
  if (entry.pageCountError) return entry.pageCountError;
  if (entry.pageCount === null) return "Leyendo páginas localmente…";
  return `${entry.pageCount} ${entry.pageCount === 1 ? "página" : "páginas"} · ${formatBytes(entry.file.size)}`;
}

function createId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `merge-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

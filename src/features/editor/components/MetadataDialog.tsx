import { X } from "lucide-react";
import { type FormEvent, type RefObject, useEffect, useId, useRef, useState } from "react";
import type { PDFMetadata } from "@/types/pdf";

export interface MetadataDialogProps {
  metadata: PDFMetadata;
  onClose: () => void;
  onApply: (metadata: PDFMetadata) => void;
}

export interface MetadataFormValues {
  title: string;
  author: string;
  subject: string;
  keywords: string;
  creator: string;
  producer: string;
}

/**
 * Edits the basic PDF Info values intended for the exported copy. Empty text
 * values and an empty keyword list are deliberately kept in the callback so a
 * caller can distinguish an explicit clear from an omitted update.
 */
export function MetadataDialog({ metadata, onClose, onApply }: MetadataDialogProps) {
  const [values, setValues] = useState<MetadataFormValues>(() => metadataToFormValues(metadata));
  const dialogRef = useRef<HTMLElement>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const request = window.requestAnimationFrame(() => firstInputRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
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
      window.cancelAnimationFrame(request);
      document.removeEventListener("keydown", onKeyDown);
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [onClose]);

  const setField = (field: keyof MetadataFormValues, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onApply(metadataFromFormValues(values, metadata));
  };

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section
        ref={dialogRef}
        className="modal metadata-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <header className="modal__header">
          <div>
            <h2 id={titleId}>Metadatos del documento</h2>
            <p id={descriptionId} className="modal__subheading">Edita los campos Info básicos del PDF.</p>
          </div>
          <button className="icon-button" type="button" aria-label="Cerrar diálogo" onClick={onClose}>
            <X size={17} aria-hidden="true" />
          </button>
        </header>
        <form onSubmit={submit} noValidate>
          <div className="modal__body metadata-dialog__body">
            <p className="metadata-dialog__notice">
              Estos valores se escriben en la copia exportada. No garantiza limpiar XMP, IDs, adjuntos ni historial del PDF.
            </p>
            <div className="metadata-dialog__grid">
              <MetadataField label="Título" name="title" value={values.title} inputRef={firstInputRef} onChange={setField} />
              <MetadataField label="Autor" name="author" value={values.author} onChange={setField} />
              <MetadataField label="Asunto" name="subject" value={values.subject} onChange={setField} />
              <MetadataField label="Creador" name="creator" value={values.creator} onChange={setField} />
              <MetadataField label="Productor" name="producer" value={values.producer} onChange={setField} />
              <MetadataField
                label="Palabras clave"
                name="keywords"
                value={values.keywords}
                hint="Sepáralas con comas. Puedes dejar cualquier campo vacío."
                className="metadata-dialog__keywords"
                onChange={setField}
              />
            </div>
          </div>
          <footer className="modal__footer">
            <button className="btn" type="button" onClick={onClose}>Cancelar</button>
            <button className="btn btn--primary" type="submit">Aplicar metadatos</button>
          </footer>
        </form>
      </section>
    </div>
  );
}

function MetadataField({
  label,
  name,
  value,
  hint,
  className,
  inputRef,
  onChange
}: {
  label: string;
  name: keyof MetadataFormValues;
  value: string;
  hint?: string;
  className?: string;
  inputRef?: RefObject<HTMLInputElement | null>;
  onChange: (field: keyof MetadataFormValues, value: string) => void;
}) {
  const inputId = useId();
  const hintId = useId();
  return (
    <label className={["inspector__field", className].filter(Boolean).join(" ")} htmlFor={inputId}>
      <span className="field-label">{label}</span>
      <input
        ref={inputRef}
        id={inputId}
        className="field-input"
        type="text"
        maxLength={4_096}
        value={value}
        aria-describedby={hint ? hintId : undefined}
        onChange={(event) => onChange(name, event.target.value)}
      />
      {hint && <span id={hintId} className="metadata-dialog__field-help">{hint}</span>}
    </label>
  );
}

/** Converts serialised keywords into a user-facing comma-separated field. */
export function metadataToFormValues(metadata: PDFMetadata): MetadataFormValues {
  return {
    title: metadata.title ?? "",
    author: metadata.author ?? "",
    subject: metadata.subject ?? "",
    keywords: normaliseKeywords(metadata.keywords).join(", "),
    creator: metadata.creator ?? "",
    producer: metadata.producer ?? ""
  };
}

/**
 * Creates a full metadata value for the callback. Existing timestamp fields
 * are deliberately retained because this dialog does not edit them.
 */
export function metadataFromFormValues(values: MetadataFormValues, previous: PDFMetadata): PDFMetadata {
  return {
    ...previous,
    title: normaliseText(values.title),
    author: normaliseText(values.author),
    subject: normaliseText(values.subject),
    keywords: normaliseKeywords(values.keywords.split(",")),
    creator: normaliseText(values.creator),
    producer: normaliseText(values.producer)
  };
}

function normaliseText(value: string): string {
  return value.trim();
}

function normaliseKeywords(values: readonly string[] | undefined): string[] {
  const seen = new Set<string>();
  const keywords: string[] = [];
  for (const value of values ?? []) {
    const keyword = value.trim();
    const key = keyword.toLocaleLowerCase();
    if (!keyword || seen.has(key)) continue;
    seen.add(key);
    keywords.push(keyword);
  }
  return keywords;
}

function getFocusableElements(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];
  return Array.from(container.querySelectorAll<HTMLElement>(
    "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"
  ));
}

import { X } from "lucide-react";
import { type FormEvent, type RefObject, useEffect, useId, useMemo, useRef, useState } from "react";

export interface PageRangeDialogProps {
  mode: "extract" | "split";
  pageCount: number;
  onClose: () => void;
  onExtract: (rangeExpression: string) => void;
  onSplit: (chunkSize: number) => void;
}

type RangeValidation =
  | { isValid: true; normalizedExpression: string; selectedPages: number }
  | { isValid: false; message: string };

/**
 * Collects a page range from the user without making assumptions about how the
 * caller creates the resulting PDF(s). The parent owns all document work.
 */
export function PageRangeDialog({ mode, pageCount, onClose, onExtract, onSplit }: PageRangeDialogProps) {
  const safePageCount = toPageCount(pageCount);
  const [rangeExpression, setRangeExpression] = useState("");
  const [chunkSize, setChunkSize] = useState(() => String(defaultChunkSize(safePageCount)));
  const [submitted, setSubmitted] = useState(false);
  const dialogRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const helpId = useId();
  const errorId = useId();
  const previewId = useId();

  const rangeValidation = useMemo(
    () => validateRangeExpression(rangeExpression, safePageCount),
    [rangeExpression, safePageCount]
  );
  const chunkValidation = useMemo(
    () => validateChunkSize(chunkSize, safePageCount),
    [chunkSize, safePageCount]
  );
  const validation = mode === "extract" ? rangeValidation : chunkValidation;

  useEffect(() => {
    setSubmitted(false);
    setRangeExpression("");
    setChunkSize(String(defaultChunkSize(safePageCount)));
  }, [mode, safePageCount]);

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusInput = window.requestAnimationFrame(() => inputRef.current?.focus());
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const focusableElements = getFocusableElements(dialogRef.current);
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
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusInput);
      document.removeEventListener("keydown", handleKeyDown);
      if (previouslyFocused && previouslyFocused.isConnected) {
        previouslyFocused.focus();
      }
    };
  }, [onClose]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitted(true);

    if (mode === "extract") {
      if (!rangeValidation.isValid) {
        inputRef.current?.focus();
        return;
      }

      onExtract(rangeValidation.normalizedExpression);
      return;
    }

    if (!chunkValidation.isValid) {
      inputRef.current?.focus();
      return;
    }

    onSplit(chunkValidation.chunkSize);
  };

  const title = mode === "extract" ? "Extraer páginas" : "Dividir PDF";
  const description = mode === "extract"
    ? "Crea un PDF nuevo con las páginas indicadas. El documento abierto no se modifica."
    : "Crea varios PDFs nuevos con el tamaño indicado. El documento abierto no se modifica.";
  const showError = submitted && !validation.isValid;

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
        className="modal page-range-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={`${descriptionId} ${helpId}${showError ? ` ${errorId}` : ""}`}
      >
        <header className="modal__header">
          <h2 id={titleId}>{title}</h2>
          <button className="icon-button" type="button" aria-label="Cerrar diálogo" onClick={onClose}>
            <X size={17} aria-hidden="true" />
          </button>
        </header>

        <form onSubmit={handleSubmit} noValidate>
          <div className="modal__body">
            <p id={descriptionId} className="page-range-dialog__intro">{description}</p>

            {mode === "extract" ? (
              <ExtractRangeField
                inputRef={inputRef}
                value={rangeExpression}
                pageCount={safePageCount}
                validation={rangeValidation}
                showError={showError}
                helpId={helpId}
                errorId={errorId}
                previewId={previewId}
                onChange={setRangeExpression}
              />
            ) : (
              <SplitSizeField
                inputRef={inputRef}
                value={chunkSize}
                pageCount={safePageCount}
                validation={chunkValidation}
                showError={showError}
                helpId={helpId}
                errorId={errorId}
                previewId={previewId}
                onChange={setChunkSize}
              />
            )}
          </div>

          <footer className="modal__footer">
            <button className="btn" type="button" onClick={onClose}>Cancelar</button>
            <button className="btn btn--primary" type="submit" disabled={safePageCount === 0}>
              {mode === "extract" ? "Extraer páginas" : "Dividir PDF"}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}

interface ExtractRangeFieldProps {
  inputRef: RefObject<HTMLInputElement | null>;
  value: string;
  pageCount: number;
  validation: RangeValidation;
  showError: boolean;
  helpId: string;
  errorId: string;
  previewId: string;
  onChange: (value: string) => void;
}

function ExtractRangeField({
  inputRef,
  value,
  pageCount,
  validation,
  showError,
  helpId,
  errorId,
  previewId,
  onChange
}: ExtractRangeFieldProps) {
  const inputId = useId();
  const describedBy = `${helpId} ${previewId}${showError ? ` ${errorId}` : ""}`;

  return (
    <div className="page-range-dialog__field">
      <label className="field-label" htmlFor={inputId}>Páginas que quieres extraer</label>
      <input
        ref={inputRef}
        id={inputId}
        className="field-input"
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Ej.: 1, 3, 5-9"
        autoComplete="off"
        spellCheck={false}
        aria-invalid={showError}
        aria-describedby={describedBy}
      />
      <p id={helpId} className="page-range-dialog__help">
        Usa números y rangos separados por comas, por ejemplo: 1, 3, 5-9. Este PDF tiene {pageCount} {pageLabel(pageCount)}.
      </p>
      <RangePreview id={previewId} validation={validation} />
      {showError && !validation.isValid ? <p id={errorId} className="inline-error" role="alert">{validation.message}</p> : null}
    </div>
  );
}

interface SplitSizeFieldProps {
  inputRef: RefObject<HTMLInputElement | null>;
  value: string;
  pageCount: number;
  validation: ChunkValidation;
  showError: boolean;
  helpId: string;
  errorId: string;
  previewId: string;
  onChange: (value: string) => void;
}

function SplitSizeField({
  inputRef,
  value,
  pageCount,
  validation,
  showError,
  helpId,
  errorId,
  previewId,
  onChange
}: SplitSizeFieldProps) {
  const inputId = useId();
  const describedBy = `${helpId} ${previewId}${showError ? ` ${errorId}` : ""}`;

  return (
    <div className="page-range-dialog__field">
      <label className="field-label" htmlFor={inputId}>Páginas por archivo</label>
      <input
        ref={inputRef}
        id={inputId}
        className="field-input"
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        aria-invalid={showError}
        aria-describedby={describedBy}
      />
      <p id={helpId} className="page-range-dialog__help">
        Elige cuántas páginas tendrá cada archivo nuevo. Este PDF tiene {pageCount} {pageLabel(pageCount)}.
      </p>
      <SplitPreview id={previewId} pageCount={pageCount} validation={validation} />
      {showError && !validation.isValid ? <p id={errorId} className="inline-error" role="alert">{validation.message}</p> : null}
    </div>
  );
}

function RangePreview({ id, validation }: { id: string; validation: RangeValidation }) {
  if (!validation.isValid) {
    return <p id={id} className="page-range-dialog__preview" aria-live="polite">Introduce las páginas que quieres incluir.</p>;
  }

  return (
    <p id={id} className="page-range-dialog__preview" aria-live="polite">
      Se incluirán {validation.selectedPages} {pageLabel(validation.selectedPages)} en el nuevo PDF.
    </p>
  );
}

function SplitPreview({ id, pageCount, validation }: { id: string; pageCount: number; validation: ChunkValidation }) {
  if (!validation.isValid) {
    return <p id={id} className="page-range-dialog__preview" aria-live="polite">Introduce un número entero de páginas por archivo.</p>;
  }

  const outputCount = Math.ceil(pageCount / validation.chunkSize);
  return (
    <p id={id} className="page-range-dialog__preview" aria-live="polite">
      Se crearán {outputCount} {outputCount === 1 ? "archivo" : "archivos"} de hasta {validation.chunkSize} {pageLabel(validation.chunkSize)}.
    </p>
  );
}

type ChunkValidation =
  | { isValid: true; chunkSize: number }
  | { isValid: false; message: string };

function validateRangeExpression(value: string, pageCount: number): RangeValidation {
  const expression = value.trim();
  if (pageCount === 0) {
    return { isValid: false, message: "No hay páginas disponibles para extraer." };
  }
  if (!expression) {
    return { isValid: false, message: "Indica al menos una página o un rango." };
  }

  const tokens = expression.split(",");
  let selectedPages = 0;
  const normalizedTokens: string[] = [];
  const selected = new Set<number>();

  for (const token of tokens) {
    const trimmedToken = token.trim();
    const match = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(trimmedToken);
    if (!match) {
      return { isValid: false, message: "Usa números y rangos como 1, 3, 5-9." };
    }

    const start = Number(match[1]);
    const end = match[2] === undefined ? start : Number(match[2]);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 1 || end < 1) {
      return { isValid: false, message: "Los números de página deben ser enteros positivos." };
    }
    if (start > end) {
      return { isValid: false, message: "En cada rango, la primera página debe ser menor o igual que la última." };
    }
    if (end > pageCount) {
      return { isValid: false, message: `Este PDF solo tiene ${pageCount} ${pageLabel(pageCount)}.` };
    }

    for (let pageNumber = start; pageNumber <= end; pageNumber += 1) {
      if (selected.has(pageNumber)) {
        return { isValid: false, message: `La página ${pageNumber} aparece más de una vez. Quita los rangos que se solapan.` };
      }
      selected.add(pageNumber);
      selectedPages += 1;
    }
    normalizedTokens.push(start === end ? String(start) : `${start}-${end}`);
  }

  return {
    isValid: true,
    normalizedExpression: normalizedTokens.join(", "),
    selectedPages
  };
}

function validateChunkSize(value: string, pageCount: number): ChunkValidation {
  const normalizedValue = value.trim();
  if (pageCount === 0) {
    return { isValid: false, message: "No hay páginas disponibles para dividir." };
  }
  if (!/^\d+$/.test(normalizedValue)) {
    return { isValid: false, message: "Indica un número entero de páginas por archivo." };
  }

  const chunkSize = Number(normalizedValue);
  if (!Number.isSafeInteger(chunkSize) || chunkSize < 1) {
    return { isValid: false, message: "El número de páginas por archivo debe ser mayor que cero." };
  }
  if (chunkSize > pageCount) {
    return { isValid: false, message: `El tamaño no puede superar las ${pageCount} ${pageLabel(pageCount)} del PDF.` };
  }

  return { isValid: true, chunkSize };
}

function defaultChunkSize(pageCount: number): number {
  return Math.min(Math.max(pageCount, 1), 2);
}

function toPageCount(pageCount: number): number {
  return Number.isSafeInteger(pageCount) && pageCount > 0 ? pageCount : 0;
}

function pageLabel(pageCount: number): string {
  return pageCount === 1 ? "página" : "páginas";
}

function getFocusableElements(container: HTMLElement | null): HTMLElement[] {
  if (!container) {
    return [];
  }

  return Array.from(container.querySelectorAll<HTMLElement>(
    "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"
  ));
}

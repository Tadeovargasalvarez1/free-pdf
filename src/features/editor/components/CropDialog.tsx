import { Crop, X } from "lucide-react";
import { type FormEvent, type RefObject, useEffect, useId, useMemo, useRef, useState } from "react";
import type { PDFPageModel, PDFRect } from "@/types/pdf";

export interface CropDialogProps {
  page: PDFPageModel;
  onClose: () => void;
  onApply: (cropBox: PDFRect) => void;
}

type MarginName = "left" | "right" | "top" | "bottom";

const MINIMUM_VISIBLE_SIZE = 24;

/**
 * Crops by changing the PDF CropBox. This is a display/output crop, not
 * secure redaction: content outside the box can remain in the PDF structure.
 */
export function CropDialog({ page, onClose, onApply }: CropDialogProps) {
  const baseBox = page.cropBox ?? { x: 0, y: 0, width: page.size.width, height: page.size.height };
  const [margins, setMargins] = useState<Record<MarginName, string>>({ left: "0", right: "0", top: "0", bottom: "0" });
  const [submitted, setSubmitted] = useState(false);
  const dialogRef = useRef<HTMLElement>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const validation = useMemo(() => validateMargins(margins, baseBox), [baseBox, margins]);

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

  const setMargin = (name: MarginName, value: string) => {
    setMargins((current) => ({ ...current, [name]: value }));
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitted(true);
    if (!validation.isValid) {
      firstInputRef.current?.focus();
      return;
    }
    onApply(validation.cropBox);
  };

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section
        ref={dialogRef}
        className="modal crop-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <header className="modal__header">
          <div>
            <h2 id={titleId}>Recortar página</h2>
            <p id={descriptionId} className="modal__subheading">Define los márgenes que quieres retirar, en puntos PDF.</p>
          </div>
          <button className="icon-button" type="button" aria-label="Cerrar diálogo" onClick={onClose}><X size={17} aria-hidden="true" /></button>
        </header>
        <form onSubmit={submit} noValidate>
          <div className="modal__body">
            <p className="inspector__hint">
              El recorte cambia la CropBox de la copia exportada y oculta el exterior al abrirla. No elimina de forma segura el contenido fuera del área.
            </p>
            <div className="crop-dialog__grid">
              <MarginField label="Izquierdo" name="left" value={margins.left} inputRef={firstInputRef} onChange={setMargin} />
              <MarginField label="Derecho" name="right" value={margins.right} onChange={setMargin} />
              <MarginField label="Superior" name="top" value={margins.top} onChange={setMargin} />
              <MarginField label="Inferior" name="bottom" value={margins.bottom} onChange={setMargin} />
            </div>
            <p className="crop-dialog__help">Los márgenes se aplican en las coordenadas PDF originales, antes de la rotación visual de la página.</p>
            {validation.isValid ? (
              <div className="crop-dialog__preview" aria-live="polite">
                <Crop size={16} aria-hidden="true" />
                Área final: {formatPoints(validation.cropBox.width)} × {formatPoints(validation.cropBox.height)} pt
              </div>
            ) : (
              <p className="inline-error" role={submitted ? "alert" : undefined} aria-live="polite">{validation.message}</p>
            )}
          </div>
          <footer className="modal__footer">
            <button className="btn" type="button" onClick={onClose}>Cancelar</button>
            <button className="btn btn--primary" type="submit">Aplicar recorte</button>
          </footer>
        </form>
      </section>
    </div>
  );
}

function MarginField({
  label,
  name,
  value,
  inputRef,
  onChange
}: {
  label: string;
  name: MarginName;
  value: string;
  inputRef?: RefObject<HTMLInputElement | null>;
  onChange: (name: MarginName, value: string) => void;
}) {
  const inputId = useId();
  return (
    <label className="inspector__field" htmlFor={inputId}>
      <span className="field-label">{label} (pt)</span>
      <input
        ref={inputRef}
        id={inputId}
        className="field-input"
        type="number"
        min="0"
        step="1"
        inputMode="decimal"
        value={value}
        onChange={(event) => onChange(name, event.target.value)}
      />
    </label>
  );
}

type CropValidation =
  | { isValid: true; cropBox: PDFRect }
  | { isValid: false; message: string };

function validateMargins(margins: Record<MarginName, string>, baseBox: PDFRect): CropValidation {
  const parsed = {} as Record<MarginName, number>;
  for (const name of ["left", "right", "top", "bottom"] as const) {
    const raw = margins[name].trim();
    if (!raw || !/^(?:\d+|\d*\.\d+)$/.test(raw)) {
      return { isValid: false, message: "Cada margen debe ser un número igual o mayor que cero." };
    }
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) {
      return { isValid: false, message: "Cada margen debe ser un número igual o mayor que cero." };
    }
    parsed[name] = value;
  }
  const width = baseBox.width - parsed.left - parsed.right;
  const height = baseBox.height - parsed.top - parsed.bottom;
  if (width < MINIMUM_VISIBLE_SIZE || height < MINIMUM_VISIBLE_SIZE) {
    return { isValid: false, message: "El área visible debe conservar al menos 24 puntos de ancho y alto." };
  }
  return {
    isValid: true,
    cropBox: {
      x: baseBox.x + parsed.left,
      y: baseBox.y + parsed.bottom,
      width,
      height
    }
  };
}

function formatPoints(value: number): string {
  return Number(value.toFixed(1)).toLocaleString("es");
}

function getFocusableElements(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];
  return Array.from(container.querySelectorAll<HTMLElement>(
    "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"
  ));
}

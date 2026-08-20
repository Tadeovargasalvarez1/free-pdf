import { Hash, Stamp, X } from "lucide-react";
import { type FormEvent, type RefObject, useEffect, useId, useRef, useState } from "react";
import type { PageNumberFormat, PageNumberPosition } from "@/features/editor/utils/editorObjects";

export type DocumentOverlayMode = "page-numbers" | "watermark";

export interface PageNumberOverlaySettings {
  kind: "page-numbers";
  format: PageNumberFormat;
  position: PageNumberPosition;
  startNumber: number;
  margin: number;
  fontSize: number;
  color: string;
}

export interface WatermarkOverlaySettings {
  kind: "watermark";
  text: string;
  fontSize: number;
  opacity: number;
  rotation: number;
  color: string;
}

export type DocumentOverlaySettings = PageNumberOverlaySettings | WatermarkOverlaySettings;

interface DocumentOverlayDialogProps {
  mode: DocumentOverlayMode;
  pageCount: number;
  onClose: () => void;
  onApply: (settings: DocumentOverlaySettings) => void;
}

/**
 * Adds document-wide visual text objects to the editable scene. The dialog
 * does not mutate the source PDF and its output can be undone as one action.
 */
export function DocumentOverlayDialog({ mode, pageCount, onClose, onApply }: DocumentOverlayDialogProps) {
  const [format, setFormat] = useState<PageNumberFormat>("number");
  const [position, setPosition] = useState<PageNumberPosition>("bottom-center");
  const [startNumber, setStartNumber] = useState("1");
  const [margin, setMargin] = useState("28");
  const [fontSize, setFontSize] = useState(mode === "watermark" ? "42" : "11");
  const [color, setColor] = useState(mode === "watermark" ? "#64748b" : "#172033");
  const [watermark, setWatermark] = useState("BORRADOR");
  const [opacity, setOpacity] = useState("22");
  const [rotation, setRotation] = useState("-35");
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const isPageNumbers = mode === "page-numbers";

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

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const size = parseBoundedNumber(fontSize, 6, 120);
    if (size === null) {
      setError("El tamaño debe estar entre 6 y 120 puntos.");
      return;
    }

    if (isPageNumbers) {
      const start = parseBoundedInteger(startNumber, 1, 1_000_000);
      const safeMargin = parseBoundedNumber(margin, 0, 240);
      if (start === null || safeMargin === null) {
        setError("El inicio debe ser un entero positivo y el margen debe estar entre 0 y 240 puntos.");
        return;
      }
      onApply({ kind: "page-numbers", format, position, startNumber: start, margin: safeMargin, fontSize: size, color });
      return;
    }

    const text = watermark.trim();
    const transparency = parseBoundedNumber(opacity, 5, 90);
    const angle = parseBoundedNumber(rotation, -180, 180);
    if (!text) {
      setError("Escribe un texto breve para la marca de agua.");
      return;
    }
    if (text.length > 64) {
      setError("La marca de agua debe tener como máximo 64 caracteres.");
      return;
    }
    if (transparency === null || angle === null) {
      setError("La opacidad debe estar entre 5 y 90 %, y la rotación entre −180° y 180°.");
      return;
    }
    onApply({ kind: "watermark", text, fontSize: size, opacity: transparency / 100, rotation: angle, color });
  };

  const icon = isPageNumbers ? <Hash size={16} aria-hidden="true" /> : <Stamp size={16} aria-hidden="true" />;

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section
        ref={dialogRef}
        className="modal document-overlay-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <header className="modal__header">
          <div>
            <h2 id={titleId}>{isPageNumbers ? "Numerar páginas" : "Añadir marca de agua"}</h2>
            <p id={descriptionId} className="modal__subheading">
              {isPageNumbers ? `Se añadirán números editables a las ${pageCount} páginas actuales.` : "Se añadirá un texto visual editable a todas las páginas actuales."}
            </p>
          </div>
          <button className="icon-button" type="button" aria-label="Cerrar diálogo" onClick={onClose}><X size={17} aria-hidden="true" /></button>
        </header>
        <form onSubmit={submit} noValidate>
          <div className="modal__body document-overlay-dialog__body">
            {isPageNumbers ? (
              <>
                <div className="document-overlay-dialog__grid">
                  <label className="inspector__field">
                    <span className="field-label">Formato</span>
                    <select className="field-input" value={format} onChange={(event) => setFormat(event.target.value as PageNumberFormat)}>
                      <option value="number">1</option>
                      <option value="page-number">Página 1</option>
                      <option value="number-of-total">1 / {pageCount}</option>
                      <option value="page-number-of-total">Página 1 de {pageCount}</option>
                    </select>
                  </label>
                  <label className="inspector__field">
                    <span className="field-label">Posición</span>
                    <select className="field-input" value={position} onChange={(event) => setPosition(event.target.value as PageNumberPosition)}>
                      <option value="top-left">Arriba izquierda</option>
                      <option value="top-center">Arriba centro</option>
                      <option value="top-right">Arriba derecha</option>
                      <option value="bottom-left">Abajo izquierda</option>
                      <option value="bottom-center">Abajo centro</option>
                      <option value="bottom-right">Abajo derecha</option>
                    </select>
                  </label>
                  <NumberField label="Empezar en" value={startNumber} min={1} max={1_000_000} inputRef={firstInputRef} onChange={setStartNumber} />
                  <NumberField label="Margen (pt)" value={margin} min={0} max={240} onChange={setMargin} />
                </div>
                <p className="document-overlay-dialog__hint">Los números se añaden como texto visual editable en la copia de trabajo. Un solo Deshacer retira toda la serie.</p>
              </>
            ) : (
              <>
                <label className="inspector__field">
                  <span className="field-label">Texto</span>
                  <input ref={firstInputRef} className="field-input" value={watermark} maxLength={64} onChange={(event) => setWatermark(event.target.value)} />
                </label>
                <div className="document-overlay-dialog__grid">
                  <NumberField label="Opacidad (%)" value={opacity} min={5} max={90} onChange={setOpacity} />
                  <NumberField label="Rotación (°)" value={rotation} min={-180} max={180} onChange={setRotation} />
                </div>
                <p className="document-overlay-dialog__hint">La marca queda encima del contenido original con opacidad configurable. No es una protección, una redacción ni una reconstrucción detrás del contenido.</p>
              </>
            )}
            <div className="document-overlay-dialog__grid document-overlay-dialog__grid--appearance">
              <NumberField label="Tamaño (pt)" value={fontSize} min={6} max={120} onChange={setFontSize} />
              <label className="inspector__field">
                <span className="field-label">Color</span>
                <input className="field-input" type="color" value={color} onChange={(event) => setColor(event.target.value)} />
              </label>
            </div>
            {error && <p className="inline-error" role="alert">{error}</p>}
            <div className="document-overlay-dialog__preview" aria-live="polite">{icon}<span>{isPageNumbers ? previewPageNumber(format, pageCount) : watermark.trim() || "Marca de agua"}</span></div>
          </div>
          <footer className="modal__footer">
            <button className="btn" type="button" onClick={onClose}>Cancelar</button>
            <button className="btn btn--primary" type="submit">{isPageNumbers ? "Añadir números" : "Añadir marca"}</button>
          </footer>
        </form>
      </section>
    </div>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  inputRef,
  onChange
}: {
  label: string;
  value: string;
  min: number;
  max: number;
  inputRef?: RefObject<HTMLInputElement | null>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="inspector__field">
      <span className="field-label">{label}</span>
      <input ref={inputRef} className="field-input" type="number" min={min} max={max} step="1" inputMode="decimal" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function parseBoundedNumber(value: string, min: number, max: number): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

function parseBoundedInteger(value: string, min: number, max: number): number | null {
  const parsed = parseBoundedNumber(value, min, max);
  return parsed !== null && Number.isInteger(parsed) ? parsed : null;
}

function previewPageNumber(format: PageNumberFormat, pageCount: number): string {
  switch (format) {
    case "page-number": return "Página 1";
    case "number-of-total": return `1 / ${pageCount}`;
    case "page-number-of-total": return `Página 1 de ${pageCount}`;
    default: return "1";
  }
}

function getFocusableElements(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];
  return Array.from(container.querySelectorAll<HTMLElement>(
    "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"
  ));
}

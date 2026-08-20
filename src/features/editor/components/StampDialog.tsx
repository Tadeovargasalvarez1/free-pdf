import { Check, Stamp, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { STAMP_PRESETS } from "@/features/editor/utils/editorObjects";
import type { StampKind } from "@/types/pdf";

export interface StampDialogProps {
  onClose: () => void;
  onCreate: (kind: StampKind) => void;
}

const STAMP_KINDS: readonly StampKind[] = [
  "approved",
  "reviewed",
  "confidential",
  "draft",
  "final",
  "paid",
  "rejected"
];

/**
 * Chooses a status stamp that is flattened into the exported PDF. It does not
 * create a native PDF annotation, approval workflow, or digital signature.
 */
export function StampDialog({ onClose, onCreate }: StampDialogProps) {
  const [selectedKind, setSelectedKind] = useState<StampKind>("approved");
  const dialogRef = useRef<HTMLElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const selectedPreset = STAMP_PRESETS[selectedKind];

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusDialog = window.requestAnimationFrame(() => {
      dialogRef.current?.querySelector<HTMLButtonElement>("[data-stamp-choice='true']")?.focus();
    });
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
      window.cancelAnimationFrame(focusDialog);
      document.removeEventListener("keydown", onKeyDown);
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [onClose]);

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className="modal stamp-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <header className="modal__header">
          <div>
            <h2 id={titleId}>Añadir sello</h2>
            <p id={descriptionId} className="modal__subheading">El sello se añade como contenido visual permanente al exportar.</p>
          </div>
          <button className="icon-button" type="button" aria-label="Cerrar diálogo" onClick={onClose}>
            <X size={17} aria-hidden="true" />
          </button>
        </header>
        <div className="modal__body">
          <p className="inspector__hint">
            Un sello visual no es una anotación PDF nativa, una aprobación verificable ni una firma digital.
          </p>
          <div className="stamp-dialog__choices" role="list" aria-label="Tipo de sello">
            {STAMP_KINDS.map((kind) => {
              const preset = STAMP_PRESETS[kind];
              const isSelected = kind === selectedKind;
              return (
                <div role="listitem" key={kind}>
                  <button
                    className={["stamp-dialog__choice", isSelected ? "is-selected" : ""].filter(Boolean).join(" ")}
                    type="button"
                    aria-label={"Seleccionar sello " + preset.label}
                    aria-pressed={isSelected}
                    data-stamp-choice="true"
                    onClick={() => setSelectedKind(kind)}
                  >
                    <span
                      className="stamp-dialog__sample"
                      style={{
                        color: preset.textColor,
                        borderColor: preset.color,
                        backgroundColor: preset.style === "filled" ? preset.fillColor ?? "transparent" : "transparent"
                      }}
                    >
                      {preset.label}
                    </span>
                    {isSelected && <Check size={15} aria-label="Seleccionado" />}
                  </button>
                </div>
              );
            })}
          </div>
          <div
            className="stamp-dialog__preview"
            style={{
              color: selectedPreset.textColor,
              borderColor: selectedPreset.color,
              backgroundColor: selectedPreset.style === "filled" ? selectedPreset.fillColor ?? "transparent" : "transparent"
            }}
            aria-live="polite"
          >
            <Stamp size={17} aria-hidden="true" />
            {selectedPreset.label}
          </div>
        </div>
        <footer className="modal__footer">
          <button className="btn" type="button" onClick={onClose}>Cancelar</button>
          <button className="btn btn--primary" type="button" onClick={() => onCreate(selectedKind)}>
            Añadir {selectedPreset.label}
          </button>
        </footer>
      </section>
    </div>
  );
}

function getFocusableElements(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];
  return Array.from(container.querySelectorAll<HTMLElement>(
    "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"
  ));
}

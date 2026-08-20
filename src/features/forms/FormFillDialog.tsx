import { AlertTriangle, FileText, LoaderCircle, Lock, ShieldAlert, X } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  applyPdfFormValues,
  inspectPdfForm,
  type PdfFormField,
  type PdfFormFieldValue,
  type PdfFormInspection
} from "@/core/pdf/PdfForms";
import "./FormFillDialog.css";

export interface FormFillDialogProps {
  file: File;
  onClose: () => void;
  onOpenResult: (file: File) => void;
}

type DialogState =
  | { status: "loading" }
  | { status: "ready"; form: PdfFormInspection }
  | { status: "error"; message: string };

type DraftValues = Record<string, PdfFormFieldValue>;

/**
 * Local-only AcroForm editor. It deliberately works with the small,
 * serializable model from PdfForms rather than rendering arbitrary PDF
 * annotations or executing PDF actions.
 */
export function FormFillDialog({ file, onClose, onOpenResult }: FormFillDialogProps) {
  const [state, setState] = useState<DialogState>({ status: "loading" });
  const [draftValues, setDraftValues] = useState<DraftValues>({});
  const [dirtyFields, setDirtyFields] = useState<Set<string>>(() => new Set());
  const [flatten, setFlatten] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const firstControlRef = useRef<HTMLElement>(null);
  const savingRef = useRef(false);
  const titleId = useId();
  const descriptionId = useId();
  const errorId = useId();
  const statusId = useId();
  const form = state.status === "ready" ? state.form : null;

  useEffect(() => {
    savingRef.current = saving;
  }, [saving]);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    setDraftValues({});
    setDirtyFields(new Set());
    setFlatten(false);
    setSaveError(null);
    firstControlRef.current = null;

    void (async () => {
      try {
        const bytes = await file.arrayBuffer();
        const inspection = await inspectPdfForm(bytes);
        if (!cancelled) setState({ status: "ready", form: inspection });
      } catch (error) {
        if (!cancelled) setState({ status: "error", message: formatError(error, "No pudimos leer los campos del formulario.") });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [file]);

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusCloseButton = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (!savingRef.current) {
          event.preventDefault();
          onClose();
        }
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
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusCloseButton);
      document.removeEventListener("keydown", handleKeyDown);
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [onClose]);

  useEffect(() => {
    if (state.status !== "ready" || state.form.fields.length === 0) return;
    const focusFirstField = window.requestAnimationFrame(() => firstControlRef.current?.focus());
    return () => window.cancelAnimationFrame(focusFirstField);
  }, [state]);

  const registerFirstControl = useCallback((element: HTMLElement | null) => {
    if (element && !firstControlRef.current) firstControlRef.current = element;
  }, []);

  const updateValue = useCallback((name: string, value: PdfFormFieldValue) => {
    setDraftValues((current) => ({ ...current, [name]: Array.isArray(value) ? [...value] : value }));
    setDirtyFields((current) => {
      const next = new Set(current);
      next.add(name);
      return next;
    });
    setSaveError(null);
  }, []);

  const fieldsWithValues = useMemo(() => form?.fields.map((field) => ({
    field,
    value: fieldValue(field, draftValues)
  })) ?? [], [draftValues, form?.fields]);
  const firstEditableFieldIndex = form && !form.hasXfa ? form.fields.findIndex((field) => !field.readOnly) : -1;
  const canSave = Boolean(form && !form.hasXfa && (flatten || dirtyFields.size > 0) && !saving);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form || form.hasXfa || !canSave) return;

    setSaving(true);
    setSaveError(null);
    const values = changedValues(draftValues, dirtyFields);
    try {
      const bytes = await file.arrayBuffer();
      const result = await applyPdfFormValues(bytes, { values, flatten });
      const output = new File(
        [copyToArrayBuffer(result.bytes)],
        outputFileName(file.name, flatten),
        { type: "application/pdf", lastModified: Date.now() }
      );
      setSaving(false);
      onOpenResult(output);
      onClose();
    } catch (error) {
      setSaving(false);
      setSaveError(formatError(error, "No pudimos guardar una copia del formulario."));
    }
  };

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (!saving && event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className="modal form-fill-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId + (saveError ? " " + errorId : "")}
      >
        <header className="modal__header form-fill-dialog__header">
          <div>
            <h2 id={titleId}>Rellenar formulario</h2>
            <p id={descriptionId} className="modal__subheading">
              <FileText size={14} aria-hidden="true" />
              Se procesa localmente en tu navegador; este archivo no se sube a servidores.
            </p>
          </div>
          <button ref={closeButtonRef} className="icon-button" type="button" aria-label="Cerrar diálogo" onClick={onClose} disabled={saving}>
            <X size={17} aria-hidden="true" />
          </button>
        </header>

        <form onSubmit={submit} noValidate>
          <div className="modal__body form-fill-dialog__body">
            {state.status === "loading" ? <LoadingState /> : null}
            {state.status === "error" ? <LoadError message={state.message} /> : null}
            {form ? (
              <>
                <p className="form-fill-dialog__privacy">
                  <ShieldAlert size={16} aria-hidden="true" />
                  Esta herramienta no crea ni modifica firmas digitales. Los campos de firma y los formularios XFA se mantienen fuera de la edición.
                </p>

                {form.hasXfa ? (
                  <p className="form-fill-dialog__warning" role="alert">
                    <AlertTriangle size={16} aria-hidden="true" />
                    Este PDF contiene un formulario XFA. Free PDF solo rellena AcroForms estándar y no modificará este archivo.
                  </p>
                ) : null}

                {fieldsWithValues.length > 0 ? (
                  <div className="form-fill-dialog__fields">
                    <div className="form-fill-dialog__fields-heading">
                      <strong>Campos compatibles</strong>
                      <span>{fieldsWithValues.length} {fieldsWithValues.length === 1 ? "campo" : "campos"}</span>
                    </div>
                    {fieldsWithValues.map(({ field, value }, index) => (
                      <FieldEditor
                        key={field.name}
                        field={field}
                        value={value}
                        forceDisabled={form.hasXfa}
                        firstControlRef={index === firstEditableFieldIndex ? registerFirstControl : undefined}
                        onChange={(nextValue) => updateValue(field.name, nextValue)}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="form-fill-dialog__empty">
                    No encontramos campos AcroForm compatibles que se puedan rellenar localmente.
                  </p>
                )}

                {form.unsupportedFields.length > 0 ? (
                  <details className="form-fill-dialog__unsupported">
                    <summary>{form.unsupportedFields.length} {form.unsupportedFields.length === 1 ? "campo no compatible" : "campos no compatibles"}</summary>
                    <ul>
                      {form.unsupportedFields.map((field) => (
                        <li key={field.type + ":" + field.name}>
                          <strong>{field.name}</strong>
                          <span>{field.reason}.</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}

                {!form.hasXfa ? (
                  <label className="form-fill-dialog__flatten">
                    <input
                      type="checkbox"
                      checked={flatten}
                      disabled={saving}
                      onChange={(event) => setFlatten(event.target.checked)}
                    />
                    <span>
                      <strong>Aplanar tras rellenar</strong>
                      <small>Incorpora los valores visibles a las páginas y elimina los campos editables en la copia nueva.</small>
                    </span>
                  </label>
                ) : null}

                {flatten ? (
                  <p className="form-fill-dialog__irreversible" aria-live="polite">
                    <AlertTriangle size={16} aria-hidden="true" />
                    Aplanar es irreversible en la copia que se abrirá. Conserva el original si necesitas editar los campos después.
                  </p>
                ) : null}
                {!flatten && dirtyFields.size === 0 && !form.hasXfa ? (
                  <p id={statusId} className="form-fill-dialog__hint" aria-live="polite">Modifica un campo o activa el aplanado para crear una copia nueva.</p>
                ) : null}
              </>
            ) : null}
            {saveError ? <p id={errorId} className="inline-error" role="alert">{saveError}</p> : null}
          </div>

          <footer className="modal__footer form-fill-dialog__footer">
            <button className="btn" type="button" onClick={onClose} disabled={saving}>Cancelar</button>
            <button className="btn btn--primary" type="submit" disabled={!canSave}>
              {saving ? <LoaderCircle className="form-fill-dialog__spinner" size={16} aria-hidden="true" /> : null}
              {saving ? "Guardando copia…" : flatten ? "Aplanar y abrir copia" : "Guardar y abrir copia"}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}

function LoadingState() {
  return (
    <p className="form-fill-dialog__loading" role="status">
      <LoaderCircle className="form-fill-dialog__spinner" size={18} aria-hidden="true" />
      Leyendo los campos del PDF en este dispositivo…
    </p>
  );
}

function LoadError({ message }: { message: string }) {
  return (
    <p className="form-fill-dialog__warning" role="alert">
      <AlertTriangle size={16} aria-hidden="true" />
      {message}
    </p>
  );
}

interface FieldEditorProps {
  field: PdfFormField;
  value: PdfFormFieldValue;
  forceDisabled?: boolean;
  firstControlRef?: (element: HTMLElement | null) => void;
  onChange: (value: PdfFormFieldValue) => void;
}

function FieldEditor({ field, value, forceDisabled = false, firstControlRef, onChange }: FieldEditorProps) {
  const labelId = useId();
  const helpId = useId();
  const optionsId = useId();
  const label = field.required ? field.name + " (obligatorio)" : field.name;
  const disabled = field.readOnly || forceDisabled;
  const disabledNote = field.readOnly ? "Solo lectura" : forceDisabled ? "No editable en XFA" : null;

  if (field.type === "text") {
    const text = typeof value === "string" ? value : "";
    return (
      <label className="form-fill-dialog__field" aria-labelledby={labelId}>
        <span id={labelId} className="field-label">{label}</span>
        {field.multiline ? (
          <textarea
            ref={firstControlRef}
            className="field-input inspector__textarea"
            value={text}
            maxLength={field.maxLength ?? undefined}
            disabled={disabled}
            required={field.required}
            autoComplete="off"
            onChange={(event) => onChange(event.target.value)}
            aria-describedby={helpId}
          />
        ) : (
          <input
            ref={firstControlRef}
            className="field-input"
            type={field.password ? "password" : "text"}
            value={text}
            maxLength={field.maxLength ?? undefined}
            disabled={disabled}
            required={field.required}
            autoComplete={field.password ? "new-password" : "off"}
            placeholder={field.password ? "Valor oculto" : undefined}
            onChange={(event) => onChange(event.target.value)}
            aria-describedby={helpId}
          />
        )}
        <FieldHelp id={helpId} readOnly={field.readOnly} maxLength={field.maxLength} password={field.password} />
      </label>
    );
  }

  if (field.type === "checkbox") {
    return (
      <label className="form-fill-dialog__checkbox">
        <input
          ref={firstControlRef}
          type="checkbox"
          checked={value === true}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span>
          <strong>{label}</strong>
          {disabledNote ? <small><Lock size={12} aria-hidden="true" /> {disabledNote}</small> : null}
        </span>
      </label>
    );
  }

  if (field.type === "radio") {
    const selected = typeof value === "string" ? value : "";
    return (
      <fieldset className="form-fill-dialog__choice-group" disabled={disabled}>
        <legend id={labelId}>{label}</legend>
        <div role="radiogroup" aria-labelledby={labelId}>
          {field.allowEmptySelection && !field.required ? (
            <label>
              <input
                ref={firstControlRef}
                type="radio"
                name={"form-field-" + field.name}
                value=""
                checked={selected === ""}
                onChange={() => onChange(null)}
              />
              Sin seleccionar
            </label>
          ) : null}
          {field.options.map((option, index) => (
            <label key={option}>
              <input
                ref={index === 0 && (field.required || !field.allowEmptySelection) ? firstControlRef : undefined}
                type="radio"
                name={"form-field-" + field.name}
                value={option}
                checked={selected === option}
                required={field.required}
                onChange={() => onChange(option)}
              />
              {option}
            </label>
          ))}
        </div>
        {disabledNote ? <small className="form-fill-dialog__read-only"><Lock size={12} aria-hidden="true" /> {disabledNote}</small> : null}
      </fieldset>
    );
  }

  const selected = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  const multiple = field.multiple;
  if (field.type === "dropdown" && field.editable && !multiple) {
    return (
      <label className="form-fill-dialog__field" aria-labelledby={labelId}>
        <span id={labelId} className="field-label">{label}</span>
        <input
          ref={firstControlRef}
          className="field-input"
          type="text"
          list={optionsId}
          value={selected[0] ?? ""}
          disabled={disabled}
          required={field.required}
          autoComplete="off"
          onChange={(event) => onChange(event.target.value || null)}
          aria-describedby={helpId}
        />
        <datalist id={optionsId}>
          {field.options.map((option) => <option key={option} value={option} />)}
        </datalist>
        <FieldHelp id={helpId} readOnly={field.readOnly} editable />
      </label>
    );
  }

  return (
    <label className="form-fill-dialog__field" aria-labelledby={labelId}>
      <span id={labelId} className="field-label">{label}</span>
      <select
        ref={firstControlRef}
        className="field-input"
        value={multiple ? selected : selected[0] ?? ""}
        multiple={multiple}
        size={field.type === "list" ? Math.min(Math.max(field.options.length, 2), 6) : undefined}
        disabled={disabled}
        required={field.required}
        onChange={(event) => {
          const next = multiple
            ? Array.from(event.currentTarget.selectedOptions, (option) => option.value)
            : event.currentTarget.value || null;
          onChange(next);
        }}
        aria-describedby={helpId}
      >
        {!multiple ? <option value="">Sin seleccionar</option> : null}
        {field.options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
      <FieldHelp id={helpId} readOnly={field.readOnly} multiple={multiple} editable={field.type === "dropdown" ? field.editable : false} />
    </label>
  );
}

function FieldHelp({
  id,
  readOnly,
  maxLength,
  multiple,
  editable,
  password
}: {
  id: string;
  readOnly: boolean;
  maxLength?: number | null;
  multiple?: boolean;
  editable?: boolean;
  password?: boolean;
}) {
  const details: string[] = [];
  if (readOnly) details.push("Solo lectura.");
  if (maxLength !== null && maxLength !== undefined) details.push("Máximo " + maxLength + " caracteres.");
  if (multiple) details.push("Permite varias opciones.");
  if (editable) details.push("Admite una opción escrita.");
  if (password) details.push("El valor existente se mantiene oculto.");
  return details.length > 0 ? <small id={id} className="form-fill-dialog__field-help">{details.join(" ")}</small> : null;
}

function fieldValue(field: PdfFormField, drafts: DraftValues): PdfFormFieldValue {
  if (Object.prototype.hasOwnProperty.call(drafts, field.name)) return drafts[field.name] as PdfFormFieldValue;
  return Array.isArray(field.value) ? [...field.value] : field.value;
}

function changedValues(drafts: DraftValues, dirtyFields: ReadonlySet<string>): DraftValues {
  const values: DraftValues = {};
  for (const name of dirtyFields) {
    const value = drafts[name];
    if (value !== undefined) values[name] = Array.isArray(value) ? [...value] : value;
  }
  return values;
}

function outputFileName(inputName: string, flattened: boolean): string {
  const trimmed = inputName.trim() || "documento.pdf";
  const baseName = trimmed.toLowerCase().endsWith(".pdf") ? trimmed.slice(0, -4) : trimmed;
  return baseName + "-" + (flattened ? "aplanado" : "rellenado") + ".pdf";
}

function copyToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

function formatError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

function getFocusableElements(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];
  return Array.from(container.querySelectorAll<HTMLElement>(
    "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"
  ));
}

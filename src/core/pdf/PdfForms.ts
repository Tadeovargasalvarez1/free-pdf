import {
  PDFButton,
  PDFCheckBox,
  PDFDocument,
  PDFDropdown,
  PDFOptionList,
  PDFRadioGroup,
  PDFSignature,
  PDFTextField,
  type PDFField,
  type PDFForm
} from "pdf-lib";
import type { PdfPageInput } from "@/core/pdf/PdfPageOperations";

/** Bytes accepted by the local AcroForm adapter. They are always copied first. */
export type PdfFormInput = PdfPageInput;

/** Values deliberately remain JSON-serializable so the UI can keep them in local state. */
export type PdfFormFieldValue = string | boolean | string[] | null;

export type PdfFormFieldKind = "text" | "checkbox" | "radio" | "dropdown" | "list";

interface PdfFormFieldBase {
  /** Fully-qualified AcroForm field name. */
  name: string;
  type: PdfFormFieldKind;
  required: boolean;
  readOnly: boolean;
}

export interface PdfTextFormField extends PdfFormFieldBase {
  type: "text";
  /** `null` means no value. Password values are intentionally never exposed. */
  value: string | null;
  maxLength: number | null;
  multiline: boolean;
  password: boolean;
}

export interface PdfCheckboxFormField extends PdfFormFieldBase {
  type: "checkbox";
  value: boolean;
}

export interface PdfRadioFormField extends PdfFormFieldBase {
  type: "radio";
  value: string | null;
  options: string[];
  allowEmptySelection: boolean;
}

export interface PdfDropdownFormField extends PdfFormFieldBase {
  type: "dropdown";
  value: string[];
  options: string[];
  editable: boolean;
  multiple: boolean;
}

export interface PdfListFormField extends PdfFormFieldBase {
  type: "list";
  value: string[];
  options: string[];
  multiple: boolean;
}

export type PdfFormField =
  | PdfTextFormField
  | PdfCheckboxFormField
  | PdfRadioFormField
  | PdfDropdownFormField
  | PdfListFormField;

/** A field the adapter intentionally refuses to modify rather than pretending it worked. */
export interface PdfUnsupportedFormField {
  name: string;
  type: "button" | "signature" | "rich-text" | "file-selector" | "unknown";
  reason: string;
}

/** Serializable form metadata returned by inspection and after a fill operation. */
export interface PdfFormInspection {
  fields: PdfFormField[];
  unsupportedFields: PdfUnsupportedFormField[];
  /** XFA requires a different engine and is not mutated by this AcroForm adapter. */
  hasXfa: boolean;
}

export interface ApplyPdfFormValuesOptions {
  /** Map from a fully-qualified field name to a JSON-serializable value. */
  values: Record<string, PdfFormFieldValue>;
  /** Bake fields into the page content after applying values. This cannot be undone in the output PDF. */
  flatten?: boolean;
}

export interface ApplyPdfFormValuesResult {
  bytes: Uint8Array;
  /** Values and field metadata after they were applied, before optional flattening. */
  form: PdfFormInspection;
  flattened: boolean;
}

/**
 * Reads standard AcroForm fields locally. The returned metadata contains no
 * pdf-lib instances, so it is safe to store or serialize in application state.
 */
export async function inspectPdfForm(sourceBytes: PdfFormInput): Promise<PdfFormInspection> {
  const document = await loadUnencryptedPdf(sourceBytes);
  return describeForm(document.getForm());
}

/**
 * Applies values to supported AcroForm fields in a fresh local PDF copy.
 * This does not sign, certify, or otherwise cryptographically protect a PDF.
 */
export async function applyPdfFormValues(
  sourceBytes: PdfFormInput,
  options: ApplyPdfFormValuesOptions
): Promise<ApplyPdfFormValuesResult> {
  const document = await loadUnencryptedPdf(sourceBytes);
  const form = document.getForm();

  if (form.hasXFA()) {
    throw new Error("Este PDF contiene un formulario XFA. Free PDF solo puede rellenar AcroForms est\u00e1ndar sin XFA.");
  }

  const values = validateValueMap(options?.values);
  const fieldsByName = new Map<string, PDFField>();
  const unsupportedByName = new Map<string, PdfUnsupportedFormField>();
  for (const field of form.getFields()) {
    const described = describeField(field);
    if ("reason" in described) unsupportedByName.set(described.name, described);
    else fieldsByName.set(described.name, field);
  }

  for (const [name, value] of Object.entries(values)) {
    const unsupported = unsupportedByName.get(name);
    if (unsupported) {
      throw new Error(`El campo \u00ab${name}\u00bb no se puede rellenar: ${unsupported.reason}`);
    }

    const field = fieldsByName.get(name);
    if (!field) {
      throw new Error(`No existe un campo AcroForm compatible llamado \u00ab${name}\u00bb.`);
    }
    if (field.isReadOnly()) {
      throw new Error(`El campo \u00ab${name}\u00bb es de solo lectura y no se modific\u00f3.`);
    }
    applyFieldValue(field, value);
  }

  try {
    // Explicitly update appearances before saving/flattening. Some PDF viewers
    // otherwise show stale field visuals even though the value was stored.
    form.updateFieldAppearances();
  } catch (error) {
    throw new Error(formatAppearanceError(error));
  }

  const flattened = options.flatten === true;
  const resultForm = describeForm(form);
  if (flattened) {
    if (resultForm.unsupportedFields.some((field) => field.type === "signature")) {
      throw new Error("No aplanamos un PDF que contiene un campo de firma digital, porque podr\u00eda afectar su validez.");
    }
    try {
      // The appearance streams were just generated above, so avoid doing it a
      // second time and preserve the exact appearance that was validated.
      form.flatten({ updateFieldAppearances: false });
    } catch (error) {
      throw new Error(formatFlattenError(error));
    }
  }

  try {
    return {
      bytes: await document.save({ useObjectStreams: true, addDefaultPage: false }),
      form: resultForm,
      flattened
    };
  } catch {
    throw new Error("No pudimos crear la copia PDF con los valores del formulario.");
  }
}

/** Alias intended for callers that present the operation as “rellenar formulario”. */
export const fillPdfForm = applyPdfFormValues;

/** Bakes an existing AcroForm into the page content without changing its values. */
export async function flattenPdfForm(sourceBytes: PdfFormInput): Promise<Uint8Array> {
  const result = await applyPdfFormValues(sourceBytes, { values: {}, flatten: true });
  return result.bytes;
}

function describeForm(form: PDFForm): PdfFormInspection {
  const fields: PdfFormField[] = [];
  const unsupportedFields: PdfUnsupportedFormField[] = [];

  for (const field of form.getFields()) {
    const described = describeField(field);
    if ("reason" in described) unsupportedFields.push(described);
    else fields.push(described);
  }

  return {
    fields,
    unsupportedFields,
    hasXfa: form.hasXFA()
  };
}

function describeField(field: PDFField): PdfFormField | PdfUnsupportedFormField {
  const name = field.getName();
  const common = {
    name,
    required: field.isRequired(),
    readOnly: field.isReadOnly()
  };

  if (field instanceof PDFTextField) {
    if (field.isRichFormatted()) {
      return unsupported(name, "rich-text", "los campos de texto enriquecido no son compatibles con este motor local");
    }
    if (field.isFileSelector()) {
      return unsupported(name, "file-selector", "los selectores de archivos no se pueden rellenar desde el navegador");
    }
    const password = field.isPassword();
    return {
      ...common,
      type: "text",
      // Never copy an existing password into a serializable UI model.
      value: password ? null : field.getText() ?? null,
      maxLength: field.getMaxLength() ?? null,
      multiline: field.isMultiline(),
      password
    };
  }

  if (field instanceof PDFCheckBox) {
    return { ...common, type: "checkbox", value: field.isChecked() };
  }

  if (field instanceof PDFRadioGroup) {
    return {
      ...common,
      type: "radio",
      value: field.getSelected() ?? null,
      options: [...field.getOptions()],
      allowEmptySelection: field.isOffToggleable()
    };
  }

  if (field instanceof PDFDropdown) {
    return {
      ...common,
      type: "dropdown",
      value: [...field.getSelected()],
      options: [...field.getOptions()],
      editable: field.isEditable(),
      multiple: field.isMultiselect()
    };
  }

  if (field instanceof PDFOptionList) {
    return {
      ...common,
      type: "list",
      value: [...field.getSelected()],
      options: [...field.getOptions()],
      multiple: field.isMultiselect()
    };
  }

  if (field instanceof PDFButton) {
    return unsupported(name, "button", "los botones con acciones no se ejecutan ni se rellenan");
  }
  if (field instanceof PDFSignature) {
    return unsupported(name, "signature", "las firmas digitales no se crean ni se modifican desde este formulario");
  }
  return unsupported(name, "unknown", "el tipo de campo no es compatible con este motor local");
}

function unsupported(name: string, type: PdfUnsupportedFormField["type"], reason: string): PdfUnsupportedFormField {
  return { name, type, reason };
}

function applyFieldValue(field: PDFField, value: PdfFormFieldValue): void {
  const name = field.getName();

  if (field instanceof PDFTextField) {
    if (typeof value !== "string" && value !== null) {
      throw new Error(`El campo \u00ab${name}\u00bb espera texto o un valor vac\u00edo.`);
    }
    const maxLength = field.getMaxLength();
    if (typeof value === "string" && maxLength !== undefined && value.length > maxLength) {
      throw new Error(`El campo \u00ab${name}\u00bb admite como m\u00e1ximo ${maxLength} caracteres.`);
    }
    field.setText(value || undefined);
    return;
  }

  if (field instanceof PDFCheckBox) {
    if (typeof value !== "boolean") {
      throw new Error(`El campo \u00ab${name}\u00bb espera verdadero o falso.`);
    }
    if (value) field.check();
    else field.uncheck();
    return;
  }

  if (field instanceof PDFRadioGroup) {
    if (value === null) {
      field.clear();
      return;
    }
    if (typeof value !== "string" || !value) {
      throw new Error(`El campo \u00ab${name}\u00bb espera una de sus opciones o un valor vac\u00edo.`);
    }
    assertKnownOptions(name, [value], field.getOptions());
    field.select(value);
    return;
  }

  if (field instanceof PDFDropdown) {
    const selected = normalizeSelections(name, value);
    if (!field.isMultiselect() && selected.length > 1) {
      throw new Error(`El campo \u00ab${name}\u00bb solo permite una opci\u00f3n.`);
    }
    if (!field.isEditable()) assertKnownOptions(name, selected, field.getOptions());
    if (selected.length === 0) field.clear();
    else field.select(selected);
    return;
  }

  if (field instanceof PDFOptionList) {
    const selected = normalizeSelections(name, value);
    if (!field.isMultiselect() && selected.length > 1) {
      throw new Error(`El campo \u00ab${name}\u00bb solo permite una opci\u00f3n.`);
    }
    assertKnownOptions(name, selected, field.getOptions());
    if (selected.length === 0) field.clear();
    else field.select(selected);
    return;
  }

  throw new Error(`El campo \u00ab${name}\u00bb no es compatible con el rellenado local.`);
}

function normalizeSelections(name: string, value: PdfFormFieldValue): string[] {
  if (value === null) return [];
  const selected = typeof value === "string" ? [value] : value;
  if (!Array.isArray(selected) || selected.some((option) => typeof option !== "string" || !option)) {
    throw new Error(`El campo \u00ab${name}\u00bb espera una opci\u00f3n, varias opciones o un valor vac\u00edo.`);
  }
  if (new Set(selected).size !== selected.length) {
    throw new Error(`El campo \u00ab${name}\u00bb no puede contener la misma opci\u00f3n m\u00e1s de una vez.`);
  }
  return [...selected];
}

function assertKnownOptions(name: string, selected: readonly string[], options: readonly string[]): void {
  const invalid = selected.find((value) => !options.includes(value));
  if (invalid !== undefined) {
    throw new Error(`La opci\u00f3n \u00ab${invalid}\u00bb no existe en el campo \u00ab${name}\u00bb.`);
  }
}

function validateValueMap(values: unknown): Record<string, PdfFormFieldValue> {
  if (!values || typeof values !== "object" || Array.isArray(values)) {
    throw new Error("Los valores del formulario deben ser un mapa de nombres de campo y valores simples.");
  }

  const normalized: Record<string, PdfFormFieldValue> = {};
  for (const [name, value] of Object.entries(values)) {
    if (!name.trim()) throw new Error("Cada valor del formulario necesita un nombre de campo.");
    if (!isSerializableFormValue(value)) {
      throw new Error(`El valor de \u00ab${name}\u00bb debe ser texto, verdadero/falso, una lista de textos o vac\u00edo.`);
    }
    normalized[name] = Array.isArray(value) ? [...value] : value;
  }
  return normalized;
}

function isSerializableFormValue(value: unknown): value is PdfFormFieldValue {
  return value === null
    || typeof value === "string"
    || typeof value === "boolean"
    || (Array.isArray(value) && value.every((item) => typeof item === "string"));
}

async function loadUnencryptedPdf(input: PdfFormInput): Promise<PDFDocument> {
  let bytes: Uint8Array;
  try {
    bytes = clonePdfBytes(input);
  } catch {
    throw new Error("No pudimos leer este PDF. Selecciona un archivo PDF v\u00e1lido.");
  }

  try {
    return await PDFDocument.load(bytes, { ignoreEncryption: false, updateMetadata: false });
  } catch (error) {
    if (isEncryptedPdfError(error)) {
      throw new Error("Este PDF est\u00e1 protegido con contrase\u00f1a. Los formularios locales solo admiten PDFs sin cifrar.");
    }
    throw new Error("No pudimos abrir este PDF. El archivo puede estar da\u00f1ado o no ser compatible.");
  }
}

function clonePdfBytes(input: PdfFormInput): Uint8Array {
  if (input instanceof Uint8Array) {
    if (input.byteLength === 0) throw new Error("empty input");
    return new Uint8Array(input);
  }
  if (input instanceof ArrayBuffer) {
    if (input.byteLength === 0) throw new Error("empty input");
    return new Uint8Array(input.slice(0));
  }
  throw new Error("invalid input");
}

function formatAppearanceError(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (/WinAnsi|encoding|character/i.test(message)) {
    return "No pudimos generar la apariencia del campo porque contiene caracteres que la fuente del PDF no admite.";
  }
  return "No pudimos generar la apariencia visible de los campos del formulario.";
}

function formatFlattenError(_error: unknown): string {
  return "No pudimos aplanar este formulario. El PDF puede usar widgets o apariencias no compatibles.";
}

function isEncryptedPdfError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /encrypt|password|contrase(?:\u00f1|n)a/i.test(message);
}

import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";
import {
  applyPdfFormValues,
  flattenPdfForm,
  inspectPdfForm
} from "@/core/pdf/PdfForms";

async function createAcroFormPdf(): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const page = document.addPage([600, 600]);
  const font = await document.embedFont(StandardFonts.Helvetica);
  const form = document.getForm();

  const name = form.createTextField("profile.name");
  name.setMaxLength(12);
  name.enableRequired();
  name.addToPage(page, { x: 50, y: 520, width: 220, height: 28, font });

  const accepted = form.createCheckBox("profile.accepted");
  accepted.addToPage(page, { x: 50, y: 470, width: 20, height: 20 });

  const accountType = form.createRadioGroup("profile.accountType");
  accountType.addOptionToPage("personal", page, { x: 50, y: 420, width: 18, height: 18 });
  accountType.addOptionToPage("business", page, { x: 120, y: 420, width: 18, height: 18 });

  const country = form.createDropdown("profile.country");
  country.setOptions(["Bolivia", "Peru", "Chile"]);
  country.addToPage(page, { x: 50, y: 360, width: 180, height: 28, font });

  const topics = form.createOptionList("profile.topics");
  topics.setOptions(["Design", "PDF", "Privacy"]);
  topics.enableMultiselect();
  topics.addToPage(page, { x: 50, y: 240, width: 180, height: 90, font });

  const action = form.createButton("profile.action");
  action.addToPage("Action", page, { x: 50, y: 180, width: 100, height: 26, font });

  form.updateFieldAppearances(font);
  return document.save({ useObjectStreams: false, addDefaultPage: false });
}

describe("local AcroForm support", () => {
  it("detects supported fields as serializable metadata and leaves source bytes intact", async () => {
    const source = await createAcroFormPdf();
    const sourceBefore = source.slice();

    const inspection = await inspectPdfForm(source);
    const fieldsByName = new Map(inspection.fields.map((field) => [field.name, field]));

    expect(source).toEqual(sourceBefore);
    expect(inspection.hasXfa).toBe(false);
    expect(JSON.parse(JSON.stringify(inspection))).toEqual(inspection);
    expect(fieldsByName.get("profile.name")).toMatchObject({
      type: "text",
      value: null,
      maxLength: 12,
      required: true,
      multiline: false
    });
    expect(fieldsByName.get("profile.accepted")).toMatchObject({ type: "checkbox", value: false });
    expect(fieldsByName.get("profile.accountType")).toMatchObject({
      type: "radio",
      options: ["personal", "business"],
      value: null
    });
    expect(fieldsByName.get("profile.country")).toMatchObject({
      type: "dropdown",
      options: ["Bolivia", "Peru", "Chile"],
      value: [],
      editable: false,
      multiple: false
    });
    expect(fieldsByName.get("profile.topics")).toMatchObject({
      type: "list",
      options: ["Design", "PDF", "Privacy"],
      value: [],
      multiple: true
    });
    expect(inspection.unsupportedFields).toEqual([
      expect.objectContaining({ name: "profile.action", type: "button" })
    ]);
  });

  it("fills every supported field locally and creates up-to-date field appearances", async () => {
    const source = await createAcroFormPdf();
    const sourceBefore = source.slice();
    const result = await applyPdfFormValues(source, {
      values: {
        "profile.name": "Ada Lovelace",
        "profile.accepted": true,
        "profile.accountType": "business",
        "profile.country": "Bolivia",
        "profile.topics": ["PDF", "Privacy"]
      }
    });
    const reopened = await PDFDocument.load(result.bytes);
    const form = reopened.getForm();

    expect(result.flattened).toBe(false);
    expect(source).toEqual(sourceBefore);
    expect(result.form.fields.find((field) => field.name === "profile.name")).toMatchObject({ value: "Ada Lovelace" });
    expect(form.getTextField("profile.name").getText()).toBe("Ada Lovelace");
    expect(form.getCheckBox("profile.accepted").isChecked()).toBe(true);
    expect(form.getRadioGroup("profile.accountType").getSelected()).toBe("business");
    expect(form.getDropdown("profile.country").getSelected()).toEqual(["Bolivia"]);
    expect(form.getOptionList("profile.topics").getSelected()).toEqual(["PDF", "Privacy"]);
    expect(form.getTextField("profile.name").needsAppearancesUpdate()).toBe(false);
  });

  it("validates local values before writing a new PDF", async () => {
    const source = await createAcroFormPdf();

    await expect(applyPdfFormValues(source, {
      values: { "profile.name": "A name that is too long" }
    })).rejects.toThrow("caracteres");
    await expect(applyPdfFormValues(source, {
      values: { "profile.country": "Argentina" }
    })).rejects.toThrow("no existe");
    await expect(applyPdfFormValues(source, {
      values: { "profile.country": ["Bolivia", "Chile"] }
    })).rejects.toThrow("solo permite una");
    await expect(applyPdfFormValues(source, {
      values: { "profile.missing": "x" }
    })).rejects.toThrow("No existe un campo");
    await expect(applyPdfFormValues(source, {
      values: { "profile.action": "x" }
    })).rejects.toThrow("no se puede rellenar");
  });

  it("flattens an AcroForm after generating field appearances", async () => {
    const source = await createAcroFormPdf();
    const result = await applyPdfFormValues(source, {
      values: {
        "profile.name": "Grace Hopper",
        "profile.accepted": true,
        "profile.accountType": "personal",
        "profile.country": "Chile",
        "profile.topics": ["Design"]
      },
      flatten: true
    });
    const reopened = await PDFDocument.load(result.bytes);

    expect(result.flattened).toBe(true);
    expect(result.form.fields.find((field) => field.name === "profile.country")).toMatchObject({ value: ["Chile"] });
    expect(reopened.getPageCount()).toBe(1);
    expect(reopened.getForm().getFields()).toHaveLength(0);
    expect(result.bytes.byteLength).toBeGreaterThan(200);

    const independentlyFlattened = await flattenPdfForm(source);
    const reopenedIndependent = await PDFDocument.load(independentlyFlattened);
    expect(reopenedIndependent.getForm().getFields()).toHaveLength(0);
  });
});

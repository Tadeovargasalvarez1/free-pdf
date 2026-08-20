import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { readPdfMetadata, updatePdfMetadata } from "@/core/pdf/PdfMetadata";
import type { PdfInfoMetadataUpdate } from "@/core/pdf/PdfMetadata";

const originalCreationDate = new Date(Date.UTC(2018, 1, 3, 4, 5, 6));
const originalModificationDate = new Date(Date.UTC(2019, 2, 4, 5, 6, 7));
const replacementCreationDate = new Date(Date.UTC(2022, 5, 7, 8, 9, 10));
const replacementModificationDate = new Date(Date.UTC(2024, 7, 8, 9, 10, 11));

async function createSourcePdf(): Promise<Uint8Array> {
  const document = await PDFDocument.create({ updateMetadata: false });
  document.addPage([240, 320]);
  document.setTitle("Titulo original");
  document.setAuthor("Autor original");
  document.setSubject("Asunto original");
  document.setKeywords(["uno, dos"]);
  document.setCreator("Creador original");
  document.setProducer("Productor original");
  document.setCreationDate(originalCreationDate);
  document.setModificationDate(originalModificationDate);
  return document.save({ addDefaultPage: false });
}

describe("local PDF Info metadata", () => {
  it("reads the basic Info fields from a local PDF without mutating its source bytes", async () => {
    const source = await createSourcePdf();
    const before = source.slice();

    const metadata = await readPdfMetadata(source);

    expect(metadata).toMatchObject({
      title: "Titulo original",
      author: "Autor original",
      subject: "Asunto original",
      keywords: "uno, dos",
      creator: "Creador original",
      producer: "Productor original"
    });
    expect(metadata.creationDate?.getTime()).toBe(originalCreationDate.getTime());
    expect(metadata.modificationDate?.getTime()).toBe(originalModificationDate.getTime());
    expect(source).toEqual(before);

    metadata.creationDate?.setUTCFullYear(2040);
    expect((await readPdfMetadata(source)).creationDate?.getTime()).toBe(originalCreationDate.getTime());
  });

  it("writes a new copy with updated Info values, preserves omitted values, and reopens it", async () => {
    const source = await createSourcePdf();
    const before = source.slice();

    const output = await updatePdfMetadata(source, {
      title: "Informe actualizado",
      author: "Ada Lovelace",
      subject: "Resultados locales",
      keywords: "pdf, privacidad, sin nube",
      creator: "Free PDF",
      producer: "Free PDF local",
      creationDate: replacementCreationDate,
      modificationDate: replacementModificationDate
    });
    const reopened = await PDFDocument.load(output, { updateMetadata: false });
    const metadata = await readPdfMetadata(output);

    expect(source).toEqual(before);
    expect(output).not.toBe(source);
    expect(reopened.getTitle()).toBe("Informe actualizado");
    expect(reopened.getAuthor()).toBe("Ada Lovelace");
    expect(reopened.getSubject()).toBe("Resultados locales");
    expect(reopened.getKeywords()).toBe("pdf, privacidad, sin nube");
    expect(reopened.getCreator()).toBe("Free PDF");
    expect(reopened.getProducer()).toBe("Free PDF local");
    expect(reopened.getCreationDate()?.getTime()).toBe(replacementCreationDate.getTime());
    expect(reopened.getModificationDate()?.getTime()).toBe(replacementModificationDate.getTime());
    expect(metadata).toMatchObject({ title: "Informe actualizado", producer: "Free PDF local" });

    const titleOnly = await updatePdfMetadata(output, { title: "Solo cambia el titulo" });
    const partiallyUpdated = await readPdfMetadata(titleOnly);
    expect(partiallyUpdated).toMatchObject({
      title: "Solo cambia el titulo",
      author: "Ada Lovelace",
      keywords: "pdf, privacidad, sin nube"
    });
  });

  it("rejects malformed fields before writing an output PDF", async () => {
    const source = await createSourcePdf();
    const before = source.slice();

    await expect(updatePdfMetadata(source, { title: `${String.fromCharCode(0)}no valido` })).rejects.toThrow("caracteres nulos");
    await expect(updatePdfMetadata(source, { creationDate: new Date("invalid") })).rejects.toThrow("fecha valida");
    await expect(updatePdfMetadata(source, {
      creationDate: replacementModificationDate,
      modificationDate: replacementCreationDate
    })).rejects.toThrow("no puede ser posterior");
    const unsupportedField = { unexpected: "campo" } as unknown as PdfInfoMetadataUpdate;
    await expect(updatePdfMetadata(source, unsupportedField)).rejects.toThrow("no es compatible");
    expect(source).toEqual(before);
  });
});

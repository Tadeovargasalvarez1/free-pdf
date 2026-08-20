import { PDFDict, PDFDocument, PDFName, PDFRawStream } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { createPdfFromImages, createPdfFromText } from "@/core/pdf/PdfConversion";

const ONE_PIXEL_PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41,
  0x54, 0x08, 0x99, 0x63, 0xf8, 0xcf, 0xc0, 0xf0,
  0x1f, 0x00, 0x05, 0x80, 0x02, 0xff, 0x93, 0xe4,
  0x2f, 0x2f, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45,
  0x4e, 0x44, 0xae, 0x42, 0x60, 0x82
]);
const ONE_PIXEL_JPEG = Uint8Array.from(atob(
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQL/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/AX//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/AX//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/An//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/If/Z"
), (character) => character.charCodeAt(0));

describe("PdfConversion", () => {
  it("creates a real PDF from local PNG and JPEG bytes without mutating the input", async () => {
    const input = ONE_PIXEL_PNG.slice();
    const result = await createPdfFromImages([
      { bytes: input.buffer, name: "muestra.png", mimeType: "image/png" },
      { bytes: ONE_PIXEL_JPEG, name: "muestra.jpeg", mimeType: "image/jpeg" }
    ], { pageSize: "letter", orientation: "landscape", margin: 24, fileName: "fotos" });
    const reopened = await PDFDocument.load(result.bytes);

    expect(result).toMatchObject({ name: "fotos.pdf", mimeType: "application/pdf", pageCount: 2 });
    expect(input).toEqual(ONE_PIXEL_PNG);
    expect(reopened.getPageCount()).toBe(2);
    expect(reopened.getPage(0).getWidth()).toBe(792);
    expect(reopened.getPage(0).getHeight()).toBe(612);
    expect(reopened.getTitle()).toBe("Imágenes convertidas");
    expect(countEmbeddedImages(reopened)).toBeGreaterThanOrEqual(2);
  });

  it("wraps UTF-8 plain text across fresh pages and can read File-shaped bytes", async () => {
    const repeatedLine = "Free PDF crea este documento local sin enviar el texto a ningún servidor. ";
    const source = new TextEncoder().encode(`${repeatedLine.repeat(90)}\n\nFin.`);
    const result = await createPdfFromText(
      { bytes: source, name: "notas.txt", mimeType: "text/plain; charset=utf-8" },
      { pageSize: { width: 160, height: 140 }, margin: 18, fontSize: 10, lineHeight: 14 }
    );
    const reopened = await PDFDocument.load(result.bytes);

    expect(result.name).toBe("notas-convertido.pdf");
    expect(result.pageCount).toBeGreaterThan(1);
    expect(reopened.getPageCount()).toBe(result.pageCount);
    expect(reopened.getTitle()).toBe("notas");
    expect(reopened.getPage(0).getWidth()).toBe(140);
    expect(reopened.getPage(0).getHeight()).toBe(160);
    expect(hasTextContentStream(reopened)).toBe(true);
  });

  it("rejects unsupported input with user-facing errors", async () => {
    await expect(createPdfFromImages([
      { bytes: ONE_PIXEL_PNG, name: "muestra.webp", mimeType: "image/webp" }
    ])).rejects.toThrow("solo admite imágenes PNG y JPEG");
    await expect(createPdfFromText({ text: "", name: "vacio.txt", mimeType: "text/plain" }))
      .rejects.toThrow("El texto está vacío");
  });
});

function countEmbeddedImages(document: PDFDocument): number {
  return [...document.context.enumerateIndirectObjects()]
    .filter(([, object]) => object instanceof PDFRawStream && object.dict.get(PDFName.of("Subtype"))?.toString() === "/Image").length;
}

function hasTextContentStream(document: PDFDocument): boolean {
  const firstPage = document.getPage(0);
  const resources = firstPage.node.Resources();
  const fonts = resources?.lookupMaybe(PDFName.of("Font"), PDFDict);
  return Boolean(fonts && fonts.keys().length > 0);
}

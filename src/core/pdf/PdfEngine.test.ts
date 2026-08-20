import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";
import type { PDFProject } from "@/types/pdf";

// pdf.js initialises DOMMatrix at module load. The exporter itself does not
// render, so a small test-only shim keeps the PDF writer test browser-neutral.
if (!("DOMMatrix" in globalThis)) {
  Object.defineProperty(globalThis, "DOMMatrix", { value: class DOMMatrix {} });
}

const { BrowserPdfEngine } = await import("@/core/pdf/PdfEngine");

async function createSourcePdf(): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  for (const label of ["uno", "dos", "tres"]) {
    const page = document.addPage([300, 400]);
    page.drawText(label, { x: 30, y: 360, size: 18, font });
  }
  return document.save();
}

describe("BrowserPdfEngine export", () => {
  it("exports a new PDF with reordered/deleted pages, rotation and a text overlay", async () => {
    const sourceBytes = await createSourcePdf();
    const project: PDFProject = {
      id: "project-1",
      source: { id: "source-1", name: "source.pdf", mimeType: "application/pdf", byteLength: sourceBytes.byteLength },
      pages: [
        { id: "page-third", sourcePageIndex: 2, size: { width: 300, height: 400 }, cropBox: { x: 25, y: 30, width: 200, height: 250 }, rotation: 0 },
        { id: "page-first", sourcePageIndex: 0, size: { width: 300, height: 400 }, rotation: 90 }
      ],
      overlays: [
        {
          id: "text-1",
          pageId: "page-third",
          type: "text",
          x: 50,
          y: 120,
          width: 160,
          height: 36,
          rotation: 0,
          opacity: 1,
          zIndex: 1,
          text: "Hola mundo",
          fontFamily: "Helvetica",
          fontSize: 18,
          color: "#2854db",
          fontWeight: "bold",
          fontStyle: "normal",
          textDecoration: "none",
          textAlign: "left",
          lineHeight: 22,
          letterSpacing: 0
        },
        {
          id: "image-1",
          pageId: "page-third",
          type: "image",
          x: 48,
          y: 48,
          width: 72,
          height: 72,
          rotation: 0,
          opacity: 1,
          zIndex: 2,
          assetId: "image-asset",
          mimeType: "image/png",
          preserveAspectRatio: true
        },
        {
          id: "signature-1",
          pageId: "page-third",
          type: "signature",
          x: 145,
          y: 48,
          width: 110,
          height: 44,
          rotation: 0,
          opacity: 1,
          zIndex: 3,
          signature: { kind: "typed", text: "Ada Lovelace", fontFamily: "cursive", color: "#172033" }
        }
      ],
      metadata: { title: "Prueba de exportación" },
      history: { undoDepth: 0, redoDepth: 0, capacity: 100 },
      createdAt: 1,
      updatedAt: 1
    };

    const output = await new BrowserPdfEngine().export({
      project,
      sourceBytes,
      assets: new Map([[
        "image-asset",
        {
          id: "image-asset",
          name: "test.png",
          mimeType: "image/png",
          dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL4RAAAAABJRU5ErkJggg==",
          width: 1,
          height: 1
        }
      ]])
    });
    const reopened = await PDFDocument.load(output);

    expect(reopened.getPageCount()).toBe(2);
    expect(reopened.getPage(0).getRotation().angle).toBe(0);
    expect(reopened.getPage(0).getCropBox()).toMatchObject({ x: 25, y: 30, width: 200, height: 250 });
    expect(reopened.getPage(1).getRotation().angle).toBe(90);
    expect(reopened.getTitle()).toBe("Prueba de exportación");
    expect(output.byteLength).toBeGreaterThan(sourceBytes.byteLength / 2);
  });
});

import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { exportPdfProject } from "@/core/pdf/PdfWriter";
import { createHighlightObject, createNoteObject } from "@/features/editor/utils/editorObjects";
import type { PDFPageModel, PDFProject } from "@/types/pdf";

const page: PDFPageModel = {
  id: "page-1",
  sourcePageIndex: 0,
  size: { width: 360, height: 480 },
  rotation: 0
};

describe("visual annotations", () => {
  it("creates editable highlight and note objects and flattens them into a new PDF copy", async () => {
    const highlight = createHighlightObject(page, { x: 40, y: 350 });
    const note = createNoteObject(page, { x: 120, y: 260 });
    note.content = "Revisar esta sección antes de enviar.";
    const source = await PDFDocument.create();
    source.addPage([360, 480]);
    const sourceBytes = await source.save({ addDefaultPage: false });
    const sourceBefore = sourceBytes.slice();
    const project: PDFProject = {
      id: "annotation-project",
      source: { id: "source-1", name: "source.pdf", mimeType: "application/pdf", byteLength: sourceBytes.byteLength },
      pages: [page],
      overlays: [highlight, note],
      metadata: {},
      history: { undoDepth: 0, redoDepth: 0, capacity: 100 },
      createdAt: 1,
      updatedAt: 1
    };

    const output = await exportPdfProject({ project, sourceBytes, assets: new Map() });
    const reopened = await PDFDocument.load(output);

    expect(highlight).toMatchObject({ type: "shape", fillColor: "#facc15", stroke: null, opacity: 0.42 });
    expect(note).toMatchObject({ type: "note", content: "Revisar esta sección antes de enviar.", color: "#fef3c7" });
    expect(sourceBytes).toEqual(sourceBefore);
    expect(reopened.getPageCount()).toBe(1);
    expect(output.byteLength).toBeGreaterThan(sourceBytes.byteLength);
  });
});

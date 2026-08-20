import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { exportPdfProject } from "@/core/pdf/PdfWriter";
import { createStampObject, STAMP_PRESETS } from "@/features/editor/utils/editorObjects";
import type { PDFPageModel, PDFProject, StampKind } from "@/types/pdf";

const page: PDFPageModel = {
  id: "page-1",
  sourcePageIndex: 0,
  size: { width: 320, height: 400 },
  rotation: 0
};

describe("visual stamps", () => {
  it("creates each supported Spanish label as a serializable local overlay", () => {
    const labels: Record<StampKind, string> = {
      approved: "APROBADO",
      reviewed: "REVISADO",
      confidential: "CONFIDENCIAL",
      draft: "BORRADOR",
      final: "FINAL",
      paid: "PAGADO",
      rejected: "RECHAZADO"
    };

    for (const [kind, label] of Object.entries(labels) as Array<[StampKind, string]>) {
      const stamp = createStampObject(page, kind);
      expect(stamp.stamp.label).toBe(label);
      expect(stamp).toMatchObject({
        pageId: page.id,
        type: "stamp",
        stamp: { kind, ...STAMP_PRESETS[kind] },
        signature: { kind: "typed", text: label }
      });
    }
  });

  it("flattens a stamp into a valid exported PDF without creating a native annotation", async () => {
    const source = await PDFDocument.create();
    source.addPage([320, 400]);
    const sourceBytes = await source.save({ addDefaultPage: false });
    const sourceBefore = sourceBytes.slice();
    const stamp = createStampObject(page, "confidential");
    const project: PDFProject = {
      id: "stamp-project",
      source: { id: "source-1", name: "source.pdf", mimeType: "application/pdf", byteLength: sourceBytes.byteLength },
      pages: [page],
      overlays: [stamp],
      metadata: {},
      history: { undoDepth: 0, redoDepth: 0, capacity: 100 },
      createdAt: 1,
      updatedAt: 1
    };

    const output = await exportPdfProject({ project, sourceBytes, assets: new Map() });
    const reopened = await PDFDocument.load(output);
    const outputPage = reopened.getPage(0);

    expect(sourceBytes).toEqual(sourceBefore);
    expect(reopened.getPageCount()).toBe(1);
    expect(outputPage.node.Contents()).toBeDefined();
    expect(outputPage.node.Annots()?.size() ?? 0).toBe(0);
    expect(output.byteLength).toBeGreaterThan(sourceBytes.byteLength);
  });
});

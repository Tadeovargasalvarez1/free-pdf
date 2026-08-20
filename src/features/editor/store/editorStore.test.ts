import { describe, expect, afterEach, it } from "vitest";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { useEditorStore } from "@/features/editor/store/editorStore";
import type { PDFProject, TextEditorObject } from "@/types/pdf";

function createProject(): PDFProject {
  return {
    id: "project",
    source: { id: "source", name: "source.pdf", mimeType: "application/pdf", byteLength: 1 },
    pages: [
      { id: "one", sourcePageIndex: 0, size: { width: 300, height: 400 }, rotation: 0 },
      { id: "two", sourcePageIndex: 1, size: { width: 300, height: 400 }, rotation: 0 },
      { id: "three", sourcePageIndex: 2, size: { width: 300, height: 400 }, rotation: 0 }
    ],
    overlays: [],
    metadata: {},
    history: { undoDepth: 0, redoDepth: 0, capacity: 100 },
    createdAt: 1,
    updatedAt: 1
  };
}

describe("editor page operations", () => {
  afterEach(() => useEditorStore.getState().reset());

  it("reorders, rotates, duplicates and deletes pages while preserving undo/redo", () => {
    const document = {} as PDFDocumentProxy;
    useEditorStore.getState().setOpenedPdf({
      project: createProject(),
      sourceBytes: new Uint8Array([1]),
      document
    });

    useEditorStore.getState().reorderPage("three", "one");
    expect(useEditorStore.getState().project?.pages.map((page) => page.sourcePageIndex)).toEqual([2, 0, 1]);

    useEditorStore.getState().rotatePage("one", 90);
    expect(useEditorStore.getState().project?.pages.find((page) => page.id === "one")?.rotation).toBe(90);

    useEditorStore.getState().duplicatePage("one");
    expect(useEditorStore.getState().project?.pages).toHaveLength(4);

    expect(useEditorStore.getState().deletePage("two")).toBe(true);
    expect(useEditorStore.getState().project?.pages).toHaveLength(3);

    useEditorStore.getState().undo();
    expect(useEditorStore.getState().project?.pages).toHaveLength(4);
    useEditorStore.getState().redo();
    expect(useEditorStore.getState().project?.pages).toHaveLength(3);
  });

  it("refuses to remove the final remaining page", () => {
    const project = createProject();
    project.pages = [project.pages[0]!];
    useEditorStore.getState().setOpenedPdf({ project, sourceBytes: new Uint8Array([1]), document: {} as PDFDocumentProxy });

    expect(useEditorStore.getState().deletePage("one")).toBe(false);
    expect(useEditorStore.getState().project?.pages).toHaveLength(1);
  });

  it("stores a valid CropBox as an undoable page operation", () => {
    useEditorStore.getState().setOpenedPdf({
      project: createProject(),
      sourceBytes: new Uint8Array([1]),
      document: {} as PDFDocumentProxy
    });

    useEditorStore.getState().cropPage("one", { x: 20, y: 30, width: 220, height: 310 });
    expect(useEditorStore.getState().project?.pages.find((page) => page.id === "one")?.cropBox)
      .toEqual({ x: 20, y: 30, width: 220, height: 310 });

    useEditorStore.getState().undo();
    expect(useEditorStore.getState().project?.pages.find((page) => page.id === "one")?.cropBox).toBeUndefined();
  });

  it("adds a related overlay batch as one undoable operation", () => {
    useEditorStore.getState().setOpenedPdf({
      project: createProject(),
      sourceBytes: new Uint8Array([1]),
      document: {} as PDFDocumentProxy
    });
    const objects = ["one", "two", "three"].map((pageId, index): TextEditorObject => ({
      id: `number-${index}`,
      pageId,
      type: "text",
      x: 20,
      y: 20,
      width: 30,
      height: 14,
      rotation: 0,
      opacity: 1,
      zIndex: index,
      text: String(index + 1),
      fontFamily: "Helvetica",
      fontSize: 11,
      color: "#111827",
      fontWeight: "normal",
      fontStyle: "normal",
      textDecoration: "none",
      textAlign: "left",
      lineHeight: 13,
      letterSpacing: 0
    }));

    useEditorStore.getState().addObjects(objects);
    expect(useEditorStore.getState().project?.overlays).toHaveLength(3);
    expect(useEditorStore.getState().project?.history.undoDepth).toBe(1);

    useEditorStore.getState().undo();
    expect(useEditorStore.getState().project?.overlays).toHaveLength(0);
  });

  it("keeps metadata edits undoable and independent from caller-owned keyword arrays", () => {
    useEditorStore.getState().setOpenedPdf({
      project: createProject(),
      sourceBytes: new Uint8Array([1]),
      document: {} as PDFDocumentProxy
    });
    const keywords = ["privado", "local"];
    useEditorStore.getState().updateMetadata({ title: "Contrato", keywords });
    keywords.push("no debería filtrarse");

    expect(useEditorStore.getState().project?.metadata).toEqual({ title: "Contrato", keywords: ["privado", "local"] });
    useEditorStore.getState().undo();
    expect(useEditorStore.getState().project?.metadata).toEqual({});
  });
});

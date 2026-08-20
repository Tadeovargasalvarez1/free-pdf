import { describe, expect, it } from "vitest";
import {
  createPageNumberObject,
  createSignatureImageObject,
  createWatermarkObject
} from "@/features/editor/utils/editorObjects";
import type { PDFPageModel } from "@/types/pdf";

const page: PDFPageModel = {
  id: "page-1",
  sourcePageIndex: 0,
  size: { width: 600, height: 800 },
  cropBox: { x: 20, y: 30, width: 500, height: 700 },
  rotation: 0
};

describe("document overlay object factories", () => {
  it("places a centered page number within the visible crop bounds", () => {
    const object = createPageNumberObject(page, "page-number-of-total", {
      pageIndex: 2,
      pageCount: 8,
      startNumber: 1,
      position: "bottom-center",
      margin: 28,
      fontSize: 11,
      color: "#172033"
    });

    expect(object.text).toBe("Página 3 de 8");
    expect(object.pageId).toBe(page.id);
    expect(object.x).toBeGreaterThanOrEqual(page.cropBox!.x);
    expect(object.x + object.width).toBeLessThanOrEqual(page.cropBox!.x + page.cropBox!.width);
    expect(object.y).toBe(page.cropBox!.y + 28);
  });

  it("creates a low-opacity watermark centered in the visible page", () => {
    const object = createWatermarkObject(page, {
      text: "BORRADOR",
      fontSize: 44,
      color: "#64748b",
      opacity: 0.22,
      rotation: -35
    });

    expect(object.text).toBe("BORRADOR");
    expect(object.opacity).toBe(0.22);
    expect(object.rotation).toBe(-35);
    expect(object.x).toBeGreaterThan(page.cropBox!.x);
    expect(object.y).toBeGreaterThan(page.cropBox!.y);
  });

  it("creates an image-backed visual signature inside the visible page", () => {
    const object = createSignatureImageObject(page, {
      id: "asset-1",
      name: "signature.png",
      mimeType: "image/png",
      dataUrl: "data:image/png;base64,",
      width: 640,
      height: 180
    });

    expect(object.type).toBe("signature");
    expect(object.signature).toMatchObject({ kind: "image", assetId: "asset-1", mimeType: "image/png" });
    expect(object.width).toBeLessThanOrEqual(page.cropBox!.width * 0.48);
    expect(object.x).toBeGreaterThanOrEqual(page.cropBox!.x);
    expect(object.y).toBeGreaterThanOrEqual(page.cropBox!.y);
  });
});
